-- =====================================================================
-- 0102_fine_grained_sales.sql
--
-- Fine-grained DB gates for Sales & Invoicing (Task 2).
--
--   • post_invoice        → invoice.create (official) | cashmemo.create (memo)
--   • place_order         → order.create
--   • record_receipt      → invoice.payment OR receipt.record
--   • record_sales_return → invoice.void  (replaces accounting.manage)
--   • approve_order       → order.approve (replaces orders.approve)
--   • cancel_order        → order.cancel
--   • update_order        → order.edit
--   • update_order_line   → order.edit
--   • post_delivery       → challan.record
--   • generate_gst_invoice→ invoice.create
--
-- Bodies are unchanged from the latest repo definition (only the
-- permission gate is added after `begin`). The existing `credit.override`
-- soft-limit branches in post_invoice / place_order are preserved.
--
-- NOTE (not sourced): void_invoice, convert_invoice_type, create_challan,
-- set_challan_status, close_partial_order have NO definition in repo
-- migrations (live-only RPCs). Their gates must be added in a follow-up
-- once their live bodies are captured with pg_get_functiondef.
-- =====================================================================

-- 1. post_invoice — official sale vs cash memo gate
create or replace function post_invoice(p_header jsonb, p_lines jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store    uuid := (p_header->>'store_id')::uuid;
  v_cust     uuid;
  v_date     date := coalesce((p_header->>'invoice_date')::date, current_date);
  v_fy       uuid;
  v_branch   uuid;
  v_supply   text;
  v_home     text;
  v_inter    boolean;
  v_pl       uuid;
  v_inv      uuid;
  v_no       text;
  v_line     jsonb;
  v_item     uuid; v_qty numeric(14,3); v_price numeric(14,2); v_rate numeric(5,2);
  v_cess_r   numeric(5,2);
  v_taxable  numeric(14,2); v_cgst numeric(14,2); v_sgst numeric(14,2);
  v_igst     numeric(14,2); v_cess numeric(14,2); v_ltot numeric(14,2);
  v_sum_tax  numeric(14,2) := 0; v_sum_cgst numeric(14,2) := 0; v_sum_sgst numeric(14,2) := 0;
  v_sum_igst numeric(14,2) := 0; v_sum_cess numeric(14,2) := 0;
  v_grand    numeric(14,2);
  v_round    numeric(14,2);
  v_ln       int := 0;
  v_je       uuid;
  v_cogs_je  uuid;
  v_ar_lines jsonb := '[]'::jsonb;
  v_actor    uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
  v_type     item_type;
  v_official boolean := coalesce(nullif(p_header->>'is_official','')::boolean, true);
  v_avg_cost numeric(14,4);
  v_cc       jsonb;
  v_prev_bal numeric(14,2);
begin
  -- fine-grained gate (previously UI-only)
  if v_official then
    if not has_permission('invoice.create') then
      raise exception 'post_invoice: not authorized (invoice.create required)';
    end if;
  else
    if not has_permission('cashmemo.create') then
      raise exception 'post_invoice: not authorized (cashmemo.create required)';
    end if;
  end if;
  if v_store is null then raise exception 'post_invoice: store_id required'; end if;
  select customer_id into v_cust from customer_stores where id = v_store;
  if v_cust is null then raise exception 'post_invoice: unknown store %', v_store; end if;

  v_fy     := fy_for_date(v_date);
  v_branch := coalesce(nullif(p_header->>'branch_id','')::uuid,
                       (select id from branches where code='HO' limit 1));
  v_pl     := resolve_price_list(v_store);
  v_supply := coalesce(nullif(p_header->>'place_of_supply',''),
                       (select state_code from customer_stores where id = v_store));
  select state_code into v_home from branches where id = v_branch;
  v_home   := coalesce(v_home, (select state_code from company_settings limit 1), '33');
  v_inter  := (v_supply is distinct from v_home);

  if not v_official then
    v_no := next_number('invoice_unofficial', v_date);
  else
    v_no := next_number('invoice', v_date);
  end if;

  insert into invoices (invoice_no, fy_id, order_id, store_id, customer_id, branch_id,
                        invoice_date, place_of_supply, is_interstate, is_official, status, created_by)
  values (v_no, v_fy, nullif(p_header->>'order_id','')::uuid, v_store, v_cust, v_branch,
          v_date, v_supply, v_inter, v_official, 'posted', v_actor)
  returning id into v_inv;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_item := (v_line->>'item_id')::uuid;
    v_qty  := (v_line->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'post_invoice: qty must be > 0'; end if;
    v_price := coalesce(nullif(v_line->>'unit_price','')::numeric,
                        effective_price(v_item, v_pl, v_qty));
    select gst_rate, cess_rate, type into v_rate, v_cess_r, v_type from items where id = v_item;
    v_rate := coalesce(v_rate,0); v_cess_r := coalesce(v_cess_r,0);

    if v_official then
      v_taxable := round(v_qty * v_price, 2);
      v_cess    := round(v_taxable * v_cess_r / 100, 2);
      if v_inter then
        v_igst := round(v_taxable * v_rate / 100, 2); v_cgst := 0; v_sgst := 0;
      else
        v_cgst := round(v_taxable * (v_rate/2) / 100, 2);
        v_sgst := round(v_taxable * (v_rate/2) / 100, 2);
        v_igst := 0;
      end if;
      v_ltot := v_taxable + v_cgst + v_sgst + v_igst + v_cess;
    else
      v_taxable := round(v_qty * v_price, 2);
      v_cgst := 0; v_sgst := 0; v_igst := 0; v_cess := 0;
      v_ltot := v_taxable;
    end if;
    v_ln := v_ln + 1;

    select avg_cost into v_avg_cost
      from stock where item_id = v_item and branch_id = v_branch;
    v_avg_cost := coalesce(v_avg_cost, 0);

    insert into invoice_lines (invoice_id, item_id, qty, unit_price, taxable_amount, gst_rate,
                               cgst_amount, sgst_amount, igst_amount, cess_amount, line_total,
                               line_no, unit_cogs)
    values (v_inv, v_item, v_qty, v_price, v_taxable, v_rate,
            v_cgst, v_sgst, v_igst, v_cess, v_ltot, v_ln, v_avg_cost);

    v_sum_tax  := v_sum_tax + v_taxable; v_sum_cgst := v_sum_cgst + v_cgst;
    v_sum_sgst := v_sum_sgst + v_sgst;   v_sum_igst := v_sum_igst + v_igst;
    v_sum_cess := v_sum_cess + v_cess;

    if v_type <> 'service' then
      perform post_stock_move(v_item, v_branch, 'sale_out', (-1 * v_qty), 0,
                              '5100', 'invoice', v_inv, v_date);
    end if;
  end loop;

  if v_ln = 0 then raise exception 'post_invoice: at least one line required'; end if;

  v_grand := v_sum_tax + v_sum_cgst + v_sum_sgst + v_sum_igst + v_sum_cess;
  v_round := round(v_grand) - v_grand;
  v_grand := v_grand + v_round;

  if v_official then
    v_ar_lines := jsonb_build_array(
      jsonb_build_object('account_code','1130','debit', v_grand,'credit',0,
                         'party_type','customer','party_id', v_cust::text),
      jsonb_build_object('account_code','4100','debit',0,'credit', v_sum_tax));
    if (v_sum_cgst + v_sum_sgst + v_sum_igst) > 0 then
      v_ar_lines := v_ar_lines || jsonb_build_array(
        jsonb_build_object('account_code','2120','debit',0,
                           'credit', v_sum_cgst + v_sum_sgst + v_sum_igst));
    end if;
    if v_sum_cess <> 0 then
      v_ar_lines := v_ar_lines || jsonb_build_array(
        jsonb_build_object('account_code','2120','debit',0,'credit', v_sum_cess));
    end if;
  else
    v_ar_lines := jsonb_build_array(
      jsonb_build_object('account_code','1130','debit', v_grand,'credit',0,
                         'party_type','customer','party_id', v_cust::text),
      jsonb_build_object('account_code','4100','debit',0,'credit', v_grand));
  end if;
  if v_round <> 0 then
    if v_round > 0 then
      v_ar_lines := v_ar_lines || jsonb_build_array(
        jsonb_build_object('account_code','5700','debit',0,'credit', v_round));
    else
      v_ar_lines := v_ar_lines || jsonb_build_array(
        jsonb_build_object('account_code','5700','debit', abs(v_round),'credit',0));
    end if;
  end if;

  v_je := post_journal(
    jsonb_build_object('entry_date', v_date, 'source','sale', 'source_id', v_inv::text,
                       'narration','Invoice '||v_no),
    v_ar_lines);

  select journal_entry_id into v_cogs_je
    from stock_ledger
   where source = 'invoice' and source_id = v_inv
     and move_type = 'sale_out'
   order by moved_at desc
   limit 1;

  update invoices set
      taxable_amount = v_sum_tax, cgst_amount = v_sum_cgst, sgst_amount = v_sum_sgst,
      igst_amount = v_sum_igst, cess_amount = v_sum_cess, round_off = v_round,
      grand_total = v_grand, journal_entry_id = v_je,
      cogs_entry_id = v_cogs_je
    where id = v_inv;

  -- FIX: coalesce guard for customers with no prior ledger entry
  v_prev_bal := coalesce(previous_customer_balance(v_cust), 0);
  insert into customer_ledger (customer_store_id, customer_id, txn_type, reference_id,
                               reference_type, amount, balance_after)
    values (v_store, v_cust, 'sale', v_inv, 'invoices', v_grand, v_prev_bal + v_grand);

  v_cc := check_credit_limit(v_cust, v_grand);
  if (v_cc->>'exceeded')::boolean then
    if has_permission('credit.override') then
      perform write_audit('approve','invoices', v_inv::text,
                format('Credit limit override: outstanding %s + invoice %s = %s, limit %s',
                  v_cc->>'outstanding', v_grand,
                  round(v_grand + (v_cc->>'outstanding')::numeric, 2),
                  v_cc->>'limit'),
                jsonb_build_object('invoice_no', v_no, 'grand_total', v_grand, 'credit_check', v_cc),
                v_actor);
    else
      raise exception 'Credit limit exceeded: outstanding % + invoice % = %, limit is %. Ask a manager to override (needs credit.override permission).',
        v_cc->>'outstanding', round(v_grand,2),
        round(v_grand + (v_cc->>'outstanding')::numeric,2), v_cc->>'limit';
    end if;
  end if;

  if (p_header ? 'order_id') and nullif(p_header->>'order_id','') is not null then
    update sales_orders set status='invoiced', updated_at=now(), version = version + 1
      where id = (p_header->>'order_id')::uuid;
  end if;

  perform write_audit('post','invoices', v_inv::text,
            format('Invoice %s total %s', v_no, v_grand),
            jsonb_build_object('invoice_no', v_no, 'grand_total', v_grand,
                               'is_official', v_official, 'credit_check', v_cc), v_actor);
  return v_inv;
end $$;

-- 2. place_order — create gate (credit.override branch preserved below)
create or replace function place_order(p_header jsonb, p_lines jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store    uuid := (p_header->>'store_id')::uuid;
  v_cust     uuid;
  v_pl       uuid;
  v_date     date := coalesce((p_header->>'order_date')::date, current_date);
  v_fy       uuid;
  v_branch   uuid;
  v_order    uuid;
  v_no       text;
  v_line     jsonb;
  v_item     uuid;
  v_qty      numeric(14,3);
  v_price    numeric(14,2);
  v_rate     numeric(5,2);
  v_ln       int := 0;
  v_total    numeric(14,2) := 0;
  v_cc       jsonb;
  v_actor    uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
begin
  if not has_permission('order.create') then
    raise exception 'place_order: not authorized (order.create required)';
  end if;
  if v_store is null then raise exception 'place_order: store_id required'; end if;
  select customer_id into v_cust from customer_stores where id = v_store;
  if v_cust is null then raise exception 'place_order: unknown store %', v_store; end if;
  v_fy     := fy_for_date(v_date);
  v_pl     := resolve_price_list(v_store);
  v_branch := coalesce(nullif(p_header->>'branch_id','')::uuid,
                       (select id from branches where code='HO' limit 1));
  v_no     := next_number('order', v_date);

  insert into sales_orders (order_no, fy_id, store_id, customer_id, order_date,
                            price_list_id, branch_id, status, notes, created_by, version)
  values (v_no, v_fy, v_store, v_cust, v_date, v_pl, v_branch, 'confirmed',
          p_header->>'notes', v_actor, 1)
  returning id into v_order;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_item := (v_line->>'item_id')::uuid;
    v_qty  := (v_line->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'place_order: qty must be > 0'; end if;
    v_price := coalesce(nullif(v_line->>'unit_price','')::numeric,
                        effective_price(v_item, v_pl, v_qty));
    select gst_rate into v_rate from items where id = v_item;
    v_ln := v_ln + 1;
    insert into sales_order_lines (order_id, item_id, qty, unit_price, gst_rate, line_no)
      values (v_order, v_item, v_qty, v_price, coalesce(v_rate,0), v_ln);
    v_total := v_total + round(v_qty * v_price, 2);
  end loop;

  v_cc := check_credit_limit(v_cust, v_total);
  if (v_cc->>'exceeded')::boolean then
    if has_permission('credit.override') then
      perform write_audit('approve','sales_orders', v_order::text,
                format('Credit limit override: outstanding %s + order %s = %s, limit %s',
                  v_cc->>'outstanding', v_total, round(v_total + (v_cc->>'outstanding')::numeric, 2),
                  v_cc->>'limit'),
                jsonb_build_object('order_no', v_no, 'total', v_total, 'credit_check', v_cc),
                v_actor);
    else
      raise exception 'Credit limit exceeded: outstanding % + order % = %, limit is %. Ask a manager to override (needs credit.override permission).',
        v_cc->>'outstanding', round(v_total,2), round(v_total + (v_cc->>'outstanding')::numeric,2),
        v_cc->>'limit';
    end if;
  end if;

  perform write_audit('insert','sales_orders', v_order::text,
            format('Order %s for store %s (%s lines, %s)', v_no, v_store, v_ln, v_total),
            jsonb_build_object('order_no', v_no, 'total', v_total, 'credit_check', v_cc), v_actor);
  return v_order;
end $$;

-- 3. record_receipt — payment gate (receipt.record kept for collectors)
create or replace function record_receipt(p_header jsonb, p_allocations jsonb default '[]'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cust    uuid := (p_header->>'customer_id')::uuid;
  v_store   uuid := (p_header->>'store_id')::uuid;
  v_amount  numeric(14,2) := (p_header->>'amount')::numeric;
  v_date    date  := coalesce((p_header->>'receipt_date')::date, current_date);
  v_method  uuid := nullif(p_header->>'method_id','')::uuid;
  v_ref     text  := nullif(p_header->>'reference','');
  v_dest    text;
  v_deposit text;
  v_fy      uuid;
  v_rno     text;
  v_rcpt    uuid;
  v_je      uuid;
  v_actor   uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
  v_dr_lines jsonb := '[]'::jsonb;
  v_cr_lines jsonb := '[]'::jsonb;
  v_deposit_line jsonb;
  v_alloc   jsonb;
  v_inv     uuid;
  v_aamt    numeric(14,2);
  v_out     numeric(14,2);
  v_sum_alloc numeric(14,2) := 0;
  v_prev_bal numeric(14,2);
begin
  if not (has_permission('invoice.payment') or has_permission('receipt.record')) then
    raise exception 'record_receipt: not authorized (invoice.payment required)';
  end if;
  if v_cust is null then raise exception 'record_receipt: customer_id required'; end if;
  if v_store is null then raise exception 'record_receipt: store_id required'; end if;
  if v_amount is null or v_amount <= 0 then raise exception 'record_receipt: amount must be > 0'; end if;
  if v_method is null then raise exception 'record_receipt: method_id required'; end if;

  select destination into v_dest from payment_methods where id = v_method;
  if v_dest is null then raise exception 'record_receipt: payment_method % not found', v_method; end if;

  v_fy  := fy_for_date(v_date);
  v_rno := next_number('receipt', v_date);

  v_deposit := coalesce(nullif(p_header->>'deposit_account',''),
    case v_dest
      when 'user_cash'        then '2140'
      when 'bank'             then '1120'
      when 'cheques_in_hand'  then '1180'
      when 'customer_advance' then '2100'
    end);

  insert into customer_receipts (receipt_no, fy_id, customer_id, store_id, receipt_date,
                                 amount, reference, method_id, deposit_account,
                                 created_by)
  values (v_rno, v_fy, v_cust, v_store, v_date, v_amount, v_ref, v_method, v_deposit, v_actor)
  returning id into v_rcpt;

  -- Debit the deposit account (where the money goes)
  v_deposit_line := jsonb_build_object('account_code', v_deposit, 'debit', v_amount, 'credit', 0);

  if v_dest = 'customer_advance' then
    v_cr_lines := jsonb_build_array(
      jsonb_build_object('account_code','2100','debit',0,'credit', v_amount,
                         'party_type','customer','party_id', v_cust::text));
    v_dr_lines := jsonb_build_array(v_deposit_line);
  else
    v_dr_lines := jsonb_build_array(v_deposit_line);
    v_cr_lines := jsonb_build_array(
      jsonb_build_object('account_code','1130','debit',0,'credit', v_amount,
                         'party_type','customer','party_id', v_cust::text));
  end if;

  v_je := post_journal(
    jsonb_build_object('entry_date', v_date, 'source','receipt', 'source_id', v_rcpt::text,
                       'narration','Receipt '||v_rno),
    v_dr_lines || v_cr_lines);

  update customer_receipts set journal_entry_id = v_je where id = v_rcpt;

  -- If explicit allocations given, use them; otherwise auto-allocate FIFO
  -- across open invoices (oldest first) so the payment reduces outstanding
  -- without requiring the user to pick specific invoices.
  if jsonb_typeof(p_allocations) = 'array' and jsonb_array_length(p_allocations) > 0 then
    for v_alloc in select * from jsonb_array_elements(p_allocations) loop
      v_inv  := (v_alloc->>'invoice_id')::uuid;
      v_aamt := (v_alloc->>'amount')::numeric;
      if v_aamt is null or v_aamt <= 0 then raise exception 'allocation amount must be > 0'; end if;

      if (select customer_id from invoices where id = v_inv) is distinct from v_cust then
        raise exception 'allocation invoice % is not for customer %', v_inv, v_cust;
      end if;
      v_out := invoice_outstanding(v_inv);
      if v_aamt > v_out then
        raise exception 'allocation % exceeds invoice % outstanding %', v_aamt, v_inv, v_out;
      end if;

      insert into receipt_allocations (receipt_id, invoice_id, amount)
        values (v_rcpt, v_inv, v_aamt);
      v_sum_alloc := v_sum_alloc + v_aamt;

      update invoices set
          amount_paid = amount_paid + v_aamt,
          status = (case when (amount_paid + v_aamt) >= grand_total then 'paid'
                        else 'part_paid' end)::invoice_status
        where id = v_inv;
    end loop;
  else
    -- Auto-allocate: oldest open invoices first, until receipt is fully allocated
    for v_inv, v_out in
      select i.id, invoice_outstanding(i.id)
        from invoices i
       where i.customer_id = v_cust and i.status in ('posted','part_paid')
       order by i.invoice_date, i.id
    loop
      exit when v_amount <= v_sum_alloc + 0.005;
      v_aamt := least(v_out, v_amount - v_sum_alloc);
      if v_aamt > 0.005 then
        insert into receipt_allocations (receipt_id, invoice_id, amount)
          values (v_rcpt, v_inv, v_aamt);
        v_sum_alloc := v_sum_alloc + v_aamt;

        update invoices set
            amount_paid = amount_paid + v_aamt,
            status = (case when (amount_paid + v_aamt) >= grand_total then 'paid'
                          else 'part_paid' end)::invoice_status
          where id = v_inv;
      end if;
    end loop;
  end if;

  update customer_receipts set allocated_amount = v_sum_alloc where id = v_rcpt;

  v_prev_bal := coalesce(previous_customer_balance(v_cust), 0);
  insert into customer_ledger (customer_store_id, customer_id, txn_type, reference_id,
                               reference_type, amount, balance_after)
    values (v_store, v_cust, 'payment', v_rcpt, 'customer_receipts', -v_amount, v_prev_bal - v_amount);

  perform write_audit('post','customer_receipts', v_rcpt::text,
            format('Receipt %s %s from customer', v_rno, v_amount),
            jsonb_build_object('receipt_no', v_rno, 'amount', v_amount, 'method_id', v_method,
                               'allocated', v_sum_alloc), v_actor);
  return v_rcpt;
end $$;

-- 4. record_sales_return — void gate (replaces accounting.manage)
create or replace function record_sales_return(
  p_invoice uuid, p_lines jsonb, p_opts jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv     invoices%rowtype;
  v_cust    uuid;
  v_date    date := coalesce(nullif(p_opts->>'date','')::date, current_date);
  v_fy      uuid;
  v_line    jsonb;
  v_il      invoice_lines%rowtype;
  v_ilid    uuid; v_qty numeric(14,3);
  v_returned numeric(14,3);
  v_frac    numeric;
  v_base    numeric(14,2); v_tax numeric(14,2);
  v_cogs_u  numeric(14,4);
  v_sum_base numeric(14,2) := 0; v_sum_tax numeric(14,2) := 0;
  v_gross   numeric(14,2);
  v_je      uuid; v_cn uuid;
  v_no      text;
  v_ln      int := 0;
  v_jlines  jsonb := '[]'::jsonb;
  v_rlines  jsonb := '[]'::jsonb;   -- staged return-line rows (post COGS after header exists)
  v_actor   uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
begin
  if not has_permission('invoice.void') then
    raise exception 'record_sales_return: not authorized (invoice.void required)';
  end if;

  select * into v_inv from invoices where id = p_invoice;
  if not found then raise exception 'record_sales_return: unknown invoice %', p_invoice; end if;
  if v_inv.status = 'void' then raise exception 'record_sales_return: invoice % is void', p_invoice; end if;
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'record_sales_return: at least one line required';
  end if;

  v_cust := v_inv.customer_id;
  v_fy   := fy_for_date(v_date);
  -- Tax reversal below rolls CGST+SGST+IGST+cess up to the single 2120 Output
  -- GST account, so interstate (IGST) and intrastate (CGST/SGST) both reverse
  -- correctly with one debit line.

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_ilid := (v_line->>'invoice_line_id')::uuid;
    v_qty  := (v_line->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then continue; end if;

    select * into v_il from invoice_lines where id = v_ilid and invoice_id = p_invoice;
    if not found then
      raise exception 'record_sales_return: line % not on invoice %', v_ilid, p_invoice;
    end if;

    -- already-returned qty on this invoice line across prior returns
    select coalesce(sum(qty),0) into v_returned
      from sales_return_lines where invoice_line_id = v_ilid;
    if v_returned + v_qty > v_il.qty + 1e-6 then
      raise exception 'record_sales_return: line % over-returned (sold %, already %, now %)',
        v_ilid, v_il.qty, v_returned, v_qty;
    end if;

    -- proportional reversal of this line's taxable + tax by returned fraction
    v_frac := v_qty / v_il.qty;
    v_base := round(v_il.taxable_amount * v_frac, 2);
    v_tax  := round((coalesce(v_il.cgst_amount,0) + coalesce(v_il.sgst_amount,0)
                   + coalesce(v_il.igst_amount,0) + coalesce(v_il.cess_amount,0)) * v_frac, 2);

    -- original WA cost the sale expensed: the sale_out ledger row for this item
    -- on this invoice (outflows post at avg_cost, identical across same-item
    -- lines of one invoice, so item-level match is exact).
    select unit_cost into v_cogs_u
      from stock_ledger
     where source = 'invoice' and source_id = p_invoice
       and item_id = v_il.item_id and move_type = 'sale_out'
     order by moved_at limit 1;
    v_cogs_u := coalesce(v_cogs_u, 0);

    v_ln := v_ln + 1;
    v_sum_base := v_sum_base + v_base;
    v_sum_tax  := v_sum_tax  + v_tax;

    v_rlines := v_rlines || jsonb_build_array(jsonb_build_object(
      'invoice_line_id', v_ilid::text, 'item_id', v_il.item_id::text,
      'qty', v_qty, 'unit_cogs', v_cogs_u,
      'taxable_amount', v_base, 'tax_amount', v_tax, 'line_no', v_ln));
  end loop;

  if v_ln = 0 then raise exception 'record_sales_return: nothing to return'; end if;
  v_gross := v_sum_base + v_sum_tax;
  if v_gross <= 0 then raise exception 'record_sales_return: zero-value return'; end if;

  -- ---- value + tax reversal journal (Dr 4900 base, Dr 2120 tax, Cr 1130 AR) ----
  v_jlines := jsonb_build_array(
    jsonb_build_object('account_code','4900','debit', v_sum_base, 'credit', 0));
  if v_sum_tax > 0 then
    v_jlines := v_jlines || jsonb_build_array(
      jsonb_build_object('account_code','2120','debit', v_sum_tax, 'credit', 0));
  end if;
  v_jlines := v_jlines || jsonb_build_array(
    jsonb_build_object('account_code','1130','debit', 0, 'credit', v_gross,
                       'party_type','customer','party_id', v_cust::text));

  v_je := post_journal(
    jsonb_build_object('entry_date', v_date, 'source','credit_note',
                       'narration', coalesce(nullif(p_opts->>'narration',''),
                         'Sales return against '||v_inv.invoice_no)),
    v_jlines);

  -- ---- credit-note header (reason sales_adjustment) ----
  v_no := next_number('credit_note', v_date);
  insert into credit_notes (credit_note_no, fy_id, customer_store_id, customer_id,
                            amount, base_amount, tax_amount, reason, reference_sale_id,
                            narration, status, journal_entry_id, approved_by, created_by)
  values (v_no, v_fy, v_inv.store_id, v_cust, v_gross, v_sum_base, v_sum_tax,
          'sales_adjustment', p_invoice,
          coalesce(nullif(p_opts->>'narration',''), 'Sales return against '||v_inv.invoice_no),
          'posted', v_je, v_actor, v_actor)
  returning id into v_cn;

  update journal_entries set source_id = v_cn where id = v_je;

  -- ---- per-line restock (COGS reversal at original cost) + return-line rows ----
  for v_line in select * from jsonb_array_elements(v_rlines) loop
    -- restock: Dr 1230 FG / Cr 5100 COGS at original unit cost (adjust_in)
    if (v_line->>'unit_cogs')::numeric > 0 then
      perform post_stock_move(
        (v_line->>'item_id')::uuid, v_inv.branch_id, 'adjust_in',
        (v_line->>'qty')::numeric, (v_line->>'unit_cogs')::numeric,
        '5100', 'credit_note', v_cn, v_date);
    end if;
    insert into sales_return_lines (credit_note_id, invoice_id, invoice_line_id, item_id,
                                    qty, unit_cogs, taxable_amount, tax_amount, line_no)
    values (v_cn, p_invoice, (v_line->>'invoice_line_id')::uuid, (v_line->>'item_id')::uuid,
            (v_line->>'qty')::numeric, (v_line->>'unit_cogs')::numeric,
            (v_line->>'taxable_amount')::numeric, (v_line->>'tax_amount')::numeric,
            (v_line->>'line_no')::int);
  end loop;

  perform write_audit('post','credit_notes', v_cn::text,
            format('Sales return %s against %s: %s', v_no, v_inv.invoice_no, v_gross),
            jsonb_build_object('credit_note_no', v_no, 'invoice_no', v_inv.invoice_no,
                               'amount', v_gross, 'lines', v_ln), v_actor);
  return v_cn;
end $$;

-- 5. approve_order — order.approve gate (replaces orders.approve)
create or replace function approve_order(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order sales_orders%rowtype;
  v_actor uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
begin
  if not has_permission('order.approve') then
    raise exception 'approve_order: not authorized (order.approve required)';
  end if;

  select * into v_order from sales_orders where id = p_order_id;
  if not found then raise exception 'approve_order: order % not found', p_order_id; end if;
  if v_order.status <> 'confirmed' then
    raise exception 'approve_order: order % is in status %, must be confirmed', v_order.order_no, v_order.status;
  end if;

  update sales_orders set status = 'approved', updated_at = now()
    where id = p_order_id;

  perform write_audit('approve','sales_orders', p_order_id::text,
            format('Order %s approved', v_order.order_no),
            jsonb_build_object('order_no', v_order.order_no, 'order_date', v_order.order_date), v_actor);
  return p_order_id;
end $$;

-- 6. cancel_order — cancel gate
create or replace function cancel_order(p_order uuid, p_reason text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status order_status;
  v_no     text;
  v_actor  uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
begin
  if not has_permission('order.cancel') then
    raise exception 'cancel_order: not authorized (order.cancel required)';
  end if;
  if p_order is null then raise exception 'cancel_order: order id required'; end if;

  select status, order_no into v_status, v_no
    from sales_orders where id = p_order for update;
  if v_status is null then
    raise exception 'cancel_order: unknown order %', p_order;
  end if;
  if v_status not in ('draft','confirmed') then
    raise exception 'cancel_order: order % is % — only draft/confirmed orders can be cancelled', v_no, v_status;
  end if;

  update sales_orders
     set status = 'cancelled',
         notes  = case
                    when nullif(trim(coalesce(p_reason,'')),'') is null then notes
                    when notes is null or notes = '' then 'Cancelled: '||trim(p_reason)
                    else notes || E'\n' || 'Cancelled: '||trim(p_reason)
                  end
   where id = p_order;

  perform write_audit('update','sales_orders', p_order::text,
            format('Order %s cancelled%s', v_no,
                   case when nullif(trim(coalesce(p_reason,'')),'') is null
                        then '' else ': '||trim(p_reason) end),
            jsonb_build_object('order_no', v_no, 'from', v_status, 'to', 'cancelled'),
            v_actor);
  return p_order;
end $$;

-- 7. update_order — edit gate
create or replace function update_order(
  p_order_id  uuid,
  p_version   int,
  p_header    jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old sales_orders%rowtype;
  v_actor uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
begin
  if not has_permission('order.edit') then
    raise exception 'update_order: not authorized (order.edit required)';
  end if;
  select * into v_old from sales_orders where id = p_order_id;
  if not found then raise exception 'update_order: order % not found', p_order_id; end if;
  if p_version <> v_old.version then
    raise exception 'Stale version: current version is %, but caller sent %. Reload and retry.', v_old.version, p_version;
  end if;
  if v_old.status = 'invoiced' then raise exception 'update_order: order % is already invoiced', v_old.order_no; end if;
  if v_old.status = 'cancelled' then raise exception 'update_order: order % is cancelled', v_old.order_no; end if;

  update sales_orders set
    notes      = coalesce(nullif(p_header->>'notes',''), notes),
    updated_at = now(),
    version    = version + 1
  where id = p_order_id and version = p_version;

  if not found then
    raise exception 'Concurrent modification: order % was modified by another user. Reload and retry.', v_old.order_no;
  end if;

  perform write_audit('update','sales_orders', p_order_id::text,
            format('Order %s updated (notes/header)', v_old.order_no),
            jsonb_build_object('order_no', v_old.order_no, 'old_version', p_version, 'new_version', p_version + 1),
            v_actor);
  return p_order_id;
end $$;

-- 8. update_order_line — edit gate
create or replace function update_order_line(
  p_order_id    uuid,
  p_version     int,
  p_line_id     uuid,
  p_qty         numeric(14,3) default null,
  p_unit_price  numeric(14,2) default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old sales_orders%rowtype;
  v_actor uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
begin
  if not has_permission('order.edit') then
    raise exception 'update_order_line: not authorized (order.edit required)';
  end if;
  select * into v_old from sales_orders where id = p_order_id;
  if not found then raise exception 'update_order_line: order % not found', p_order_id; end if;
  if p_version <> v_old.version then
    raise exception 'Stale version: current version is %, but caller sent %. Reload and retry.', v_old.version, p_version;
  end if;
  if v_old.status = 'invoiced' then raise exception 'update_order_line: order % is invoiced', v_old.order_no; end if;
  if v_old.status = 'cancelled' then raise exception 'update_order_line: order % is cancelled', v_old.order_no; end if;

  update sales_order_lines set
    qty        = coalesce(p_qty, qty),
    unit_price = coalesce(p_unit_price, unit_price)
  where id = p_line_id and order_id = p_order_id;

  if not found then
    raise exception 'Line % not found on order %', p_line_id, v_old.order_no;
  end if;

  update sales_orders set updated_at = now(), version = version + 1
    where id = p_order_id and version = p_version;

  if not found then
    raise exception 'Concurrent modification: order % was modified while updating line. Reload and retry.', v_old.order_no;
  end if;

  perform write_audit('update','sales_order_lines', p_line_id::text,
            format('Line of order %s updated (qty/price)', v_old.order_no),
            jsonb_build_object('order_no', v_old.order_no, 'line_id', p_line_id,
                               'qty', p_qty, 'unit_price', p_unit_price,
                               'old_version', p_version, 'new_version', p_version + 1),
            v_actor);
  return p_line_id;
end $$;

-- 9. post_delivery — challan.record gate
create or replace function post_delivery(p_order uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_o            sales_orders%rowtype;
  v_cust         uuid;
  v_store_state  text;
  v_home_state   text;
  v_inter        boolean;
  v_fy           uuid;
  v_branch       uuid;
  v_challan      uuid;
  v_challan_no   text;
  v_date         date := current_date;
  v_actor        uuid;
  v_line         record;
  v_qty_delivering numeric(14,3);
  v_prev_bal     numeric(14,2);
  v_sum_tax      numeric(14,2) := 0;
  v_sum_cgst     numeric(14,2) := 0;
  v_sum_sgst     numeric(14,2) := 0;
  v_sum_igst     numeric(14,2) := 0;
  v_sum_cess     numeric(14,2) := 0;
  v_grand        numeric(14,2);
  v_round        numeric(14,2);
  v_je           uuid;
  v_cogs_je      uuid;
  v_ar_lines     jsonb := '[]'::jsonb;
  v_type         item_type;
  v_rate         numeric(5,2);
  v_cess_r       numeric(5,2);
  v_taxable      numeric(14,2);
  v_cgst         numeric(14,2);
  v_sgst         numeric(14,2);
  v_igst         numeric(14,2);
  v_cess         numeric(14,2);
  v_ln           int := 0;
begin
  if not has_permission('challan.record') then
    raise exception 'post_delivery: not authorized (challan.record required)';
  end if;
  select * into v_o from sales_orders where id = p_order;
  if not found then raise exception 'post_delivery: order % not found', p_order; end if;
  if v_o.status = 'invoiced'  then raise exception 'post_delivery: order % already invoiced', v_o.order_no; end if;
  if v_o.status = 'cancelled' then raise exception 'post_delivery: order % is cancelled', v_o.order_no; end if;
  if v_o.status = 'fulfilled' then raise exception 'post_delivery: order % already fulfilled', v_o.order_no; end if;
  if v_o.status = 'draft'     then raise exception 'post_delivery: order % is draft — confirm first', v_o.order_no; end if;

  v_actor  := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
  v_fy     := v_o.fy_id;
  v_branch := v_o.branch_id;
  v_cust   := v_o.customer_id;

  select state_code into v_store_state from customer_stores where id = v_o.store_id;
  select state_code into v_home_state from branches where id = v_branch;
  v_home_state := coalesce(v_home_state, (select state_code from company_settings limit 1), '33');
  v_inter := (v_store_state is distinct from v_home_state);

  -- create challan for all remaining qty
  v_challan_no := next_number('challan', v_date);
  insert into delivery_challans (challan_no, fy_id, order_id, branch_id, status, printed_at, delivered_at, created_by)
    values (v_challan_no, v_fy, p_order, v_branch, 'delivered', now(), now(), v_actor)
    returning id into v_challan;

  for v_line in
    select l.*, i.type, i.gst_rate, i.cess_rate
    from sales_order_lines l
    join items i on i.id = l.item_id
    where l.order_id = p_order
    order by l.line_no
  loop
    v_qty_delivering := v_line.qty - coalesce(v_line.qty_fulfilled, 0);
    if v_qty_delivering <= 0 then continue; end if;

    v_ln := v_ln + 1;
    insert into delivery_challan_lines (challan_id, order_line_id, item_id, qty, line_no)
      values (v_challan, v_line.id, v_line.item_id, v_qty_delivering, v_ln);

    update sales_order_lines set qty_fulfilled = coalesce(qty_fulfilled, 0) + v_qty_delivering
      where id = v_line.id;

    v_rate   := coalesce(v_line.gst_rate, 0);
    v_cess_r := coalesce(v_line.cess_rate, 0);
    v_type   := v_line.type;
    v_taxable := round(v_qty_delivering * v_line.unit_price, 2);
    v_cess    := round(v_taxable * v_cess_r / 100, 2);
    if v_inter then
      v_igst := round(v_taxable * v_rate / 100, 2); v_cgst := 0; v_sgst := 0;
    else
      v_cgst := round(v_taxable * (v_rate/2) / 100, 2);
      v_sgst := round(v_taxable * (v_rate/2) / 100, 2);
      v_igst := 0;
    end if;

    v_sum_tax  := v_sum_tax + v_taxable;
    v_sum_cgst := v_sum_cgst + v_cgst;
    v_sum_sgst := v_sum_sgst + v_sgst;
    v_sum_igst := v_sum_igst + v_igst;
    v_sum_cess := v_sum_cess + v_cess;

    if v_type <> 'service' then
      perform post_stock_move(v_line.item_id, v_branch, 'sale_out', (-1 * v_qty_delivering), 0,
                              '5100', 'challan', v_challan, v_date);
    end if;
  end loop;

  if v_ln = 0 then
    update delivery_challans set status = 'cancelled' where id = v_challan;
    raise exception 'post_delivery: order % has nothing left to deliver', v_o.order_no;
  end if;

  v_grand := v_sum_tax + v_sum_cgst + v_sum_sgst + v_sum_igst + v_sum_cess;
  v_round := round(v_grand) - v_grand;
  v_grand := v_grand + v_round;

  v_ar_lines := jsonb_build_array(
    jsonb_build_object('account_code','1130','debit', v_grand,'credit',0,
                       'party_type','customer','party_id', v_cust::text),
    jsonb_build_object('account_code','4100','debit',0,'credit', v_sum_tax));
  if (v_sum_cgst + v_sum_sgst + v_sum_igst) > 0 then
    v_ar_lines := v_ar_lines || jsonb_build_array(
      jsonb_build_object('account_code','2120','debit',0,
                         'credit', v_sum_cgst + v_sum_sgst + v_sum_igst));
  end if;
  if v_sum_cess <> 0 then
    v_ar_lines := v_ar_lines || jsonb_build_array(
      jsonb_build_object('account_code','2120','debit',0,'credit', v_sum_cess));
  end if;
  if v_round <> 0 then
    if v_round > 0 then
      v_ar_lines := v_ar_lines || jsonb_build_array(
        jsonb_build_object('account_code','5700','debit',0,'credit', v_round));
    else
      v_ar_lines := v_ar_lines || jsonb_build_array(
        jsonb_build_object('account_code','5700','debit', abs(v_round),'credit',0));
    end if;
  end if;

  v_je := post_journal(
    jsonb_build_object('entry_date', v_date, 'source','delivery', 'source_id', v_challan::text,
                       'narration','Delivery '||v_challan_no),
    v_ar_lines);

  select journal_entry_id into v_cogs_je
    from stock_ledger
   where source = 'challan' and source_id = v_challan
     and move_type = 'sale_out'
   order by moved_at desc
   limit 1;

  update delivery_challans set journal_entry_id = v_je, cogs_entry_id = v_cogs_je
    where id = v_challan;

  v_prev_bal := coalesce(previous_customer_balance(v_cust), 0);
  insert into customer_ledger (customer_store_id, customer_id, txn_type, reference_id,
                               reference_type, amount, balance_after)
    values (v_o.store_id, v_cust, 'sale', v_challan, 'delivery_challans', v_grand, v_prev_bal + v_grand);

  update sales_orders set status='fulfilled', updated_at=now(), version = version + 1
    where id = p_order;

  perform write_audit('post','delivery_challans', v_challan::text,
            format('Delivery %s total %s from order %s', v_challan_no, v_grand, v_o.order_no),
            jsonb_build_object('challan_no', v_challan_no, 'grand_total', v_grand,
                               'order_no', v_o.order_no), v_actor);

  return v_challan;
end $$;

-- 10. generate_gst_invoice — create gate
create or replace function generate_gst_invoice(p_order uuid, p_date date default current_date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_o            sales_orders%rowtype;
  v_cust         uuid;
  v_store_state  text;
  v_home_state   text;
  v_inter        boolean;
  v_branch       uuid;
  v_inv          uuid;
  v_no           text;
  v_fy           uuid;
  v_line         record;
  v_rate         numeric(5,2);
  v_cess_r       numeric(5,2);
  v_taxable      numeric(14,2);
  v_cgst         numeric(14,2);
  v_sgst         numeric(14,2);
  v_igst         numeric(14,2);
  v_cess         numeric(14,2);
  v_ltot         numeric(14,2);
  v_sum_tax      numeric(14,2) := 0;
  v_sum_cgst     numeric(14,2) := 0;
  v_sum_sgst     numeric(14,2) := 0;
  v_sum_igst     numeric(14,2) := 0;
  v_sum_cess     numeric(14,2) := 0;
  v_grand        numeric(14,2);
  v_round        numeric(14,2);
  v_ln           int := 0;
  v_je           uuid;
  v_actor        uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
begin
  if not has_permission('invoice.create') then
    raise exception 'generate_gst_invoice: not authorized (invoice.create required)';
  end if;
  select * into v_o from sales_orders where id = p_order;
  if not found then raise exception 'generate_gst_invoice: order % not found', p_order; end if;
  if v_o.status = 'cancelled' then raise exception 'generate_gst_invoice: order % is cancelled', v_o.order_no; end if;
  if v_o.status = 'draft'     then raise exception 'generate_gst_invoice: order % is draft — fulfil first', v_o.order_no; end if;
  if v_o.status = 'confirmed' then raise exception 'generate_gst_invoice: order % must be fulfilled first (status: confirmed)', v_o.order_no; end if;
  if v_o.status = 'invoiced'  then raise exception 'generate_gst_invoice: order % already invoiced', v_o.order_no; end if;

  v_fy     := v_o.fy_id;
  v_branch := v_o.branch_id;
  v_cust   := v_o.customer_id;

  select state_code into v_store_state from customer_stores where id = v_o.store_id;
  select state_code into v_home_state from branches where id = v_branch;
  v_home_state := coalesce(v_home_state, (select state_code from company_settings limit 1), '33');
  v_inter := (v_store_state is distinct from v_home_state);

  v_no := next_number('invoice', p_date);

  insert into invoices (invoice_no, fy_id, order_id, store_id, customer_id, branch_id,
                         invoice_date, place_of_supply, is_interstate, status, created_by)
    values (v_no, v_fy, p_order, v_o.store_id, v_cust, v_branch,
            p_date, coalesce(v_store_state, '33'), v_inter, 'posted', v_actor)
    returning id into v_inv;

  for v_line in
    select l.*, i.gst_rate, i.cess_rate
    from sales_order_lines l
    join items i on i.id = l.item_id
    where l.order_id = p_order
    order by l.line_no
  loop
    v_rate   := coalesce(v_line.gst_rate, 0);
    v_cess_r := coalesce(v_line.cess_rate, 0);
    v_taxable := round(v_line.qty * v_line.unit_price, 2);
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

    insert into invoice_lines (invoice_id, item_id, qty, unit_price, taxable_amount, gst_rate,
                                cgst_amount, sgst_amount, igst_amount, cess_amount, line_total, line_no)
      values (v_inv, v_line.item_id, v_line.qty, v_line.unit_price, v_taxable, v_rate,
              v_cgst, v_sgst, v_igst, v_cess, v_ltot, v_ln);

    v_sum_tax  := v_sum_tax + v_taxable;
    v_sum_cgst := v_sum_cgst + v_cgst;
    v_sum_sgst := v_sum_sgst + v_sgst;
    v_sum_igst := v_sum_igst + v_igst;
    v_sum_cess := v_sum_cess + v_cess;
  end loop;

  v_grand := v_sum_tax + v_sum_cgst + v_sum_sgst + v_sum_igst + v_sum_cess;
  v_round := round(v_grand) - v_grand;
  v_grand := v_grand + v_round;

  select journal_entry_id into v_je
    from delivery_challans
   where order_id = p_order and status = 'delivered'
     and journal_entry_id is not null
   order by delivered_at desc
   limit 1;

  update invoices set
      taxable_amount = v_sum_tax, cgst_amount = v_sum_cgst, sgst_amount = v_sum_sgst,
      igst_amount = v_sum_igst, cess_amount = v_sum_cess, round_off = v_round,
      grand_total = v_grand, journal_entry_id = v_je
    where id = v_inv;

  if v_je is not null then
    update invoices set journal_entry_id = v_je where id = v_inv;
  end if;

  update sales_orders set status='invoiced', updated_at=now(), version = version + 1
    where id = p_order;

  perform write_audit('post','invoices', v_inv::text,
            format('GST invoice %s for order %s (linked to delivery journal)', v_no, v_o.order_no),
            jsonb_build_object('invoice_no', v_no, 'grand_total', v_grand,
                               'order_no', v_o.order_no), v_actor);

  return v_inv;
end $$;

-- =====================================================================
-- 11. Live-captured Sales RPC gates (bodies from pg_get_functiondef)
--
-- These five functions exist only in the live DB (no repo migration
-- defines them). The controller captured each body on 2026-08-14.
-- Bodies are used verbatim; ONLY the existing coarse gate immediately
-- after `begin` is replaced with the plan's fine gate (no second gate).
-- =====================================================================

-- 11a. void_invoice — void gate
CREATE OR REPLACE FUNCTION public.void_invoice(p_invoice uuid, p_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_inv     invoices%rowtype;
  v_line    record;
  v_type    item_type;
  v_actor   uuid := current_app_user();
  v_prev    numeric(14,2);
begin
  if not has_permission('invoice.void') then
    raise exception 'void_invoice: not authorized (invoice.void required)';
  end if;

  select * into v_inv from invoices where id = p_invoice for update;
  if not found then raise exception 'void_invoice: invoice % not found', p_invoice; end if;
  if v_inv.status = 'void' then
    raise exception 'void_invoice: invoice % is already void', v_inv.invoice_no;
  end if;
  if coalesce(v_inv.amount_paid, 0) <> 0 then
    raise exception 'void_invoice: % has payments allocated (paid %). Un-allocate receipts before voiding.',
      v_inv.invoice_no, v_inv.amount_paid;
  end if;

  -- 1) Reverse the sale journal (AR / Sales / GST)
  if v_inv.journal_entry_id is not null then
    perform reverse_journal(v_inv.journal_entry_id,
      coalesce('Void ' || v_inv.invoice_no || ': ' || p_reason, 'Void of ' || v_inv.invoice_no));
  end if;

  -- 2) Restore stock for each stocked line. adjust_in at the original unit_cogs
  --    re-adds qty AND posts Dr Inventory / Cr COGS(5100), reversing the sale COGS.
  for v_line in
    select il.item_id, il.qty, il.unit_cogs
      from invoice_lines il where il.invoice_id = p_invoice
  loop
    select type into v_type from items where id = v_line.item_id;
    if v_type is distinct from 'service' and v_line.qty > 0 then
      perform post_stock_move(v_line.item_id, v_inv.branch_id, 'adjust_in',
                              v_line.qty, coalesce(v_line.unit_cogs, 0),
                              '5100', 'invoice_void', p_invoice, current_date);
    end if;
  end loop;

  -- 3) Reverse the customer ledger running balance
  v_prev := coalesce(previous_customer_balance(v_inv.customer_id), 0);
  insert into customer_ledger (customer_store_id, customer_id, txn_type, reference_id,
                               reference_type, amount, balance_after)
    values (v_inv.store_id, v_inv.customer_id, 'sale_void', p_invoice, 'invoices',
            -1 * v_inv.grand_total, v_prev - v_inv.grand_total);

  -- 4) Mark the invoice void
  update invoices set status = 'void' where id = p_invoice;

  -- 5) Release a linked order back to approved so it can be re-invoiced
  if v_inv.order_id is not null then
    update sales_orders set status = 'approved', updated_at = now(), version = version + 1
      where id = v_inv.order_id and status = 'invoiced';
  end if;

  perform write_audit('void', 'invoices', p_invoice::text,
            format('Voided %s (total %s)%s', v_inv.invoice_no, v_inv.grand_total,
                   case when p_reason is null then '' else ': ' || p_reason end),
            jsonb_build_object('invoice_no', v_inv.invoice_no, 'grand_total', v_inv.grand_total,
                               'is_official', v_inv.is_official, 'reason', p_reason),
            v_actor);
  return p_invoice;
end $function$;

-- 11b. convert_invoice_type — cashmemo.edit gate
CREATE OR REPLACE FUNCTION public.convert_invoice_type(p_invoice uuid, p_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_inv    invoices%rowtype;
  v_lines  jsonb;
  v_header jsonb;
  v_new    uuid;
  v_reason text;
begin
  if not has_permission('cashmemo.edit') then
    raise exception 'convert_invoice_type: not authorized (cashmemo.edit required)';
  end if;

  select * into v_inv from invoices where id = p_invoice for update;
  if not found then raise exception 'convert_invoice_type: invoice % not found', p_invoice; end if;
  if v_inv.status = 'void' then
    raise exception 'convert_invoice_type: % is already void', v_inv.invoice_no;
  end if;

  v_reason := coalesce(p_reason,
    format('Re-issued as %s', case when v_inv.is_official then 'cash memo' else 'tax invoice' end));

  -- Snapshot the lines before the void (item_id, qty, and the exact unit_price)
  select jsonb_agg(jsonb_build_object(
           'item_id', il.item_id::text,
           'qty', il.qty,
           'unit_price', il.unit_price) order by il.line_no)
    into v_lines
    from invoice_lines il where il.invoice_id = p_invoice;

  if v_lines is null then
    raise exception 'convert_invoice_type: % has no lines', v_inv.invoice_no;
  end if;

  -- Void the wrong-type document (reverses journals, restocks, ledger)
  perform void_invoice(p_invoice, v_reason);

  -- Re-issue with the opposite is_official, preserving store/date/order/pos/prices
  v_header := jsonb_build_object(
    'store_id', v_inv.store_id::text,
    'invoice_date', v_inv.invoice_date::text,
    'place_of_supply', v_inv.place_of_supply,
    'is_official', (not v_inv.is_official),
    'branch_id', v_inv.branch_id::text);
  if v_inv.order_id is not null then
    v_header := v_header || jsonb_build_object('order_id', v_inv.order_id::text);
  end if;

  v_new := post_invoice(v_header, v_lines);

  perform write_audit('update', 'invoices', p_invoice::text,
            format('Converted %s -> %s (new doc)',
                   v_inv.invoice_no,
                   case when v_inv.is_official then 'cash memo' else 'tax invoice' end),
            jsonb_build_object('old_invoice', v_inv.invoice_no,
                               'old_is_official', v_inv.is_official,
                               'new_invoice_id', v_new, 'reason', p_reason),
            current_app_user());
  return v_new;
end $function$;

-- 11c. create_challan — challan.record gate (replaces the first check after
--      `begin`; the `if v_order is null ...` check below stays untouched)
CREATE OR REPLACE FUNCTION public.create_challan(p_header jsonb, p_lines jsonb DEFAULT '[]'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order    uuid := nullif(p_header->>'order_id','')::uuid;
  v_status   order_status;
  v_branch   uuid;
  v_ord_branch uuid;
  v_fy       uuid;
  v_date     date := coalesce((p_header->>'challan_date')::date, current_date);
  v_ch       uuid;
  v_no       text;
  v_line     jsonb;
  v_oline    uuid; v_qty numeric(14,3); v_item uuid;
  v_ordered  numeric(14,3); v_fulfilled numeric(14,3); v_remaining numeric(14,3);
  v_ln       int := 0;
  v_actor    uuid := current_app_user();
begin
  if not has_permission('challan.record') then
    raise exception 'create_challan: not authorized (challan.record required)';
  end if;
  if v_order is null then raise exception 'create_challan: order_id required'; end if;

  select status, branch_id, fy_id into v_status, v_ord_branch, v_fy
    from sales_orders where id = v_order for update;
  if v_status is null then raise exception 'create_challan: unknown order %', v_order; end if;
  if v_status not in ('confirmed','partially_fulfilled') then
    raise exception 'create_challan: order is % — only confirmed/partially_fulfilled orders can be dispatched', v_status;
  end if;

  v_branch := coalesce(nullif(p_header->>'branch_id','')::uuid, v_ord_branch);
  v_no     := next_number('challan', v_date);

  insert into delivery_challans (challan_no, fy_id, order_id, branch_id, agent_id,
                                 status, eway_bill_no, notes, created_by)
  values (v_no, v_fy, v_order, v_branch,
          nullif(p_header->>'agent_id','')::uuid, 'printed',
          nullif(p_header->>'eway_bill_no',''), nullif(p_header->>'notes',''), v_actor)
  returning id into v_ch;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_oline := (v_line->>'order_line_id')::uuid;
    v_qty   := (v_line->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'create_challan: qty must be > 0'; end if;

    select qty, qty_fulfilled, item_id into v_ordered, v_fulfilled, v_item
      from sales_order_lines where id = v_oline and order_id = v_order for update;
    if v_ordered is null then
      raise exception 'create_challan: line % does not belong to order %', v_oline, v_order;
    end if;
    -- remaining also nets any qty already scheduled on other non-cancelled challans
    v_remaining := v_ordered - v_fulfilled - coalesce((
        select sum(dcl.qty) from delivery_challan_lines dcl
          join delivery_challans dc on dc.id = dcl.challan_id
         where dcl.order_line_id = v_oline and dc.status <> 'cancelled'), 0);
    if v_qty > v_remaining + 1e-6 then
      raise exception 'create_challan: line % delivers % but only % remain', v_oline, v_qty, v_remaining;
    end if;

    v_ln := v_ln + 1;
    insert into delivery_challan_lines (challan_id, order_line_id, item_id, qty, line_no)
      values (v_ch, v_oline, v_item, v_qty, v_ln);
  end loop;

  if v_ln = 0 then raise exception 'create_challan: at least one line required'; end if;

  perform write_audit('insert','delivery_challans', v_ch::text,
            format('Challan %s for order (%s lines)', v_no, v_ln),
            jsonb_build_object('challan_no', v_no, 'order_id', v_order), v_actor);
  return v_ch;
end $function$;

-- 11d. set_challan_status — challan.record gate
CREATE OR REPLACE FUNCTION public.set_challan_status(p_id uuid, p_status text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cur     challan_status;
  v_new     challan_status := p_status::challan_status;
  v_order   uuid;
  v_no      text;
  v_line    record;
  v_remaining numeric(14,3);
  v_actor   uuid := current_app_user();
begin
  if not has_permission('challan.record') then
    raise exception 'set_challan_status: not authorized (challan.record required)';
  end if;

  select status, order_id, challan_no into v_cur, v_order, v_no
    from delivery_challans where id = p_id for update;
  if v_cur is null then raise exception 'set_challan_status: unknown challan %', p_id; end if;
  if v_cur in ('delivered','cancelled') then
    raise exception 'set_challan_status: challan % is % (terminal)', v_no, v_cur;
  end if;

  -- allowed transitions
  if not (
       (v_cur = 'printed'    and v_new in ('in_transit','delivered','cancelled'))
    or (v_cur = 'in_transit' and v_new in ('delivered','cancelled'))
  ) then
    raise exception 'set_challan_status: cannot move % from % to %', v_no, v_cur, v_new;
  end if;

  if v_new = 'delivered' then
    -- guard: the parent order must still be live
    perform 1 from sales_orders
      where id = v_order and status in ('confirmed','partially_fulfilled') for update;
    if not found then
      raise exception 'set_challan_status: order for challan % is not open for delivery', v_no;
    end if;

    for v_line in
      select order_line_id, qty from delivery_challan_lines where challan_id = p_id
    loop
      update sales_order_lines
         set qty_fulfilled = qty_fulfilled + v_line.qty
       where id = v_line.order_line_id;
    end loop;

    update delivery_challans
       set status = 'delivered',
           delivered_at = now(),
           dispatched_at = coalesce(dispatched_at, now())
     where id = p_id;

    -- roll the order up: fully fulfilled on every line => 'fulfilled'
    select coalesce(sum(greatest(qty - qty_fulfilled, 0)), 0)
      into v_remaining from sales_order_lines where order_id = v_order;
    if v_remaining <= 1e-6 then
      update sales_orders set status = 'fulfilled', updated_at = now() where id = v_order;
    end if;

  elsif v_new = 'cancelled' then
    update delivery_challans set status = 'cancelled' where id = p_id;
  else
    update delivery_challans
       set status = v_new,
           dispatched_at = case when v_new = 'in_transit' then now() else dispatched_at end
     where id = p_id;
  end if;

  perform write_audit('update','delivery_challans', p_id::text,
            format('Challan %s → %s', v_no, v_new),
            jsonb_build_object('from', v_cur, 'to', v_new), v_actor);
  return p_id;
end $function$;

-- 11e. close_partial_order — order.cancel gate
CREATE OR REPLACE FUNCTION public.close_partial_order(p_order uuid, p_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_o        sales_orders%rowtype;
  v_new      uuid;
  v_no       text;
  v_delivered numeric(14,3);
  v_remaining numeric(14,3);
  v_line     record;
  v_ln       int := 0;
  v_actor    uuid := current_app_user();
begin
  if not has_permission('order.cancel') then
    raise exception 'close_partial_order: not authorized (order.cancel required)';
  end if;

  select * into v_o from sales_orders where id = p_order for update;
  if v_o.id is null then raise exception 'close_partial_order: unknown order %', p_order; end if;
  if v_o.status <> 'confirmed' then
    raise exception 'close_partial_order: order % is % — only a confirmed order can be closed', v_o.order_no, v_o.status;
  end if;

  select coalesce(sum(qty_fulfilled),0), coalesce(sum(greatest(qty - qty_fulfilled,0)),0)
    into v_delivered, v_remaining
    from sales_order_lines where order_id = p_order;

  if v_delivered <= 1e-6 then
    raise exception 'close_partial_order: nothing delivered yet on order %', v_o.order_no;
  end if;

  if v_remaining <= 1e-6 then
    update sales_orders set status = 'fulfilled', updated_at = now() where id = p_order;
    perform write_audit('update','sales_orders', p_order::text,
              format('Order %s fully delivered — marked fulfilled', v_o.order_no), null, v_actor);
    return null;
  end if;

  -- spawn a follow-up for the undelivered remainder
  v_no := next_number('order', current_date);
  insert into sales_orders (order_no, fy_id, store_id, customer_id, order_date,
                            price_list_id, branch_id, status, notes, created_by, parent_order_id)
  values (v_no, fy_for_date(current_date), v_o.store_id, v_o.customer_id, current_date,
          v_o.price_list_id, v_o.branch_id, 'confirmed',
          format('Follow-up for %s (undelivered balance)%s', v_o.order_no,
                 case when nullif(trim(coalesce(p_reason,'')),'') is null then '' else ': '||trim(p_reason) end),
          v_actor, p_order)
  returning id into v_new;

  for v_line in
    select item_id, (qty - qty_fulfilled) as bal, unit_price, gst_rate
      from sales_order_lines
     where order_id = p_order and (qty - qty_fulfilled) > 1e-6
     order by line_no
  loop
    v_ln := v_ln + 1;
    insert into sales_order_lines (order_id, item_id, qty, unit_price, gst_rate, line_no)
      values (v_new, v_line.item_id, round(v_line.bal,3), v_line.unit_price, v_line.gst_rate, v_ln);
  end loop;

  update sales_orders set status = 'partially_fulfilled', followup_order_id = v_new, updated_at = now()
    where id = p_order;

  perform write_audit('update','sales_orders', p_order::text,
            format('Order %s partially fulfilled — follow-up %s created for balance', v_o.order_no, v_no),
            jsonb_build_object('delivered', v_delivered, 'remaining', v_remaining, 'followup', v_new), v_actor);
  return v_new;
end $function$;

-- =====================================================================
-- 12. Sales register RLS rewrite
--
-- The invoices register serves BOTH doc types (tax invoices + cash memos).
-- A cash-memo-only user (agent/sales) has NO invoice.view / cashmemo.view
-- but must read the memo they just recorded (self-service acknowledgment
-- receipt, Task 9). Old policy: read_all_auth (using true). New policy:
-- invoice.view OR cashmemo.view OR owner (created_by = current user).
-- =====================================================================
drop policy if exists read_all_auth on public.invoices;
create policy read_invoices on public.invoices
  for select to authenticated
  using (
    has_permission('invoice.view')
    or has_permission('cashmemo.view')
    or created_by = public.current_app_user()
  );

-- =====================================================================
-- 13. Revoke/grant — authenticated only, exactly once per function
-- =====================================================================
revoke all on function post_invoice(jsonb, jsonb) from public, anon;
grant execute on function post_invoice(jsonb, jsonb) to authenticated;

revoke all on function place_order(jsonb, jsonb) from public, anon;
grant execute on function place_order(jsonb, jsonb) to authenticated;

revoke all on function record_receipt(jsonb, jsonb) from public, anon;
grant execute on function record_receipt(jsonb, jsonb) to authenticated;

revoke all on function record_sales_return(uuid, jsonb, jsonb) from public, anon;
grant execute on function record_sales_return(uuid, jsonb, jsonb) to authenticated;

revoke all on function approve_order(uuid) from public, anon;
grant execute on function approve_order(uuid) to authenticated;

revoke all on function cancel_order(uuid, text) from public, anon;
grant execute on function cancel_order(uuid, text) to authenticated;

revoke all on function update_order(uuid, int, jsonb) from public, anon;
grant execute on function update_order(uuid, int, jsonb) to authenticated;

revoke all on function update_order_line(uuid, int, uuid, numeric, numeric) from public, anon;
grant execute on function update_order_line(uuid, int, uuid, numeric, numeric) to authenticated;

revoke all on function post_delivery(uuid) from public, anon;
grant execute on function post_delivery(uuid) to authenticated;

revoke all on function generate_gst_invoice(uuid, date) from public, anon;
grant execute on function generate_gst_invoice(uuid, date) to authenticated;

revoke all on function void_invoice(uuid, text) from public, anon;
grant execute on function void_invoice(uuid, text) to authenticated;

revoke all on function convert_invoice_type(uuid, text) from public, anon;
grant execute on function convert_invoice_type(uuid, text) to authenticated;

revoke all on function create_challan(jsonb, jsonb) from public, anon;
grant execute on function create_challan(jsonb, jsonb) to authenticated;

revoke all on function set_challan_status(uuid, text) from public, anon;
grant execute on function set_challan_status(uuid, text) to authenticated;

revoke all on function close_partial_order(uuid, text) from public, anon;
grant execute on function close_partial_order(uuid, text) to authenticated;