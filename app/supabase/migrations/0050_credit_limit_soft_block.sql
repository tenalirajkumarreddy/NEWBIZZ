-- =====================================================================
-- 0050_credit_limit_soft_block.sql
--
-- Soft-block credit enforcement: check_credit_limit returns a JSONB
-- result instead of raising. Callers (place_order, post_invoice) decide
-- whether to block or allow based on the caller's credit.override
-- permission. (Spec §4.3: "requires credit.override (manager) with reason
-- → audit_log.")
-- =====================================================================

-- 1. Rewrite check_credit_limit: returns jsonb, never raises
drop function if exists check_credit_limit(uuid, numeric);

create or replace function check_credit_limit(
  p_customer_id uuid,
  p_order_value numeric(14,2)
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit   numeric(14,2);
  v_out     numeric(14,2);
begin
  select credit_limit into v_limit from customers where id = p_customer_id;
  if v_limit is null or v_limit <= 0 then
    return jsonb_build_object('exceeded', false, 'limit', 0, 'outstanding', 0, 'available', 0);
  end if;

  select coalesce(sum(grand_total - amount_paid), 0) into v_out
    from invoices
   where customer_id = p_customer_id
     and status in ('posted','part_paid');

  if v_out + p_order_value > v_limit then
    return jsonb_build_object(
      'exceeded', true,
      'limit', round(v_limit, 2),
      'outstanding', round(v_out, 2),
      'available', round(v_limit - v_out, 2)
    );
  end if;

  return jsonb_build_object(
    'exceeded', false,
    'limit', round(v_limit, 2),
    'outstanding', round(v_out, 2),
    'available', round(v_limit - v_out, 2)
  );
end $$;

comment on function check_credit_limit is 'Returns JSONB {exceeded, limit, outstanding, available}. Callers check exceeded and decide whether to block or allow based on caller credit.override permission. Never raises.';

-- 2. Rewrite place_order with soft-block credit enforcement
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
  if v_store is null then raise exception 'place_order: store_id required'; end if;
  select customer_id into v_cust from customer_stores where id = v_store;
  if v_cust is null then raise exception 'place_order: unknown store %', v_store; end if;
  v_fy     := fy_for_date(v_date);
  v_pl     := resolve_price_list(v_store);
  v_branch := coalesce(nullif(p_header->>'branch_id','')::uuid,
                       (select id from branches where code='HO' limit 1));
  v_no     := next_number('order', v_date);

  insert into sales_orders (order_no, fy_id, store_id, customer_id, order_date,
                            price_list_id, branch_id, status, notes, created_by)
  values (v_no, v_fy, v_store, v_cust, v_date, v_pl, v_branch, 'confirmed',
          p_header->>'notes', v_actor)
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

  -- Soft credit-limit enforcement
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
comment on function place_order is 'Create a confirmed sales order. Enforces credit limit — soft-block with manager override via credit.override permission.';

-- 3. Rewrite post_invoice with soft-block credit enforcement
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
begin
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

  -- Reserve number series (official or unofficial)
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

  -- Soft credit-limit enforcement
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
    update sales_orders set status='invoiced', updated_at=now()
      where id = (p_header->>'order_id')::uuid;
  end if;

  perform write_audit('post','invoices', v_inv::text,
            format('Invoice %s total %s', v_no, v_grand),
            jsonb_build_object('invoice_no', v_no, 'grand_total', v_grand,
                               'is_official', v_official, 'credit_check', v_cc), v_actor);
  return v_inv;
end $$;
comment on function post_invoice is 'Record a sale: posts revenue + journal + stock move + COGS. Supports official (GST) and unofficial (non-GST) sales. Soft credit-limit enforcement with manager override.';

-- 4. Grants
revoke all on function check_credit_limit(uuid, numeric) from public, anon;
grant execute on function check_credit_limit(uuid, numeric) to authenticated;

revoke all on function place_order(jsonb, jsonb) from public, anon;
grant execute on function place_order(jsonb, jsonb) to authenticated;

revoke all on function post_invoice(jsonb, jsonb) from public, anon;
grant execute on function post_invoice(jsonb, jsonb) to authenticated;
