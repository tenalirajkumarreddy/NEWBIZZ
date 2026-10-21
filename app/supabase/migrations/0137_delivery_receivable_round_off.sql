-- =====================================================================
-- 0137_delivery_receivable_round_off.sql
--
-- Found by running 0134's reconciliation_checks() on NEWBIZZ the day it was
-- deployed: "AR GL vs invoice + delivery subledger" reported drift 0.16.
--
-- The books were right and the *formula* was wrong. A delivery journal posts
--
--     Dr 1130 AR        340.00
--     Cr 4100 revenue   288.00
--     Cr 2120 GST        51.84
--     Cr 5700 round-off   0.16
--
-- so the receivable is the full 1130 debit (340.00). 0131 and 0134 instead
-- computed `1130 debit − abs(5700 credit)`, treating the round-off as if it
-- reduced what the customer owes. It does not: 5700 is a revenue-side gain
-- that exists precisely because AR was rounded up.
--
-- Two consequences, both real:
--   * reconciliation_checks() reported a false 0.16 drift on a correct ledger;
--   * rebuild_customer_ledger() would have written a 0.16-low sale row, so
--     rebuilding the ledger (a documented repair operation) would have
--     introduced the drift it is supposed to remove.
--
-- Fix: the delivery's receivable, in the check, the per-customer drill-down
-- and the rebuild, is the 1130 debit.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. reconciliation_checks — delivery_only is the AR debit
-- ---------------------------------------------------------------------
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
  -- A delivered challan counts only while its order has no live invoice.
  -- The receivable is the AR debit: round-off (5700) is revenue-side and
  -- does not reduce what the customer owes.
  select coalesce(sum(
           coalesce((select sum(jl.debit) from journal_lines jl
                      join chart_of_accounts a on a.id = jl.account_id
                      where jl.entry_id = dc.journal_entry_id and a.code = '1130'), 0)
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
subledger as (
  select (invoice_due.v + delivery_only.v)::numeric(14,2) as v from invoice_due, delivery_only
)
select * from (
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
  'Read-only reconciliation of AR GL, invoice subledger, delivery-only receivables, advances, customer ledger, receipt allocations and stock value. A delivery receivable is the full 1130 debit; round-off (5700) is revenue-side.';

-- ---------------------------------------------------------------------
-- 2. ar_drift_by_customer — same correction
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
-- 3. rebuild_customer_ledger — the delivery row is the AR debit
--    Otherwise a ledger rebuild introduces the 0.16 it is meant to repair.
-- ---------------------------------------------------------------------
create or replace function public.rebuild_customer_ledger(
  p_customer_id uuid default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec record;
  v_bal numeric(14,2) := 0;
  v_count int := 0;
  v_scope text;
begin
  if p_customer_id is not null then
    delete from customer_ledger where customer_id = p_customer_id;
    v_scope := 'customer ' || p_customer_id;
  else
    delete from customer_ledger;
    v_scope := 'all customers';
  end if;

  for v_rec in (
    select 'sale' as txn_type, i.id as ref_id, 'invoices' as ref_type,
           i.grand_total as amount, i.customer_id, i.store_id,
           coalesce(i.invoice_date::timestamptz, i.created_at) as txn_time
      from invoices i
     where (p_customer_id is null or i.customer_id = p_customer_id)
       and i.status <> 'void'
       and i.grand_total > 0
    union all
    select 'sale' as txn_type, dc.id as ref_id, 'delivery_challans' as ref_type,
           coalesce((
             select sum(jl.debit)
               from journal_lines jl
               join chart_of_accounts a on a.id = jl.account_id
              where jl.entry_id = dc.journal_entry_id and a.code = '1130'
           ), 0) as amount,
           so.customer_id, so.store_id,
           coalesce(dc.delivered_at::timestamptz, dc.created_at) as txn_time
      from delivery_challans dc
      join sales_orders so on so.id = dc.order_id
     where (p_customer_id is null or so.customer_id = p_customer_id)
       and dc.status = 'delivered'
       and so.status = 'fulfilled'
       and dc.journal_entry_id is not null
       and not exists (
         select 1 from invoices i
          where i.order_id = dc.order_id and i.status <> 'void'
       )
    union all
    select 'payment' as txn_type, r.id as ref_id, 'customer_receipts' as ref_type,
           -r.amount as amount, r.customer_id, r.store_id,
           coalesce(r.receipt_date::timestamptz, r.created_at) as txn_time
      from customer_receipts r
     where (p_customer_id is null or r.customer_id = p_customer_id)
       and r.amount > 0
       and r.status = 'posted'
    union all
    select 'credit_note' as txn_type, cn.id as ref_id, 'credit_notes' as ref_type,
           -cn.amount as amount, cn.customer_id, cn.customer_store_id,
           cn.created_at as txn_time
      from credit_notes cn
     where (p_customer_id is null or cn.customer_id = p_customer_id)
       and cn.status = 'posted'
    order by txn_time, ref_id
  ) loop
    v_bal := v_bal + v_rec.amount;
    insert into customer_ledger (customer_store_id, customer_id, txn_type, reference_id,
                                 reference_type, amount, balance_after, created_at)
    values (v_rec.store_id, v_rec.customer_id, v_rec.txn_type, v_rec.ref_id,
            v_rec.ref_type, v_rec.amount, v_bal, v_rec.txn_time);
    v_count := v_count + 1;
  end loop;

  return format('Rebuilt customer_ledger for %s: %s entries, final balance %s', v_scope, v_count, v_bal);
end $$;

comment on function rebuild_customer_ledger is
  'Recomputed customer_ledger from non-void invoices, delivery-only challans (at the full 1130 debit), posted receipts and posted credit notes. Idempotent; service-role only.';

revoke all on function public.rebuild_customer_ledger(uuid) from public, anon, authenticated;
grant execute on function public.rebuild_customer_ledger(uuid) to service_role;
