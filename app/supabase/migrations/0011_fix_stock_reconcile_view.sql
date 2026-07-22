-- =====================================================================
-- 0011_fix_stock_reconcile_view.sql
-- Fix caught by the live Phase-1 smoke test: the original stock_value_reconcile
-- view (in 0007) joined stock to journal_lines directly, fanning out the
-- carrying value by the number of ledger lines per account (e.g. 190*85 counted
-- 3x). Aggregate each side independently in CTEs, then full-outer-join & compare.
-- Base file 0007_stock.sql was also corrected for fresh installs.
-- =====================================================================
create or replace view stock_value_reconcile as
with carry as (
  select inventory_account_for(i.type) as inv_account,
         round(sum(s.qty_on_hand * s.avg_cost), 2) as stock_carrying_value
    from stock s join items i on i.id = s.item_id
   group by inventory_account_for(i.type)
),
ledger as (
  select a.code as inv_account, round(sum(l.debit - l.credit), 2) as ledger_value
    from journal_lines l join chart_of_accounts a on a.id = l.account_id
   where a.code in ('1210','1220','1230','1240')
   group by a.code
)
select coalesce(c.inv_account, g.inv_account)          as inv_account,
       coalesce(c.stock_carrying_value, 0)             as stock_carrying_value,
       coalesce(g.ledger_value, 0)                     as ledger_value,
       coalesce(c.stock_carrying_value,0) - coalesce(g.ledger_value,0) as difference
  from carry c full outer join ledger g on g.inv_account = c.inv_account;
comment on view stock_value_reconcile is 'difference should be ~0: WAC carrying value vs inventory control accounts. Sides aggregated separately to avoid cross-join fan-out.';
