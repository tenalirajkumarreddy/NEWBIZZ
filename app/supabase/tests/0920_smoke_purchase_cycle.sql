-- =====================================================================
-- tests/0920_smoke_purchase_cycle.sql  ·  Phase 2 end-to-end
--
-- Proves the buy-side value chain against the live DB WITHOUT leaving data:
-- everything runs inside a DO block that raises a sentinel at the end,
-- forcing a full ROLLBACK (posted entries are immutable, so we must not
-- commit). A successful run ends with 'SMOKE_OK'.
--
-- Cycle: create supplier + raw-material item -> post_grn (stock in @ cost,
-- WAC, Dr 1210 / Cr 2115) -> post_bill_from_grn (Dr 2115 + Dr 1140 Input GST
-- / Cr 2110 AP) -> pay_supplier partial (Dr 2110 / Cr 1120).
--
-- Asserts: WAC & qty, Input GST credit, GRNI (2115) nets to 0 after billing,
-- supplier outstanding, and trial balance = 0.
-- =====================================================================
do $$
declare
  v_unit    uuid;
  v_item    uuid;
  v_branch  uuid;
  v_supp    uuid;
  v_grn     uuid;
  v_bill    uuid;
  v_pay     uuid;
  v_qty     numeric(14,3); v_avg numeric(14,4);
  v_gst     numeric(14,2);
  v_grni    numeric(14,2);
  v_out     numeric(14,2);
  v_tb      numeric(16,2);
begin
  select id into v_unit from units order by created_at limit 1;
  if v_unit is null then raise exception 'no unit seeded'; end if;
  select id into v_branch from branches where code='HO' limit 1;

  -- a fresh raw-material SKU (unique so it starts at zero stock)
  insert into items (sku, name, type, base_unit_id, gst_rate, is_sellable, is_purchasable, is_stocked)
  values ('SMOKE-RM-'||substr(gen_random_uuid()::text,1,8), 'Smoke Preform', 'raw_material',
          v_unit, 18, false, true, true)
  returning id into v_item;

  insert into suppliers (code, name, kind, state_code)
  values ('SMOKE-SUP-'||substr(gen_random_uuid()::text,1,8), 'Smoke Plastics', 'material', '33')
  returning id into v_supp;

  -- 1) GRN: receive 100 @ 50 = 5000 goods value (ex-tax). Dr 1210 / Cr 2115.
  v_grn := post_grn(
    jsonb_build_object('supplier_id', v_supp::text, 'branch_id', v_branch::text),
    jsonb_build_array(jsonb_build_object('item_id', v_item::text, 'qty', 100, 'unit_cost', 50)));

  select qty_on_hand, avg_cost into v_qty, v_avg
    from stock where item_id = v_item and branch_id = v_branch;
  if v_qty <> 100 then raise exception 'FAIL qty after GRN: % (want 100)', v_qty; end if;
  if v_avg <> 50 then raise exception 'FAIL WAC after GRN: % (want 50)', v_avg; end if;

  -- 2) Bill the GRN in full: taxable 5000, CGST 450 + SGST 450 = 900, grand 5900.
  v_bill := post_bill_from_grn(v_grn, 'SUPP-INV-001');

  -- Input GST credit (1140) should be 900
  select coalesce(sum(l.debit - l.credit),0) into v_gst
    from journal_lines l join chart_of_accounts a on a.id = l.account_id
   where a.code = '1140';
  if v_gst <> 900 then raise exception 'FAIL Input GST 1140: % (want 900)', v_gst; end if;

  -- GRNI clearing (2115) must net to zero: +5000 at GRN, -5000 at bill
  select coalesce(sum(l.credit - l.debit),0) into v_grni
    from journal_lines l join chart_of_accounts a on a.id = l.account_id
   where a.code = '2115';
  if v_grni <> 0 then raise exception 'FAIL GRNI 2115 not cleared: % (want 0)', v_grni; end if;

  -- supplier owes 5900 now
  v_out := supplier_outstanding(v_supp);
  if v_out <> 5900 then raise exception 'FAIL AP after bill: % (want 5900)', v_out; end if;

  -- 3) Partial payment 3000 from bank (1120)
  v_pay := pay_supplier(
    jsonb_build_object('supplier_id', v_supp::text, 'mode','bank', 'amount', 3000,
                       'source_account','1120', 'reference','UTR123'),
    jsonb_build_array(jsonb_build_object('bill_id', v_bill::text, 'amount', 3000)));

  v_out := supplier_outstanding(v_supp);
  if v_out <> 2900 then raise exception 'FAIL AP after payment: % (want 2900)', v_out; end if;
  if (select status from supplier_bills where id = v_bill) <> 'part_paid' then
    raise exception 'FAIL bill status not part_paid';
  end if;

  -- 4) ledger must still balance
  v_tb := assert_trial_balance();  -- raises if <> 0

  raise exception 'SMOKE_OK: Phase 2 purchase cycle passed (WAC=%, InputGST=%, GRNI=0, AP=%, TB=%) (rolled back)',
    v_avg, v_gst, v_out, v_tb;
end $$;
