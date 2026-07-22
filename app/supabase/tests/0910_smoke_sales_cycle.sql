-- =====================================================================
-- tests/0910_smoke_sales_cycle.sql
-- Full Phase 1 cycle proof, rolled back at the end (no residue).
-- Requires: all migrations + seed 0100/0110/0120 applied.
--   receive opening stock -> place order -> invoice -> receipt -> assert.
-- Verifies: WAC stock out, GST split, AR down, trial balance stays 0,
--           inventory value ties to the ledger.
--   psql "$DATABASE_URL" -f tests/0910_smoke_sales_cycle.sql
-- =====================================================================
begin;

do $$
declare
  v_branch  uuid;
  v_item    uuid;   -- 500ML-CASE finished good
  v_store   uuid;
  v_cust    uuid;
  v_order   uuid;
  v_inv     uuid;
  v_rcpt    uuid;
  v_grand   numeric; v_taxable numeric; v_cgst numeric; v_sgst numeric;
  v_qty     numeric; v_avg numeric;
  v_out     numeric;
  v_recon   numeric;
begin
  select id into v_branch from branches where code='HO';
  select id into v_item   from items where sku='500ML-CASE';
  select id into v_store  from customer_stores where code='STR0001';
  select id into v_cust   from customers where code='CUST0001';

  ----------------------------------------------------------------------
  -- 1) Receive 100 cases @ ₹80 cost -> stock=100, avg=80. Then 100 @ ₹90
  --    -> WAC = (100*80 + 100*90)/200 = 85.
  ----------------------------------------------------------------------
  perform receive_opening_stock(v_item, v_branch, 100, 80, '2026-04-01');
  perform post_stock_move(v_item, v_branch, 'purchase_in', 100, 90, '3900', 'opening', null, '2026-04-02');
  select qty_on_hand, avg_cost into v_qty, v_avg from stock where item_id=v_item and branch_id=v_branch;
  if v_qty <> 200 or v_avg <> 85 then
    raise exception 'FAIL WAC expected qty200/avg85 got %/%', v_qty, v_avg;
  end if;
  raise notice 'OK  weighted-average cost = 85.0000 on 200 cases';
  perform assert_trial_balance();

  ----------------------------------------------------------------------
  -- 2) Place an order for 10 cases (wholesale @108) and invoice it.
  ----------------------------------------------------------------------
  v_order := place_order(
    jsonb_build_object('store_id', v_store::text, 'order_date','2026-04-10'),
    jsonb_build_array(jsonb_build_object('item_id', v_item::text, 'qty', 10)));
  raise notice 'OK  order placed %', v_order;

  v_inv := post_invoice_from_order(v_order, '2026-04-10');
  select grand_total, taxable_amount, cgst_amount, sgst_amount
    into v_grand, v_taxable, v_cgst, v_sgst from invoices where id = v_inv;
  -- taxable = 10*108 = 1080 ; GST18% intra = 97.2 CGST + 97.2 SGST ; grand=1274.4 -> round 1274
  if v_taxable <> 1080 then raise exception 'FAIL taxable expected 1080 got %', v_taxable; end if;
  if v_cgst <> 97.20 or v_sgst <> 97.20 then
    raise exception 'FAIL GST split expected 97.20/97.20 got %/%', v_cgst, v_sgst; end if;
  raise notice 'OK  invoice % taxable=1080 CGST=97.20 SGST=97.20 grand=%', v_inv, v_grand;

  -- stock should now be 190 (200-10), avg unchanged at 85
  select qty_on_hand, avg_cost into v_qty, v_avg from stock where item_id=v_item and branch_id=v_branch;
  if v_qty <> 190 or v_avg <> 85 then raise exception 'FAIL post-sale stock %/%', v_qty, v_avg; end if;
  raise notice 'OK  stock issued at WAC: 190 cases @ 85 (COGS = 10*85 = 850)';
  perform assert_trial_balance();

  ----------------------------------------------------------------------
  -- 3) Customer outstanding == invoice grand total, before payment.
  ----------------------------------------------------------------------
  v_out := customer_outstanding(v_cust);
  if v_out <> v_grand then raise exception 'FAIL outstanding % <> grand %', v_out, v_grand; end if;
  raise notice 'OK  customer outstanding = % (full invoice)', v_out;

  ----------------------------------------------------------------------
  -- 4) Collect a partial receipt of 1000 by UPI, allocate to the invoice.
  ----------------------------------------------------------------------
  v_rcpt := record_receipt(
    jsonb_build_object('customer_id', v_cust::text, 'store_id', v_store::text,
                       'receipt_date','2026-04-12','mode','upi','amount',1000,
                       'reference','UPI/12345','deposit_account','1120'),
    jsonb_build_array(jsonb_build_object('invoice_id', v_inv::text, 'amount', 1000)));
  raise notice 'OK  receipt % of 1000 allocated', v_rcpt;

  v_out := invoice_outstanding(v_inv);
  if v_out <> (v_grand - 1000) then
    raise exception 'FAIL invoice outstanding after 1000 expected % got %', (v_grand-1000), v_out; end if;
  if (select status from invoices where id=v_inv) <> 'part_paid' then
    raise exception 'FAIL invoice should be part_paid'; end if;
  raise notice 'OK  invoice part_paid, outstanding = %', v_out;
  perform assert_trial_balance();

  ----------------------------------------------------------------------
  -- 5) Inventory value ties to the ledger (WAC carrying vs 1230 control).
  ----------------------------------------------------------------------
  select difference into v_recon from stock_value_reconcile where inv_account='1230';
  if v_recon is distinct from 0 then
    raise exception 'FAIL inventory reconcile diff for 1230 = %', v_recon; end if;
  raise notice 'OK  finished-goods carrying value ties to ledger (diff=0)';

  raise notice '===== PHASE 1 SALES CYCLE PASSED =====';
end $$;

rollback;
