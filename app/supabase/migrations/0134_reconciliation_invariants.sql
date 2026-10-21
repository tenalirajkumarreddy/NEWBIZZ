-- =====================================================================
-- 0134_reconciliation_invariants.sql
--
-- The audit's central lesson: every defect it found was a place where two
-- books of the same money drifted apart silently — AR GL vs the invoice
-- subledger, the subledger vs the customer ledger, receipts vs their
-- allocations, stock carrying value vs the inventory control accounts.
--
-- 0131–0133 stop new drift. This migration makes drift *visible*: one
-- function that compares the books and says which one is wrong, runnable
-- from the dashboard, a cron, or CI (`app/supabase/checks/invariants.sql`).
--
-- Nothing here writes. Every check is read-only and safe to run on prod.
-- =====================================================================

create or replace function public.reconciliation_checks()
returns table (
  check_name   text,
  expected     numeric,
  actual       numeric,
  difference   numeric,
  status       text,
  detail       text
)
language sql
stable
security definer
set search_path = public
as $$
with
ar_gl as (
  select coalesce(sum(l.debit - l.credit), 0)::numeric(14,2) as v
    from journal_lines l
    join journal_entries e on e.id = l.entry_id
    join chart_of_accounts a on a.id = l.account_id
   where a.code = '1130' and e.status = 'posted'
),
invoice_due as (
  select coalesce(sum(public.invoice_outstanding(i.id)), 0)::numeric(14,2) as v
    from invoices i
   where i.status in ('posted','part_paid')
),
delivery_only as (
  -- A delivered challan counts only while its order has no live invoice:
  -- this is the value that used to be invisible to invoice-based reports.
  select coalesce(sum(
           coalesce((select sum(jl.debit) from journal_lines jl
                      join chart_of_accounts a on a.id = jl.account_id
                      where jl.entry_id = dc.journal_entry_id and a.code = '1130'), 0)
         - coalesce((select abs(jl2.credit) from journal_lines jl2
                      join chart_of_accounts a2 on a2.id = jl2.account_id
                      where jl2.entry_id = dc.journal_entry_id and a2.code = '5700'), 0)
         ), 0)::numeric(14,2) as v
    from delivery_challans dc
    join sales_orders so on so.id = dc.order_id
   where dc.status = 'delivered'
     and so.status = 'fulfilled'
     and dc.journal_entry_id is not null
     and not exists (select 1 from invoices i
                      where i.order_id = dc.order_id and i.status <> 'void')
),
advance_total as (
  select coalesce(sum(l.credit - l.debit), 0)::numeric(14,2) as v
    from journal_lines l
    join journal_entries e on e.id = l.entry_id
    join chart_of_accounts a on a.id = l.account_id
   where a.code = '2100' and e.status = 'posted'
),
ledger_total as (
  -- Latest running balance per customer; the ledger is a net position, so it
  -- must equal AR less money held on account.
  select coalesce(sum(b.balance_after), 0)::numeric(14,2) as v
    from (
      select distinct on (customer_id) customer_id, balance_after
        from customer_ledger
       order by customer_id, seq desc
    ) b
),
alloc_rows as (
  select coalesce(sum(a.amount), 0)::numeric(14,2) as v
    from receipt_allocations a
    join customer_receipts r on r.id = a.receipt_id
   where r.status = 'posted'
),
alloc_marked as (
  select coalesce(sum(r.allocated_amount), 0)::numeric(14,2) as v
    from customer_receipts r
   where r.status = 'posted'
),
stock_v as (
  select coalesce(sum(stock_carrying_value), 0)::numeric(14,2) as carry,
         coalesce(sum(ledger_value), 0)::numeric(14,2) as gl
    from stock_value_reconcile
),
voided_invoices as (
  select count(*)::numeric as v from invoices where status = 'void'
),
subledger as (
  select (invoice_due.v + delivery_only.v)::numeric(14,2) as v from invoice_due, delivery_only
)
select *
from (
  select 'AR GL vs invoice + delivery subledger'::text as check_name,
         ar_gl.v as expected,
         subledger.v as actual,
         round(ar_gl.v - subledger.v, 2) as difference,
         case when abs(ar_gl.v - subledger.v) <= 0.05 then 'ok' else 'drift' end as status,
         format('GL 1130 %s = invoices due %s + delivery-only %s',
                ar_gl.v, invoice_due.v, delivery_only.v) as detail
    from ar_gl, subledger, invoice_due, delivery_only

  union all
  select 'AR less customer advances vs customer ledger',
         round(ar_gl.v - advance_total.v, 2),
         ledger_total.v,
         round((ar_gl.v - advance_total.v) - ledger_total.v, 2),
         case when abs((ar_gl.v - advance_total.v) - ledger_total.v) <= 0.05 then 'ok' else 'drift' end,
         format('AR %s − advances %s vs latest ledger sum %s (rebuild_customer_ledger repairs this side)',
                ar_gl.v, advance_total.v, ledger_total.v)
    from ar_gl, advance_total, ledger_total

  union all
  select 'Receipt allocations vs receipts.allocated_amount',
         alloc_rows.v,
         alloc_marked.v,
         round(alloc_rows.v - alloc_marked.v, 2),
         case when abs(alloc_rows.v - alloc_marked.v) <= 0.05 then 'ok' else 'drift' end,
         'allocated_amount is a read-model of receipt_allocations'
    from alloc_rows, alloc_marked

  union all
  select 'Stock carrying value vs inventory GL',
         stock_v.carry,
         stock_v.gl,
         round(stock_v.carry - stock_v.gl, 2),
         case when abs(stock_v.carry - stock_v.gl) <= 0.05 then 'ok' else 'drift' end,
         'qty_on_hand × avg_cost vs accounts 1210/1220/1230/1240'
    from stock_v
) t
$$;

comment on function reconciliation_checks() is
  'Read-only reconciliation of AR GL, invoice subledger, delivery-only receivables, advances, customer ledger, receipt allocations and stock value. Any status = ''drift'' means two books disagree.';

-- ---------------------------------------------------------------------
-- Which customer is out of balance, and by how much?
-- ---------------------------------------------------------------------
create or replace function public.ar_drift_by_customer(p_limit int default 50)
returns table (
  customer_id  uuid,
  customer     text,
  gl_balance   numeric,
  subledger    numeric,
  difference   numeric
)
language sql
stable
security definer
set search_path = public
as $$
with gl as (
  select l.party_id as customer_id,
         sum(l.debit - l.credit)::numeric(14,2) as v
    from journal_lines l
    join journal_entries e on e.id = l.entry_id
    join chart_of_accounts a on a.id = l.account_id
   where a.code = '1130'
     and e.status = 'posted'
     and l.party_type = 'customer'
     and l.party_id is not null
   group by l.party_id
),
inv as (
  select i.customer_id,
         sum(public.invoice_outstanding(i.id))::numeric(14,2) as v
    from invoices i
   where i.status in ('posted','part_paid')
   group by i.customer_id
),
del as (
  select so.customer_id,
         sum(
           coalesce((select sum(jl.debit) from journal_lines jl
                      join chart_of_accounts a on a.id = jl.account_id
                      where jl.entry_id = dc.journal_entry_id and a.code = '1130'), 0)
         - coalesce((select abs(jl2.credit) from journal_lines jl2
                      join chart_of_accounts a2 on a2.id = jl2.account_id
                      where jl2.entry_id = dc.journal_entry_id and a2.code = '5700'), 0)
         )::numeric(14,2) as v
    from delivery_challans dc
    join sales_orders so on so.id = dc.order_id
   where dc.status = 'delivered'
     and so.status = 'fulfilled'
     and dc.journal_entry_id is not null
     and not exists (select 1 from invoices i
                      where i.order_id = dc.order_id and i.status <> 'void')
   group by so.customer_id
)
select c.id,
       c.name,
       coalesce(gl.v, 0),
       coalesce(inv.v, 0) + coalesce(del.v, 0),
       round(coalesce(gl.v, 0) - (coalesce(inv.v, 0) + coalesce(del.v, 0)), 2)
  from customers c
  left join gl  on gl.customer_id  = c.id
  left join inv on inv.customer_id = c.id
  left join del on del.customer_id = c.id
 where abs(coalesce(gl.v, 0) - (coalesce(inv.v, 0) + coalesce(del.v, 0))) > 0.05
 order by abs(coalesce(gl.v, 0) - (coalesce(inv.v, 0) + coalesce(del.v, 0))) desc
 limit greatest(coalesce(p_limit, 50), 1);
$$;

comment on function ar_drift_by_customer(int) is
  'Customers whose AR GL balance disagrees with what their invoices (plus delivery-only receivables) say. Empty = the subledger and the GL agree.';

-- ---------------------------------------------------------------------
-- Grants: read-only, but it reads the whole ledger — staff only.
-- ---------------------------------------------------------------------
revoke all on function public.reconciliation_checks() from public, anon;
grant execute on function public.reconciliation_checks() to authenticated, service_role;

revoke all on function public.ar_drift_by_customer(int) from public, anon;
grant execute on function public.ar_drift_by_customer(int) to authenticated, service_role;
