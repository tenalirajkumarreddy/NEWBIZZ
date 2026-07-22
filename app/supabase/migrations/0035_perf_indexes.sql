-- =====================================================================
-- 0035_perf_indexes.sql   (Platform layer — Performance)
--
-- Two parts:
--   A. Hot-path indexes on FKs/columns that are actually queried (per §6.1).
--      We do NOT blanket-index every unindexed FK the advisor lists — cold or
--      empty tables get nothing until data justifies. Where the real predicate
--      is (branch, date) or (status), we build a composite, not a bare FK index.
--   B. Materialized read-models for heavy dashboards (trial balance, AR aging),
--      computed from the cached account_balances read-model / invoices — never
--      from raw journal_lines at query time (Invariant 5). Business dates use
--      IST (Invariant 9). MVs have no RLS, so they are kept internal and exposed
--      only through report.view_all-gated definer RPCs.
--
-- Idempotent (IF NOT EXISTS / OR REPLACE). Append-only. No transaction rows.
-- =====================================================================

-- =====================================================================
-- A. HOT-PATH INDEXES
-- =====================================================================

-- Sales pipeline: dashboards filter orders/invoices by branch + date, and by
-- customer for statements. Composite (branch_id, *_date) covers the common
-- "orders for this branch in this period" scan; customer index covers ledgers.
create index if not exists so_branch_date_idx   on public.sales_orders (branch_id, order_date);
create index if not exists so_customer_idx       on public.sales_orders (customer_id);
create index if not exists so_status_idx         on public.sales_orders (status);

create index if not exists inv_branch_date_idx   on public.invoices (branch_id, invoice_date);
create index if not exists inv_customer_idx       on public.invoices (customer_id);
create index if not exists inv_order_idx          on public.invoices (order_id);
-- Open-AR scans: only unpaid invoices matter, so a partial index stays tiny.
create index if not exists inv_open_idx           on public.invoices (customer_id)
  where amount_paid < grand_total;

-- Collections allocation reads by receipt (already have receipt fk?) — ensure
-- invoice-side lookup for "how much is allocated against this invoice".
create index if not exists ralloc_invoice_idx     on public.receipt_allocations (invoice_id);
create index if not exists customer_receipts_customer_idx on public.customer_receipts (customer_id);

-- Stock ledger: per-item-per-branch movement history (WAC audit trail) is the
-- hot read; move it to a composite with the time key for range scans.
create index if not exists stkledger_item_branch_time_idx
  on public.stock_ledger (item_id, branch_id, moved_at desc);

-- Field force live tracking (published to Realtime): sessions by route, visits
-- by session + agent.
create index if not exists route_sessions_route_idx on public.route_sessions (route_id);
create index if not exists route_sessions_agent_idx on public.route_sessions (agent_id);
create index if not exists visits_session_idx        on public.visits (route_session_id);
create index if not exists visits_agent_time_idx     on public.visits (agent_id, visited_at desc);

-- Notifications: the bell reads "my unread" constantly — a partial index on
-- (user_id) WHERE status='unread' keeps the badge query O(unread).
create index if not exists notif_user_unread_idx on public.notifications (user_id)
  where status = 'unread';

-- Access-control hot reads (has_permission runs on every RLS/RPC): make the
-- override lookup and role join index-covered.
create index if not exists upo_perm_idx on public.user_permission_overrides (permission);
create index if not exists user_roles_role_idx on public.user_roles (role_id);

-- =====================================================================
-- B. MATERIALIZED READ-MODELS
-- =====================================================================

-- ---------------------------------------------------------------------
-- B1. mv_trial_balance — per account per FY, from the cached balances.
--     debit/credit totals + signed balance. Unique index enables CONCURRENT
--     refresh. Reads account_balances (Invariant 5 read-model), never
--     journal_lines directly.
-- ---------------------------------------------------------------------
drop materialized view if exists public.mv_trial_balance cascade;
create materialized view public.mv_trial_balance as
  select ab.fy_id,
         ab.account_id,
         coa.code            as account_code,
         coa.name            as account_name,
         coa.type            as account_type,
         ab.debit_total,
         ab.credit_total,
         (ab.debit_total - ab.credit_total) as balance
    from public.account_balances ab
    join public.chart_of_accounts coa on coa.id = ab.account_id;

create unique index mv_trial_balance_pk on public.mv_trial_balance (fy_id, account_id);
create index mv_trial_balance_type_idx  on public.mv_trial_balance (account_type);

-- ---------------------------------------------------------------------
-- B2. mv_ar_aging — open invoice outstanding, aged in IST buckets.
--     Invoice-level (unique on invoice id) so CONCURRENT refresh works and the
--     dashboard can drill from bucket -> invoices.
-- ---------------------------------------------------------------------
drop materialized view if exists public.mv_ar_aging cascade;
create materialized view public.mv_ar_aging as
  with today_ist as (
    select (timezone('Asia/Kolkata', now()))::date as d
  )
  select i.id                              as invoice_id,
         i.invoice_no,
         i.customer_id,
         i.branch_id,
         i.invoice_date,
         i.grand_total,
         i.amount_paid,
         (i.grand_total - i.amount_paid)    as outstanding,
         ((select d from today_ist) - i.invoice_date) as age_days,
         case
           when ((select d from today_ist) - i.invoice_date) <= 30 then '0-30'
           when ((select d from today_ist) - i.invoice_date) <= 60 then '31-60'
           when ((select d from today_ist) - i.invoice_date) <= 90 then '61-90'
           else '90+'
         end                                as bucket
    from public.invoices i
   where i.grand_total > i.amount_paid;

create unique index mv_ar_aging_pk        on public.mv_ar_aging (invoice_id);
create index mv_ar_aging_customer_idx     on public.mv_ar_aging (customer_id);
create index mv_ar_aging_bucket_idx       on public.mv_ar_aging (bucket);

-- ---------------------------------------------------------------------
-- B3. refresh_read_models() — refresh both MVs. Call after posting or on a
--     schedule (cron/Edge). CONCURRENTLY so readers never block; safe because
--     each MV has a unique index and both are already populated on CREATE.
--     Gated to report.view_all (whoever can see reports can refresh them).
-- ---------------------------------------------------------------------
create or replace function public.refresh_read_models()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not has_permission('report.view_all') then
    raise exception 'refresh_read_models: not authorized (report.view_all required)';
  end if;
  refresh materialized view concurrently public.mv_trial_balance;
  refresh materialized view concurrently public.mv_ar_aging;
end $function$;

-- ---------------------------------------------------------------------
-- B4. Reader RPCs — MVs have no RLS, so expose them ONLY through definer RPCs
--     that enforce report.view_all. Direct table/MV access stays revoked.
-- ---------------------------------------------------------------------
create or replace function public.get_trial_balance(p_fy uuid)
returns setof public.mv_trial_balance
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not has_permission('report.view_all') then
    raise exception 'get_trial_balance: not authorized (report.view_all required)';
  end if;
  return query select * from mv_trial_balance where fy_id = p_fy order by account_code;
end $function$;

create or replace function public.get_ar_aging(p_branch uuid default null)
returns setof public.mv_ar_aging
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not has_permission('report.view_all') then
    raise exception 'get_ar_aging: not authorized (report.view_all required)';
  end if;
  return query
    select * from mv_ar_aging
     where p_branch is null or branch_id = p_branch
     order by age_days desc;
end $function$;

-- ---------------------------------------------------------------------
-- B5. Harden: MVs not client-readable; RPCs gated + granted to authenticated.
-- ---------------------------------------------------------------------
revoke all on public.mv_trial_balance from anon, authenticated, public;
revoke all on public.mv_ar_aging      from anon, authenticated, public;

alter function public.refresh_read_models()     set search_path = public;
alter function public.get_trial_balance(uuid)   set search_path = public;
alter function public.get_ar_aging(uuid)         set search_path = public;

revoke execute on function public.refresh_read_models()   from anon, public;
revoke execute on function public.get_trial_balance(uuid) from anon, public;
revoke execute on function public.get_ar_aging(uuid)      from anon, public;

grant  execute on function public.refresh_read_models()   to authenticated;
grant  execute on function public.get_trial_balance(uuid) to authenticated;
grant  execute on function public.get_ar_aging(uuid)      to authenticated;
