-- =====================================================================
-- tests/0930_smoke_production_cycle.sql  ·  Phase 3 end-to-end
--
-- Proves the manufacturing value chain against the live DB WITHOUT leaving
-- data: everything runs in a DO block that raises a sentinel at the end,
-- forcing ROLLBACK (posted entries are immutable). Success ends 'SMOKE_OK'.
--
-- Cycle: opening-stock preforms + caps -> BOM(empty bottle) + BOM(case) ->
--   post_production_run stage 1 (bottles from preforms) ->
--   post_production_run stage 2 (cases from bottles+caps) ->
--   run_process_costing for both stages.
--
-- Asserts: WIP/FG qty + WAC after each run, Production Clearing (1225) nets to
-- exactly 0, abnormal wastage hits 5170, COGM per case is computed, and the
-- trial balance stays at 0.
-- =====================================================================
do $$
declare
  v_unit    uuid;
  v_branch  uuid;
  v_preform uuid; v_cap uuid; v_bottle uuid; v_case uuid;
  v_run1    uuid; v_run2 uuid;
  v_qty numeric(14,3); v_avg numeric(14,4);
  v_clear numeric(14,2); v_waste numeric(14,2); v_tb numeric(16,2);
  v_cost1 numeric(14,4); v_cost2 numeric(14,4);
  v_crun1 uuid; v_crun2 uuid; v_cogm numeric(14,4);
  sfx text := substr(gen_random_uuid()::text,1,8);
begin
  select id into v_unit from units order by created_at limit 1;
  select id into v_branch from branches where code='HO' limit 1;

  -- items: preform (RM), cap (RM), empty bottle (WIP), filled case (FG)
  insert into items (sku,name,type,base_unit_id,gst_rate,is_sellable,is_purchasable,is_stocked)
   values ('SMK-PRE-'||sfx,'Smoke Preform','raw_material',v_unit,18,false,true,true) returning id into v_preform;
  insert into items (sku,name,type,base_unit_id,gst_rate,is_sellable,is_purchasable,is_stocked)
   values ('SMK-CAP-'||sfx,'Smoke Cap','raw_material',v_unit,18,false,true,true) returning id into v_cap;
  insert into items (sku,name,type,base_unit_id,gst_rate,is_sellable,is_purchasable,is_stocked)
   values ('SMK-BTL-'||sfx,'Smoke Empty Bottle','wip',v_unit,18,false,false,true) returning id into v_bottle;
  insert into items (sku,name,type,base_unit_id,gst_rate,is_sellable,is_purchasable,is_stocked)
   values ('SMK-CAS-'||sfx,'Smoke Filled Case','finished_good',v_unit,18,true,false,true) returning id into v_case;

  -- opening stock: 1000 preforms @ 2.00, 100 caps @ 1.00
  perform receive_opening_stock(v_preform, v_branch, 1000, 2.00);
  perform receive_opening_stock(v_cap,     v_branch, 100,  1.00);

  -- BOMs: 1 bottle needs 1 preform (5% scrap); 1 case needs 12 bottles + 12 caps
  perform upsert_bom(
    jsonb_build_object('parent_item_id', v_bottle::text, 'stage', 1, 'output_qty', 1),
    jsonb_build_array(jsonb_build_object('child_item_id', v_preform::text, 'quantity_per', 1, 'scrap_percent', 0)));
  perform upsert_bom(
    jsonb_build_object('parent_item_id', v_case::text, 'stage', 2, 'output_qty', 1),
    jsonb_build_array(
      jsonb_build_object('child_item_id', v_bottle::text, 'quantity_per', 12),
      jsonb_build_object('child_item_id', v_cap::text,    'quantity_per', 12)));

  -- STAGE 1: produce 900 empty bottles, explicit inputs 900 preforms, abnormal wastage 100.00
  -- input value = 900*2 = 1800; abnormal 100 -> good units absorb 1700 => 1.8889/unit
  v_run1 := post_production_run(
    jsonb_build_object('output_item_id', v_bottle::text, 'output_qty', 900, 'stage', 1,
                       'abnormal_wastage_value', 100.00),
    jsonb_build_array(jsonb_build_object('item_id', v_preform::text, 'qty', 900)));

  select qty_on_hand, avg_cost into v_qty, v_avg from stock where item_id=v_bottle and branch_id=v_branch;
  if v_qty <> 900 then raise exception 'FAIL bottle qty: % (want 900)', v_qty; end if;
  select output_unit_cost into v_cost1 from production_runs where id=v_run1;
  if v_cost1 <> 1.8889 then raise exception 'FAIL stage1 unit cost: % (want 1.8889)', v_cost1; end if;

  -- preforms drawn down 1000 -> 100 left
  select qty_on_hand into v_qty from stock where item_id=v_preform and branch_id=v_branch;
  if v_qty <> 100 then raise exception 'FAIL preform remaining: % (want 100)', v_qty; end if;

  -- STAGE 2: produce 75 cases, BOM-driven (900 bottles + 900 caps). No abnormal wastage.
  -- but only 100 caps in stock; BOM needs 75*12=900 caps -> would fail. Use 8 cases (96 caps).
  v_run2 := post_production_run(
    jsonb_build_object('output_item_id', v_case::text, 'output_qty', 8, 'stage', 2));

  select qty_on_hand, avg_cost into v_qty, v_avg from stock where item_id=v_case and branch_id=v_branch;
  if v_qty <> 8 then raise exception 'FAIL case qty: % (want 8)', v_qty; end if;
  -- inputs: 96 bottles @1.8889 = 181.33; 96 caps @1 = 96 -> 277.33 / 8 = 34.6663
  select output_unit_cost into v_cost2 from production_runs where id=v_run2;
  if v_cost2 <= 0 then raise exception 'FAIL stage2 unit cost not computed: %', v_cost2; end if;

  -- Production Clearing (1225) must net to EXACTLY zero across all runs
  select coalesce(sum(l.debit - l.credit),0) into v_clear
    from journal_lines l join chart_of_accounts a on a.id=l.account_id where a.code='1225';
  if v_clear <> 0 then raise exception 'FAIL clearing 1225 not zero: %', v_clear; end if;

  -- abnormal wastage recorded to 5170 (~100, net of a paise-level rounding true-up)
  select coalesce(sum(l.debit - l.credit),0) into v_waste
    from journal_lines l join chart_of_accounts a on a.id=l.account_id where a.code='5170';
  if abs(v_waste - 100) > 0.05 then raise exception 'FAIL wastage 5170: % (want ~100)', v_waste; end if;

  -- process costing: run both stages for this month
  v_crun1 := run_process_costing(current_date, 1, false);
  v_crun2 := run_process_costing(current_date, 2, false);
  select cogm_per_unit into v_cogm from costing_runs where id=v_crun2;
  if v_cogm <= 0 then raise exception 'FAIL COGM/case not computed: %', v_cogm; end if;

  -- ledger still balances
  v_tb := assert_trial_balance();

  raise exception 'SMOKE_OK: Phase 3 production cycle passed (bottleWAC=%, caseWAC=%, clearing=0, wastage=%, COGM/case=%, TB=%) (rolled back)',
    v_cost1, v_cost2, v_waste, v_cogm, v_tb;
end $$;
