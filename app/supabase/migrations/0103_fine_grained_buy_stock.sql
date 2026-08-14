-- =====================================================================
-- 0103_fine_grained_buy_stock.sql
--
-- Fine-grained DB gates for Buy & Stock (Task 3).
--
--   • place_purchase_order  → purchase.create
--   • post_grn              → purchase.create
--   • post_grn_from_po      → purchase.create
--   • post_supplier_bill    → purchase.record_bill
--   • post_bill_from_grn    → purchase.record_bill
--   • pay_supplier          → purchase.pay
--   • supplier_opening_balance → purchase.pay
--   • record_purchase_return  → purchase.create (replaces purchase.manage)
--   • bom_standard_cost       → bom.view
--
-- Bodies unchanged from the latest repo definitions (only the permission
-- gate is added after `begin`). bom_standard_cost was language sql — it is
-- re-created as plpgsql solely to host the gate; the SELECT logic is
-- byte-identical, volatility kept `stable`.
--
-- RLS: purchase.manage write policies on suppliers / purchase_orders /
-- purchase_order_lines / alternate_groups / alternate_group_members /
-- boms / bom_lines / item_suppliers are rewired to the fine codes.
-- Holdings read is gated: owner-always + stock.custody / cash.transfer /
-- stock.transfer (the old read_all_auth on the two holdings tables is
-- dropped so the custody restriction actually binds).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. place_purchase_order — purchase.create
-- ---------------------------------------------------------------------
create or replace function place_purchase_order(p_header jsonb, p_lines jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supplier uuid := (p_header->>'supplier_id')::uuid;
  v_date     date := coalesce((p_header->>'po_date')::date, current_date);
  v_fy       uuid;
  v_branch   uuid;
  v_po       uuid;
  v_no       text;
  v_line     jsonb;
  v_item     uuid; v_qty numeric(14,3); v_cost numeric(14,2); v_rate numeric(5,2);
  v_ln       int := 0;
  v_actor    uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
begin
  if not has_permission('purchase.create') then
    raise exception 'place_purchase_order: not authorized (purchase.create required)';
  end if;
  if v_supplier is null then raise exception 'place_purchase_order: supplier_id required'; end if;
  if not exists (select 1 from suppliers where id = v_supplier) then
    raise exception 'place_purchase_order: unknown supplier %', v_supplier;
  end if;
  v_fy     := fy_for_date(v_date);
  v_branch := coalesce(nullif(p_header->>'branch_id','')::uuid,
                       (select id from branches where code='HO' limit 1));
  v_no     := next_number('po', v_date);

  insert into purchase_orders (po_no, fy_id, supplier_id, branch_id, po_date,
                               expected_date, status, notes, created_by)
  values (v_no, v_fy, v_supplier, v_branch, v_date,
          nullif(p_header->>'expected_date','')::date, 'confirmed',
          p_header->>'notes', v_actor)
  returning id into v_po;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_item := (v_line->>'item_id')::uuid;
    v_qty  := (v_line->>'qty')::numeric;
    v_cost := (v_line->>'unit_cost')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'place_purchase_order: qty must be > 0'; end if;
    if v_cost is null or v_cost < 0 then raise exception 'place_purchase_order: unit_cost required'; end if;
    select gst_rate into v_rate from items where id = v_item;
    v_ln := v_ln + 1;
    insert into purchase_order_lines (po_id, item_id, qty, unit_cost, gst_rate, line_no)
      values (v_po, v_item, v_qty, v_cost,
              coalesce(nullif(v_line->>'gst_rate','')::numeric, v_rate, 0), v_ln);
  end loop;

  if v_ln = 0 then raise exception 'place_purchase_order: at least one line required'; end if;

  perform write_audit('insert','purchase_orders', v_po::text,
            format('PO %s for supplier %s', v_no, v_supplier), null, v_actor);
  return v_po;
end $$;

-- ---------------------------------------------------------------------
-- 2. post_grn — purchase.create
-- ---------------------------------------------------------------------
create or replace function post_grn(p_header jsonb, p_lines jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supplier uuid := (p_header->>'supplier_id')::uuid;
  v_date     date := coalesce((p_header->>'grn_date')::date, current_date);
  v_fy       uuid;
  v_branch   uuid;
  v_grn      uuid;
  v_no       text;
  v_line     jsonb;
  v_item     uuid; v_qty numeric(14,3); v_cost numeric(14,2); v_rate numeric(5,2);
  v_type     item_type;
  v_lval     numeric(14,2);
  v_goods    numeric(14,2) := 0;
  v_ln       int := 0;
  v_actor    uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
begin
  if not has_permission('purchase.create') then
    raise exception 'post_grn: not authorized (purchase.create required)';
  end if;
  if v_supplier is null then raise exception 'post_grn: supplier_id required'; end if;
  if not exists (select 1 from suppliers where id = v_supplier) then
    raise exception 'post_grn: unknown supplier %', v_supplier;
  end if;
  v_fy     := fy_for_date(v_date);
  v_branch := coalesce(nullif(p_header->>'branch_id','')::uuid,
                       (select id from branches where code='HO' limit 1));
  v_no     := next_number('grn', v_date);

  insert into purchase_receipts (grn_no, fy_id, po_id, supplier_id, branch_id, grn_date,
                                 supplier_dc_no, status, notes, created_by)
  values (v_no, v_fy, nullif(p_header->>'po_id','')::uuid, v_supplier, v_branch, v_date,
          p_header->>'supplier_dc_no', 'received', p_header->>'notes', v_actor)
  returning id into v_grn;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_item := (v_line->>'item_id')::uuid;
    v_qty  := (v_line->>'qty')::numeric;
    v_cost := (v_line->>'unit_cost')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'post_grn: qty must be > 0'; end if;
    if v_cost is null or v_cost < 0 then raise exception 'post_grn: unit_cost required'; end if;
    select gst_rate, type into v_rate, v_type from items where id = v_item;
    if v_type is null then raise exception 'post_grn: unknown item %', v_item; end if;
    if v_type = 'service' then
      raise exception 'post_grn: service item % cannot be received into stock', v_item;
    end if;
    v_lval := round(v_qty * v_cost, 2);
    v_ln   := v_ln + 1;

    insert into purchase_receipt_lines (grn_id, item_id, qty, unit_cost, line_value, gst_rate, line_no)
      values (v_grn, v_item, v_qty, v_cost, v_lval,
              coalesce(nullif(v_line->>'gst_rate','')::numeric, v_rate, 0), v_ln);

    -- stock IN at cost: Dr inventory / Cr 2115 GRN-clearing; recomputes WAC.
    perform post_stock_move(v_item, v_branch, 'purchase_in', v_qty, v_cost,
                            '2115', 'grn', v_grn, v_date);
    v_goods := v_goods + v_lval;
  end loop;

  if v_ln = 0 then raise exception 'post_grn: at least one line required'; end if;

  -- the value entry(ies) were posted per line by post_stock_move; record the total.
  update purchase_receipts set goods_value = v_goods where id = v_grn;

  -- mark the source PO received
  if nullif(p_header->>'po_id','') is not null then
    update purchase_orders set status='received', updated_at=now()
      where id = (p_header->>'po_id')::uuid;
  end if;

  perform write_audit('post','purchase_receipts', v_grn::text,
            format('GRN %s goods %s from supplier', v_no, v_goods),
            jsonb_build_object('grn_no', v_no, 'goods_value', v_goods), v_actor);
  return v_grn;
end $$;
comment on function post_grn is
  'Goods-in: stock IN at cost (WAC), Dr inventory / Cr 2115 GRN-clearing. Ex-tax. One transaction.';

-- ---------------------------------------------------------------------
-- 3. post_grn_from_po — purchase.create
-- ---------------------------------------------------------------------
create or replace function post_grn_from_po(p_po uuid, p_date date default current_date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_po    purchase_orders%rowtype;
  v_lines jsonb;
begin
  if not has_permission('purchase.create') then
    raise exception 'post_grn_from_po: not authorized (purchase.create required)';
  end if;
  select * into v_po from purchase_orders where id = p_po;
  if not found then raise exception 'post_grn_from_po: PO % not found', p_po; end if;
  if v_po.status = 'received' then raise exception 'PO % already received', v_po.po_no; end if;
  if v_po.status = 'cancelled' then raise exception 'PO % is cancelled', v_po.po_no; end if;

  select jsonb_agg(jsonb_build_object('item_id', item_id, 'qty', qty,
                                      'unit_cost', unit_cost, 'gst_rate', gst_rate)
                   order by line_no)
    into v_lines
    from purchase_order_lines where po_id = p_po;

  return post_grn(
    jsonb_build_object('supplier_id', v_po.supplier_id::text, 'branch_id', v_po.branch_id::text,
                       'grn_date', p_date, 'po_id', p_po::text),
    v_lines);
end $$;

-- ---------------------------------------------------------------------
-- 4. post_supplier_bill — purchase.record_bill
-- ---------------------------------------------------------------------
create or replace function post_supplier_bill(p_header jsonb, p_lines jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supplier uuid := (p_header->>'supplier_id')::uuid;
  v_date     date := coalesce((p_header->>'bill_date')::date, current_date);
  v_fy       uuid;
  v_branch   uuid;
  v_home     text;
  v_supp_st  text;
  v_inter    boolean;
  v_clearing text := coalesce(nullif(p_header->>'clearing_account',''), '2115');
  v_grn      uuid := nullif(p_header->>'grn_id','')::uuid;
  v_bill     uuid;
  v_no       text;
  v_line     jsonb;
  v_item     uuid; v_expacct text; v_qty numeric(14,3); v_cost numeric(14,2); v_rate numeric(5,2);
  v_cess_r   numeric(5,2); v_type item_type;
  v_taxable  numeric(14,2); v_cgst numeric(14,2); v_sgst numeric(14,2);
  v_igst     numeric(14,2); v_cess numeric(14,2); v_ltot numeric(14,2);
  v_dr_acct  text;
  v_sum_tax  numeric(14,2) := 0; v_sum_cgst numeric(14,2) := 0; v_sum_sgst numeric(14,2) := 0;
  v_sum_igst numeric(14,2) := 0; v_sum_cess numeric(14,2) := 0;
  v_input_gst numeric(14,2);
  v_grand    numeric(14,2); v_round numeric(14,2);
  v_ln       int := 0;
  v_je       uuid;
  v_lines    jsonb := '[]'::jsonb;     -- debit lines (goods/expense per account), built up
  v_dr_map   jsonb := '{}'::jsonb;     -- account_code -> accumulated debit (merge same accounts)
  v_key      text;
  v_je_lines jsonb;
  v_actor    uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
begin
  if not has_permission('purchase.record_bill') then
    raise exception 'post_supplier_bill: not authorized (purchase.record_bill required)';
  end if;
  if v_supplier is null then raise exception 'post_supplier_bill: supplier_id required'; end if;
  select state_code into v_supp_st from suppliers where id = v_supplier;
  if v_supp_st is null then raise exception 'post_supplier_bill: unknown supplier %', v_supplier; end if;

  v_fy     := fy_for_date(v_date);
  v_branch := coalesce(nullif(p_header->>'branch_id','')::uuid,
                       (select id from branches where code='HO' limit 1));
  select state_code into v_home from branches where id = v_branch;
  v_home   := coalesce(v_home, (select state_code from company_settings limit 1), '33');
  v_inter  := (v_supp_st is distinct from v_home);
  v_no     := next_number('bill', v_date);

  insert into supplier_bills (bill_no, supplier_bill_no, fy_id, supplier_id, branch_id,
                              bill_date, due_date, is_interstate, status, notes, created_by)
  values (v_no, p_header->>'supplier_bill_no', v_fy, v_supplier, v_branch,
          v_date, nullif(p_header->>'due_date','')::date, v_inter, 'posted',
          p_header->>'notes', v_actor)
  returning id into v_bill;

  ------------------------------------------------------------------- lines
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_item    := nullif(v_line->>'item_id','')::uuid;
    v_expacct := nullif(v_line->>'expense_account','');
    v_qty     := coalesce(nullif(v_line->>'qty','')::numeric, 1);
    v_cost    := (v_line->>'unit_cost')::numeric;
    if v_cost is null then raise exception 'post_supplier_bill: unit_cost required'; end if;
    if v_qty <= 0 then raise exception 'post_supplier_bill: qty must be > 0'; end if;

    if v_item is not null then
      select gst_rate, cess_rate, type into v_rate, v_cess_r, v_type from items where id = v_item;
      -- stock item -> debit the clearing account (clears the GRNI from the GRN)
      v_dr_acct := v_clearing;
    else
      -- pure expense/charge line -> debit its expense account
      v_dr_acct := v_expacct;
      v_rate    := coalesce(nullif(v_line->>'gst_rate','')::numeric, 0);
      v_cess_r  := 0;
    end if;
    v_rate := coalesce(nullif(v_line->>'gst_rate','')::numeric, v_rate, 0);
    v_cess_r := coalesce(v_cess_r, 0);

    v_taxable := round(v_qty * v_cost, 2);
    v_cess    := round(v_taxable * v_cess_r / 100, 2);
    if v_inter then
      v_igst := round(v_taxable * v_rate / 100, 2); v_cgst := 0; v_sgst := 0;
    else
      v_cgst := round(v_taxable * (v_rate/2) / 100, 2);
      v_sgst := round(v_taxable * (v_rate/2) / 100, 2);
      v_igst := 0;
    end if;
    v_ltot := v_taxable + v_cgst + v_sgst + v_igst + v_cess;
    v_ln := v_ln + 1;

    insert into supplier_bill_lines (bill_id, item_id, expense_account, description, qty, unit_cost,
                                     taxable_amount, gst_rate, cgst_amount, sgst_amount,
                                     igst_amount, cess_amount, line_total, line_no)
    values (v_bill, v_item, v_expacct, v_line->>'description', v_qty, v_cost,
            v_taxable, v_rate, v_cgst, v_sgst, v_igst, v_cess, v_ltot, v_ln);

    -- accumulate the debit for this account (merge lines hitting the same account)
    v_key := v_dr_acct;
    v_dr_map := jsonb_set(v_dr_map, array[v_key],
                  to_jsonb(coalesce((v_dr_map->>v_key)::numeric, 0) + v_taxable));

    v_sum_tax  := v_sum_tax + v_taxable; v_sum_cgst := v_sum_cgst + v_cgst;
    v_sum_sgst := v_sum_sgst + v_sgst;   v_sum_igst := v_sum_igst + v_igst;
    v_sum_cess := v_sum_cess + v_cess;
  end loop;

  if v_ln = 0 then raise exception 'post_supplier_bill: at least one line required'; end if;

  v_grand := v_sum_tax + v_sum_cgst + v_sum_sgst + v_sum_igst + v_sum_cess;
  v_round := round(v_grand) - v_grand;
  v_grand := v_grand + v_round;
  v_input_gst := v_sum_cgst + v_sum_sgst + v_sum_igst + v_sum_cess;

  ------------------------------------------------------------ payable posting
  -- Dr goods/expense (per account) ; Dr 1140 Input GST ; Cr 2110 AP (supplier) ; round-off
  v_je_lines := '[]'::jsonb;
  for v_key in select jsonb_object_keys(v_dr_map) loop
    v_je_lines := v_je_lines || jsonb_build_array(
      jsonb_build_object('account_code', v_key, 'debit', (v_dr_map->>v_key)::numeric, 'credit', 0));
  end loop;
  if v_input_gst > 0 then
    v_je_lines := v_je_lines || jsonb_build_array(
      jsonb_build_object('account_code','1140','debit', v_input_gst,'credit',0,
                         'memo', format('CGST %s SGST %s IGST %s CESS %s',
                                        v_sum_cgst, v_sum_sgst, v_sum_igst, v_sum_cess)));
  end if;
  v_je_lines := v_je_lines || jsonb_build_array(
    jsonb_build_object('account_code','2110','debit',0,'credit', v_grand,
                       'party_type','supplier','party_id', v_supplier::text));
  if v_round <> 0 then
    if v_round > 0 then
      -- grand rounded up: extra credit needs a matching debit to Rounding Off
      v_je_lines := v_je_lines || jsonb_build_array(
        jsonb_build_object('account_code','5700','debit', v_round,'credit',0));
    else
      v_je_lines := v_je_lines || jsonb_build_array(
        jsonb_build_object('account_code','5700','debit',0,'credit', abs(v_round)));
    end if;
  end if;

  v_je := post_journal(
    jsonb_build_object('entry_date', v_date, 'source','purchase', 'source_id', v_bill::text,
                       'narration','Bill '||v_no),
    v_je_lines);

  update supplier_bills set
      taxable_amount = v_sum_tax, cgst_amount = v_sum_cgst, sgst_amount = v_sum_sgst,
      igst_amount = v_sum_igst, cess_amount = v_sum_cess, round_off = v_round,
      grand_total = v_grand, journal_entry_id = v_je
    where id = v_bill;

  -- link the GRN (mark billed) if this bill matches one
  if v_grn is not null then
    update purchase_receipts set status='billed', billed_bill_id = v_bill where id = v_grn;
  end if;

  perform write_audit('post','supplier_bills', v_bill::text,
            format('Bill %s total %s', v_no, v_grand),
            jsonb_build_object('bill_no', v_no, 'grand_total', v_grand), v_actor);
  return v_bill;
end $$;
comment on function post_supplier_bill is
  'Liability event: Dr clearing/expense + Input GST, Cr AP. Clears GRNI 2115. One transaction.';

-- ---------------------------------------------------------------------
-- 5. post_bill_from_grn — purchase.record_bill
-- ---------------------------------------------------------------------
create or replace function post_bill_from_grn(
  p_grn uuid, p_supplier_bill_no text default null, p_date date default current_date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grn   purchase_receipts%rowtype;
  v_lines jsonb;
begin
  if not has_permission('purchase.record_bill') then
    raise exception 'post_bill_from_grn: not authorized (purchase.record_bill required)';
  end if;
  select * into v_grn from purchase_receipts where id = p_grn;
  if not found then raise exception 'post_bill_from_grn: GRN % not found', p_grn; end if;
  if v_grn.status = 'billed' then raise exception 'GRN % already billed', v_grn.grn_no; end if;
  if v_grn.status = 'cancelled' then raise exception 'GRN % is cancelled', v_grn.grn_no; end if;

  select jsonb_agg(jsonb_build_object('item_id', item_id, 'qty', qty,
                                      'unit_cost', unit_cost, 'gst_rate', gst_rate)
                   order by line_no)
    into v_lines
    from purchase_receipt_lines where grn_id = p_grn;

  return post_supplier_bill(
    jsonb_build_object('supplier_id', v_grn.supplier_id::text, 'branch_id', v_grn.branch_id::text,
                       'bill_date', p_date, 'grn_id', p_grn::text,
                       'supplier_bill_no', p_supplier_bill_no),
    v_lines);
end $$;

-- ---------------------------------------------------------------------
-- 6. pay_supplier — purchase.pay
-- ---------------------------------------------------------------------
create or replace function pay_supplier(p_header jsonb, p_allocations jsonb default '[]'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supp    uuid := (p_header->>'supplier_id')::uuid;
  v_date    date := coalesce((p_header->>'payment_date')::date, current_date);
  v_fy      uuid;
  v_amount  numeric(14,2) := (p_header->>'amount')::numeric;
  v_mode    payment_mode := (p_header->>'mode')::payment_mode;
  v_source  text := coalesce(nullif(p_header->>'source_account',''), '1120');
  v_staff   uuid := nullif(p_header->>'paid_by','')::uuid;
  v_pno     text;
  v_pay     uuid;
  v_je      uuid;
  v_alloc   jsonb;
  v_bill    uuid; v_aamt numeric(14,2); v_out numeric(14,2);
  v_sum_alloc numeric(14,2) := 0;
  v_cr_line jsonb;
  v_actor   uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
begin
  if not has_permission('purchase.pay') then
    raise exception 'pay_supplier: not authorized (purchase.pay required)';
  end if;
  if v_supp is null then raise exception 'pay_supplier: supplier_id required'; end if;
  if v_amount is null or v_amount <= 0 then raise exception 'pay_supplier: amount must be > 0'; end if;
  v_fy  := fy_for_date(v_date);
  v_pno := next_number('payment', v_date);

  insert into supplier_payments (payment_no, fy_id, supplier_id, payment_date, mode, amount,
                                 reference, source_account, paid_by, notes, created_by)
  values (v_pno, v_fy, v_supp, v_date, v_mode, v_amount,
          p_header->>'reference', v_source, v_staff, p_header->>'notes', v_actor)
  returning id into v_pay;

  ------------------------------------------------------------ value posting
  -- Dr AP (supplier control) / Cr source account (bank/cash/custody).
  -- custody (2140) carries the paying user as its party.
  if v_source = '2140' then
    v_cr_line := jsonb_build_object('account_code','2140','debit',0,'credit', v_amount,
                                    'party_type','user','party_id', coalesce(v_staff, v_actor)::text);
  else
    v_cr_line := jsonb_build_object('account_code', v_source,'debit',0,'credit', v_amount);
  end if;

  v_je := post_journal(
    jsonb_build_object('entry_date', v_date, 'source','payment', 'source_id', v_pay::text,
                       'narration','Payment '||v_pno),
    jsonb_build_array(
      jsonb_build_object('account_code','2110','debit', v_amount,'credit',0,
                         'party_type','supplier','party_id', v_supp::text),
      v_cr_line));

  update supplier_payments set journal_entry_id = v_je where id = v_pay;

  ------------------------------------------------------------- allocations
  if jsonb_typeof(p_allocations) = 'array' then
    for v_alloc in select * from jsonb_array_elements(p_allocations) loop
      v_bill := (v_alloc->>'bill_id')::uuid;
      v_aamt := (v_alloc->>'amount')::numeric;
      if v_aamt is null or v_aamt <= 0 then raise exception 'allocation amount must be > 0'; end if;

      -- guard: cannot pay a bill belonging to another supplier
      if (select supplier_id from supplier_bills where id = v_bill) is distinct from v_supp then
        raise exception 'allocation bill % is not for supplier %', v_bill, v_supp;
      end if;
      v_out := bill_outstanding(v_bill);
      if v_aamt > v_out then
        raise exception 'allocation % exceeds bill % outstanding %', v_aamt, v_bill, v_out;
      end if;

      insert into payment_allocations (payment_id, bill_id, amount)
        values (v_pay, v_bill, v_aamt);
      v_sum_alloc := v_sum_alloc + v_aamt;

      -- maintain bill read-model (Invariant 5); cast to bill_status (0010 lesson)
      update supplier_bills set
          amount_paid = amount_paid + v_aamt,
          status = (case when (amount_paid + v_aamt) >= grand_total then 'paid'
                        else 'part_paid' end)::bill_status
        where id = v_bill;
    end loop;
  end if;

  if v_sum_alloc > v_amount then
    raise exception 'pay_supplier: allocations % exceed payment amount %', v_sum_alloc, v_amount;
  end if;
  update supplier_payments set allocated_amount = v_sum_alloc where id = v_pay;

  perform write_audit('post','supplier_payments', v_pay::text,
            format('Payment %s %s to supplier', v_pno, v_amount),
            jsonb_build_object('payment_no', v_pno, 'amount', v_amount, 'allocated', v_sum_alloc), v_actor);
  return v_pay;
end $$;
comment on function pay_supplier is
  'Money out: Dr AP, Cr cash/bank/custody. Allocates to bills, updates read-models. One transaction.';

-- ---------------------------------------------------------------------
-- 7. supplier_opening_balance — purchase.pay
-- ---------------------------------------------------------------------
create or replace function supplier_opening_balance(
  p_supplier uuid, p_amount numeric, p_as_of date default current_date, p_narration text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_entry uuid;
begin
  if not has_permission('purchase.pay') then
    raise exception 'supplier_opening_balance: not authorized (purchase.pay required)';
  end if;
  if p_amount = 0 then raise exception 'opening balance must be non-zero'; end if;
  v_entry := post_journal(
    jsonb_build_object('entry_date', p_as_of, 'source','opening',
                       'narration', coalesce(p_narration,'Opening payable')),
    jsonb_build_array(
      jsonb_build_object('account_code','3900','debit', p_amount, 'credit',0),
      jsonb_build_object('account_code','2110','debit',0,'credit', p_amount,
                         'party_type','supplier','party_id', p_supplier::text)
    ));
  return v_entry;
end $$;

-- ---------------------------------------------------------------------
-- 8. record_purchase_return — purchase.create (replaces purchase.manage)
-- ---------------------------------------------------------------------
create or replace function record_purchase_return(
  p_supplier uuid, p_lines jsonb, p_opts jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date    date := coalesce(nullif(p_opts->>'date','')::date, current_date);
  v_fy      uuid;
  v_branch  uuid;
  v_supp_st text;
  v_line    jsonb;
  v_item    uuid; v_qty numeric(14,3); v_rate numeric(5,2);
  v_type    item_type;
  v_wac     numeric(14,4);
  v_lval    numeric(14,2); v_ltax numeric(14,2);
  v_inv_acct text;
  v_sum_goods numeric(14,2) := 0; v_sum_tax numeric(14,2) := 0;
  v_gross   numeric(14,2);
  v_ln      int := 0;
  v_je      uuid; v_dn uuid;
  v_no      text;
  v_jlines  jsonb;
  v_rlines  jsonb := '[]'::jsonb;
  v_actor   uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
begin
  if not has_permission('purchase.create') then
    raise exception 'record_purchase_return: not authorized (purchase.create required)';
  end if;
  select state_code into v_supp_st from suppliers where id = p_supplier;
  if v_supp_st is null then raise exception 'record_purchase_return: unknown supplier %', p_supplier; end if;
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'record_purchase_return: at least one line required';
  end if;

  v_fy     := fy_for_date(v_date);
  v_branch := coalesce(nullif(p_opts->>'branch_id','')::uuid,
                       (select id from branches where code='HO' limit 1));

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_item := (v_line->>'item_id')::uuid;
    v_qty  := (v_line->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then continue; end if;
    select gst_rate, type into v_rate, v_type from items where id = v_item;
    if v_type is null then raise exception 'record_purchase_return: unknown item %', v_item; end if;
    if v_type = 'service' then raise exception 'record_purchase_return: service item % has no stock', v_item; end if;
    v_rate := coalesce(nullif(v_line->>'gst_rate','')::numeric, v_rate, 0);

    -- current WA cost at the branch (the value we reverse out of inventory)
    select avg_cost into v_wac from stock where item_id = v_item and branch_id = v_branch;
    v_wac := coalesce(v_wac, 0);

    -- move qty OUT, no journal (NULL contra) — value posted explicitly below.
    perform post_stock_move(v_item, v_branch, 'adjust_out', (-1 * v_qty), 0,
                            null, 'debit_note', null, v_date);

    v_inv_acct := inventory_account_for(v_type);
    v_lval := round(v_qty * v_wac, 2);
    v_ltax := round(v_lval * v_rate / 100, 2);
    v_ln   := v_ln + 1;
    v_sum_goods := v_sum_goods + v_lval;
    v_sum_tax   := v_sum_tax + v_ltax;

    v_rlines := v_rlines || jsonb_build_array(jsonb_build_object(
      'item_id', v_item::text, 'qty', v_qty, 'unit_cost', v_wac,
      'taxable_amount', v_lval, 'gst_rate', v_rate, 'tax_amount', v_ltax,
      'inv_acct', v_inv_acct, 'line_no', v_ln));
  end loop;

  if v_ln = 0 then raise exception 'record_purchase_return: nothing to return'; end if;
  v_gross := v_sum_goods + v_sum_tax;
  if v_gross <= 0 then raise exception 'record_purchase_return: zero-value return'; end if;

  v_no := next_number('debit_note', v_date);
  insert into debit_notes (debit_note_no, fy_id, supplier_id, purchase_bill_id, branch_id,
                           amount, base_amount, tax_amount, reason, narration, status,
                           created_by)
  values (v_no, v_fy, p_supplier, nullif(p_opts->>'purchase_bill_id','')::uuid, v_branch,
          v_gross, v_sum_goods, v_sum_tax,
          coalesce(nullif(p_opts->>'reason','')::debit_note_reason, 'return'),
          nullif(p_opts->>'narration',''), 'posted', v_actor)
  returning id into v_dn;

  -- value entry: Dr AP (gross) / Cr inventory (goods) + Cr Input GST (tax)
  v_jlines := jsonb_build_array(
    jsonb_build_object('account_code','2110','debit', v_gross, 'credit', 0,
                       'party_type','supplier','party_id', p_supplier::text));
  for v_line in select * from jsonb_array_elements(v_rlines) loop
    v_jlines := v_jlines || jsonb_build_array(
      jsonb_build_object('account_code', v_line->>'inv_acct', 'debit', 0,
                         'credit', (v_line->>'taxable_amount')::numeric,
                         'stock_item_id', v_line->>'item_id',
                         'stock_qty', -1 * (v_line->>'qty')::numeric,
                         'branch_id', v_branch::text));
  end loop;
  if v_sum_tax > 0 then
    v_jlines := v_jlines || jsonb_build_array(
      jsonb_build_object('account_code','1140','debit', 0, 'credit', v_sum_tax));
  end if;

  v_je := post_journal(
    jsonb_build_object('entry_date', v_date, 'source','debit_note', 'source_id', v_dn::text,
                       'narration', coalesce(nullif(p_opts->>'narration',''),
                         'Purchase return / debit note '||v_no)),
    v_jlines);

  update debit_notes set journal_entry_id = v_je where id = v_dn;

  for v_line in select * from jsonb_array_elements(v_rlines) loop
    insert into debit_note_lines (debit_note_id, item_id, qty, unit_cost,
                                  taxable_amount, gst_rate, tax_amount, line_no)
    values (v_dn, (v_line->>'item_id')::uuid, (v_line->>'qty')::numeric,
            (v_line->>'unit_cost')::numeric, (v_line->>'taxable_amount')::numeric,
            (v_line->>'gst_rate')::numeric, (v_line->>'tax_amount')::numeric,
            (v_line->>'line_no')::int);
  end loop;

  perform write_audit('post','debit_notes', v_dn::text,
            format('Debit note %s to supplier: %s', v_no, v_gross),
            jsonb_build_object('debit_note_no', v_no, 'amount', v_gross, 'lines', v_ln), v_actor);
  return v_dn;
end $$;
comment on function record_purchase_return is 'Purchase return: stock out at WAC, Dr AP / Cr RM inventory + Cr input-GST reversal, as a debit note. §5.5.';

-- ---------------------------------------------------------------------
-- 9. bom_standard_cost — bom.view
-- (was language sql stable; re-created as plpgsql to host the gate —
--  same SELECT, same volatility, byte-identical logic)
-- ---------------------------------------------------------------------
create or replace function bom_standard_cost(
  p_item uuid, p_output_units numeric default 1, p_as_of date default current_date)
returns numeric
language plpgsql stable
set search_path = public
as $$
declare v_res numeric;
begin
  if not has_permission('bom.view') then
    raise exception 'bom_standard_cost: not authorized (bom.view required)';
  end if;
  select coalesce(sum(
           e.gross_qty * coalesce(
             (select round(sum(s.qty_on_hand*s.avg_cost)/nullif(sum(s.qty_on_hand),0),4)
                from stock s where s.item_id = e.child_item_id), 0)
         ), 0)
    into v_res
    from explode_bom(p_item, p_output_units, p_as_of) e;
  return v_res;
end $$;
comment on function bom_standard_cost is 'Planning estimate: components at current WAC. Not used for inventory valuation (that is WA, 0018).';

-- =====================================================================
-- 10. Purchasing RLS rewires — coarse purchase.manage write policies
--     become the fine codes; read_all_auth (using true) is left intact.
-- =====================================================================

-- suppliers: read stays open; manage requires purchase.create
drop policy if exists manage_suppliers on public.suppliers;
create policy manage_suppliers on public.suppliers for all to authenticated
  using (has_permission('purchase.create')) with check (has_permission('purchase.create'));

-- purchase_orders / purchase_order_lines: manage requires purchase.create
drop policy if exists manage_pos on public.purchase_orders;
create policy manage_pos on public.purchase_orders for all to authenticated
  using (has_permission('purchase.create')) with check (has_permission('purchase.create'));

drop policy if exists manage_po_lines on public.purchase_order_lines;
create policy manage_po_lines on public.purchase_order_lines for all to authenticated
  using (has_permission('purchase.create')) with check (has_permission('purchase.create'));

-- BOM masters: manage requires bom.manage (fine code from Task 1)
drop policy if exists manage_alt_groups on public.alternate_groups;
create policy manage_alt_groups on public.alternate_groups for all to authenticated
  using (has_permission('bom.manage')) with check (has_permission('bom.manage'));

drop policy if exists manage_alt_members on public.alternate_group_members;
create policy manage_alt_members on public.alternate_group_members for all to authenticated
  using (has_permission('bom.manage')) with check (has_permission('bom.manage'));

drop policy if exists manage_boms on public.boms;
create policy manage_boms on public.boms for all to authenticated
  using (has_permission('bom.manage')) with check (has_permission('bom.manage'));

drop policy if exists manage_bom_lines on public.bom_lines;
create policy manage_bom_lines on public.bom_lines for all to authenticated
  using (has_permission('bom.manage')) with check (has_permission('bom.manage'));

-- item_suppliers (AVL): spans demand, billing and payment duties
drop policy if exists manage_avl on public.item_suppliers;
create policy manage_avl on public.item_suppliers for all to authenticated
  using (has_permission('purchase.create')
         or has_permission('purchase.record_bill')
         or has_permission('purchase.pay'))
  with check (has_permission('purchase.create')
              or has_permission('purchase.record_bill')
              or has_permission('purchase.pay'));

-- debit_notes / debit_note_lines already expose read_all_auth (using true)
-- and reference no purchase.manage — left as-is per the plan.

-- =====================================================================
-- 11. Holdings custody read gate — owner + custody/transfer actors.
--     The old read_all_auth on these two tables is dropped so the
--     custody restriction actually binds (transfers/transfer_lines keep
--     read_all_auth — transfer read semantics are handled by Task 6).
-- =====================================================================
drop policy if exists read_all_auth on public.user_cash_holdings;
drop policy if exists read_holdings on public.user_cash_holdings;
create policy read_holdings on public.user_cash_holdings
  for select to authenticated
  using (user_id = public.current_app_user()
         or has_permission('stock.custody')
         or has_permission('cash.transfer')
         or has_permission('stock.transfer'));

drop policy if exists read_all_auth on public.user_stock_holdings;
drop policy if exists read_holdings on public.user_stock_holdings;
create policy read_holdings on public.user_stock_holdings
  for select to authenticated
  using (user_id = public.current_app_user()
         or has_permission('stock.custody')
         or has_permission('cash.transfer')
         or has_permission('stock.transfer'));

-- =====================================================================
-- 12. Revoke/grant — authenticated only, exactly once per function
-- =====================================================================
revoke all on function place_purchase_order(jsonb, jsonb) from public, anon;
grant execute on function place_purchase_order(jsonb, jsonb) to authenticated;

revoke all on function post_grn(jsonb, jsonb) from public, anon;
grant execute on function post_grn(jsonb, jsonb) to authenticated;

revoke all on function post_grn_from_po(uuid, date) from public, anon;
grant execute on function post_grn_from_po(uuid, date) to authenticated;

revoke all on function post_supplier_bill(jsonb, jsonb) from public, anon;
grant execute on function post_supplier_bill(jsonb, jsonb) to authenticated;

revoke all on function post_bill_from_grn(uuid, text, date) from public, anon;
grant execute on function post_bill_from_grn(uuid, text, date) to authenticated;

revoke all on function pay_supplier(jsonb, jsonb) from public, anon;
grant execute on function pay_supplier(jsonb, jsonb) to authenticated;

revoke all on function supplier_opening_balance(uuid, numeric, date, text) from public, anon;
grant execute on function supplier_opening_balance(uuid, numeric, date, text) to authenticated;

revoke all on function record_purchase_return(uuid, jsonb, jsonb) from public, anon;
grant execute on function record_purchase_return(uuid, jsonb, jsonb) to authenticated;

revoke all on function bom_standard_cost(uuid, numeric, date) from public, anon;
grant execute on function bom_standard_cost(uuid, numeric, date) to authenticated;