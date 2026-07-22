-- =====================================================================
-- 0024_targets_commissions.sql  ·  Phase 4 — Sales targets & commissions  (§7.4)
--
-- Measure and reward the field force. Targets are a MASTER input; commissions
-- are computed from ACTUAL journals (revenue / collections) — never from a
-- cached figure (Invariant 1). A commission run posts:
--   Dr 5530 Selling & Distribution (commission)   total
--      Cr 2135 Commission Payable                 total       party = user
-- and is later paid via the payroll/expense flow (Dr 2135 / Cr cash|bank).
--
-- basis:
--   revenue    — sum of posted sales (income 4100/4110) attributed to the user
--   collection — sum of posted receipts (credits to 1130) attributed to the user
--   cases      — sum of invoice_line qty on the user's invoices
-- Attribution uses invoices.created_by / customer_receipts.collected_by (the
-- user who booked the document). tier_json optional: [{min, rate}] highest-met.
-- =====================================================================

-- Commission Payable (liability, parent 2100 Current Liabilities)
insert into chart_of_accounts (code, name, type, normal_side, is_postable, control_of, is_system)
values ('2135','Commission Payable','liability','credit', true, 'user_cash', true)
on conflict (code) do nothing;
update chart_of_accounts c set parent_id = p.id
  from chart_of_accounts p where c.code = '2135' and p.code = '2100' and c.parent_id is null;

create type commission_basis  as enum ('revenue','cases','collection');
create type commission_status as enum ('draft','computed','posted','paid');

-- ---------------------------------------------------------------------
-- sales_targets — a monthly target per user (MASTER).
-- ---------------------------------------------------------------------
create table sales_targets (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id),
  period_month  date not null,                       -- first of month
  target_amount numeric(14,2) not null default 0,
  target_cases  numeric(14,3) not null default 0,
  created_by    uuid references users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz,
  unique (user_id, period_month)
);
comment on column sales_targets.period_month is 'First day of the target month (IST business month).';

-- ---------------------------------------------------------------------
-- commission_rules — how commission is earned (per role OR per user).
-- ---------------------------------------------------------------------
create table commission_rules (
  id          uuid primary key default gen_random_uuid(),
  role_code   text references roles(code),           -- either a role...
  user_id     uuid references users(id),             -- ...or a specific user
  basis       commission_basis not null default 'revenue',
  rate        numeric(6,3) not null default 0,        -- percent
  threshold   numeric(14,2) not null default 0,       -- min base before commission applies
  tier_json   jsonb not null default '[]'::jsonb,
  status      text not null default 'active',
  created_by  uuid references users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz,
  check (role_code is not null or user_id is not null)
);

-- ---------------------------------------------------------------------
-- commission_runs / commission_lines — a computed batch for a month.
-- ---------------------------------------------------------------------
create table commission_runs (
  id            uuid primary key default gen_random_uuid(),
  period_month  date not null unique,                 -- one run per month
  status        commission_status not null default 'draft',
  total_amount  numeric(14,2) not null default 0,
  computed_at   timestamptz,
  journal_entry_id uuid references journal_entries(id),
  created_by    uuid references users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz
);

create table commission_lines (
  id            uuid primary key default gen_random_uuid(),
  run_id        uuid not null references commission_runs(id) on delete cascade,
  user_id       uuid not null references users(id),
  basis         commission_basis not null,
  base_amount   numeric(14,2) not null default 0,
  rate          numeric(6,3) not null default 0,
  commission_amount numeric(14,2) not null default 0,
  created_at    timestamptz not null default now(),
  unique (run_id, user_id)
);
create index commission_lines_run_idx on commission_lines (run_id);

create trigger sales_targets_touch    before update on sales_targets    for each row execute function touch_updated_at();
create trigger commission_rules_touch before update on commission_rules for each row execute function touch_updated_at();
create trigger commission_runs_touch  before update on commission_runs  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------
-- _user_commission_base(user, basis, from, to) -> numeric  [internal]
-- Pulls the ACTUAL base for a user over a window straight from journals/docs.
-- ---------------------------------------------------------------------
create or replace function _user_commission_base(
  p_user uuid, p_basis commission_basis, p_from date, p_to date)
returns numeric
language sql stable
set search_path = public
as $$
  select case p_basis
    when 'revenue' then coalesce((
      select sum(il.taxable_amount)
        from invoices i join invoice_lines il on il.invoice_id = i.id
       where i.status = 'posted' and i.created_by = p_user
         and i.invoice_date between p_from and p_to), 0)
    when 'cases' then coalesce((
      select sum(il.qty)
        from invoices i join invoice_lines il on il.invoice_id = i.id
       where i.status = 'posted' and i.created_by = p_user
         and i.invoice_date between p_from and p_to), 0)
    when 'collection' then coalesce((
      select sum(cr.amount)
        from customer_receipts cr
       where cr.status = 'posted' and cr.collected_by = p_user
         and cr.receipt_date between p_from and p_to), 0)
  end;
$$;

-- ---------------------------------------------------------------------
-- compute_commissions(period_month) -> run id
-- Builds (or rebuilds) a DRAFT run: one line per user matched by a commission
-- rule (user-specific rule wins over role rule), base pulled from journals,
-- tiered rate applied above threshold. Does NOT post to the ledger.
-- ---------------------------------------------------------------------
create or replace function compute_commissions(p_month date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from   date := date_trunc('month', p_month)::date;
  v_to     date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  v_run    uuid;
  v_rule   record;
  v_base   numeric(14,2);
  v_rate   numeric(6,3);
  v_tier   jsonb;
  v_amt    numeric(14,2);
  v_total  numeric(14,2) := 0;
  v_actor  uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
begin
  -- fresh draft (discard a prior un-posted draft for the month)
  delete from commission_runs where period_month = v_from and status = 'draft';
  insert into commission_runs (period_month, status, created_by)
    values (v_from, 'draft', v_actor) returning id into v_run;

  -- resolve one effective rule per user: user-specific first, else role rule
  for v_rule in
    with active_users as (
      select u.id as user_id, ur.role_id, ro.code as role_code
        from users u
        join user_roles ur on ur.user_id = u.id
        join roles ro on ro.id = ur.role_id
       where u.status = 'active'
    ),
    per_user as (
      select au.user_id,
             coalesce(cu.basis, cr.basis)         as basis,
             coalesce(cu.rate,  cr.rate)          as rate,
             coalesce(cu.threshold, cr.threshold) as threshold,
             coalesce(cu.tier_json, cr.tier_json) as tier_json,
             (cu.id is not null)                  as is_user_rule
        from active_users au
        left join commission_rules cu
          on cu.user_id = au.user_id and cu.status = 'active'
        left join commission_rules cr
          on cr.role_code = au.role_code and cr.user_id is null and cr.status = 'active'
       where cu.id is not null or cr.id is not null
    )
    select distinct on (user_id) user_id, basis, rate, threshold, tier_json
      from per_user
     order by user_id, is_user_rule desc
  loop
    v_base := _user_commission_base(v_rule.user_id, v_rule.basis, v_from, v_to);
    if v_base <= v_rule.threshold then continue; end if;

    -- tier: highest min met wins; else flat rate
    v_rate := v_rule.rate;
    for v_tier in select * from jsonb_array_elements(v_rule.tier_json) loop
      if v_base >= (v_tier->>'min')::numeric and (v_tier->>'rate')::numeric >= v_rate then
        v_rate := (v_tier->>'rate')::numeric;
      end if;
    end loop;

    v_amt := round(v_base * v_rate / 100.0, 2);
    if v_amt <= 0 then continue; end if;

    insert into commission_lines (run_id, user_id, basis, base_amount, rate, commission_amount)
    values (v_run, v_rule.user_id, v_rule.basis, v_base, v_rate, v_amt);
    v_total := v_total + v_amt;
  end loop;

  update commission_runs
     set status = 'computed', total_amount = v_total, computed_at = now()
   where id = v_run;

  perform write_audit('update','commission_runs', v_run::text,
            format('Commissions computed for %s: %s total', to_char(v_from,'YYYY-MM'), v_total),
            jsonb_build_object('total', v_total), v_actor);
  return v_run;
end $$;
comment on function compute_commissions is 'Compute a DRAFT commission run from actual journals; user rule beats role rule. §7.4.';

-- ---------------------------------------------------------------------
-- post_commission_run(run_id) -> journal entry id
-- Posts the computed run: Dr 5530 Selling & Distribution / Cr 2135 Commission
-- Payable (one credit line per user, party = user). Paid later via cash/bank.
-- ---------------------------------------------------------------------
create or replace function post_commission_run(p_run uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run    commission_runs;
  v_lines  jsonb := '[]'::jsonb;
  v_line   record;
  v_je     uuid;
  v_date   date;
  v_actor  uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
begin
  select * into v_run from commission_runs where id = p_run;
  if not found then raise exception 'post_commission_run: unknown run %', p_run; end if;
  if v_run.status = 'posted' or v_run.journal_entry_id is not null then
    raise exception 'post_commission_run: run % already posted', p_run;
  end if;
  if v_run.total_amount <= 0 then
    raise exception 'post_commission_run: nothing to post for run %', p_run;
  end if;
  v_date := (date_trunc('month', v_run.period_month) + interval '1 month - 1 day')::date;

  -- debit: single Selling & Distribution line for the total
  v_lines := v_lines || jsonb_build_object('account_code','5530','debit', v_run.total_amount, 'credit', 0);
  -- credit: one Commission Payable line per user (party attribution)
  for v_line in select user_id, commission_amount from commission_lines where run_id = p_run loop
    v_lines := v_lines || jsonb_build_object('account_code','2135','debit',0,
                 'credit', v_line.commission_amount,
                 'party_type','user','party_id', v_line.user_id::text);
  end loop;

  v_je := post_journal(
    jsonb_build_object('entry_date', v_date, 'doc_type','voucher',
                       'source','commission_run', 'source_id', p_run::text,
                       'narration', format('Commissions %s', to_char(v_run.period_month,'YYYY-MM'))),
    v_lines);

  update commission_runs set status = 'posted', journal_entry_id = v_je where id = p_run;

  perform write_audit('post','commission_runs', p_run::text,
            format('Commission run posted: %s', v_run.total_amount),
            jsonb_build_object('journal_entry_id', v_je, 'total', v_run.total_amount), v_actor);
  return v_je;
end $$;
comment on function post_commission_run is 'Post commissions: Dr 5530 / Cr 2135 per user. Paid later via cash/bank. §7.4.';

-- ---------------------------------------------------------------------
-- target_achievement(user, month) -> table (target, achieved_amount, pct)
-- Reporting helper: target vs actual revenue for a user in a month.
-- ---------------------------------------------------------------------
create or replace function target_achievement(p_user uuid, p_month date)
returns table (target_amount numeric, achieved_amount numeric, pct numeric)
language sql stable
set search_path = public
as $$
  with w as (
    select date_trunc('month', p_month)::date as f,
           (date_trunc('month', p_month) + interval '1 month - 1 day')::date as t
  )
  select coalesce(st.target_amount,0) as target_amount,
         _user_commission_base(p_user,'revenue', w.f, w.t) as achieved_amount,
         case when coalesce(st.target_amount,0) > 0
              then round(_user_commission_base(p_user,'revenue', w.f, w.t) / st.target_amount * 100, 2)
              else null end as pct
    from w
    left join sales_targets st on st.user_id = p_user and st.period_month = w.f;
$$;

-- ---------------------------------------------------------------------
-- RLS. Targets/rules/runs are HR/accounting data — read gated by hr.view
-- (line-level pay-adjacent info), managed with accounting.manage. Posting via
-- definer RPC only (no write policy on runs/lines).
-- ---------------------------------------------------------------------
alter table sales_targets    enable row level security;
alter table commission_rules enable row level security;
alter table commission_runs  enable row level security;
alter table commission_lines enable row level security;

create policy read_targets on sales_targets    for select to authenticated
  using (has_permission('hr.view') or user_id = current_app_user());
create policy read_rules   on commission_rules for select to authenticated
  using (has_permission('hr.view'));
create policy read_runs    on commission_runs  for select to authenticated
  using (has_permission('hr.view'));
create policy read_lines   on commission_lines for select to authenticated
  using (has_permission('hr.view') or user_id = current_app_user());

create policy manage_targets on sales_targets    for all to authenticated
  using (has_permission('accounting.manage')) with check (has_permission('accounting.manage'));
create policy manage_rules   on commission_rules for all to authenticated
  using (has_permission('accounting.manage')) with check (has_permission('accounting.manage'));
-- commission_runs / commission_lines: definer-only writes.
