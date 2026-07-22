-- =====================================================================
-- 0048_sell_collect_refinements.sql
--
-- Four Phase-1 refinements in one transaction-safe migration:
--   1. unit_cogs on invoice_lines + populate cogs_entry_id
--   2. is_official flag (unofficial/non-GST sales support)
--   3. Credit-limit enforcement in place_order / post_invoice
--   4. payment_methods master table (§1.7 destination-ledger map)
-- =====================================================================

-- ##################################################################
-- 1. unit_cogs on invoice_lines
-- ##################################################################
alter table invoice_lines
  add column if not exists unit_cogs numeric(14,4);
comment on column invoice_lines.unit_cogs is 'Weighted-average cost at time of sale. Captured so returns reverse exact COGS and reports show margin without joining stock_ledger. §4.5.';

-- ##################################################################
-- 2. is_official on invoices — supports unofficial (non-GST) sales
-- ##################################################################
alter table invoices
  add column if not exists is_official boolean not null default true;
comment on column invoices.is_official is 'True = GST invoice with output tax. False = cash-memo receipt, no tax, single Cr Sales = total. §4.5.';

-- ##################################################################
-- 3. payment_methods master table
-- ##################################################################
create table if not exists payment_methods (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,
  name         text not null,
  destination  text not null
               check (destination in ('user_cash','bank','cheques_in_hand','customer_advance')),
  is_active    boolean not null default true,
  sort_order   int not null default 0
);
comment on table payment_methods is 'Maps each payment method to its destination ledger (§1.7). Seeded, not user-editable.';

-- Seed number series for unofficial invoices (prefix CM = Cash Memo)
insert into number_series (doc_type, fy_id, prefix, pad_width, next_val)
select 'invoice_unofficial', fy.id, 'CM', 4, 1 from financial_years fy
on conflict (doc_type, fy_id) do nothing;

-- Seed the seven methods from §1.7
insert into payment_methods (code, name, destination, sort_order) values
  ('cash',          'Cash',              'user_cash',       1),
  ('upi_agent',     'UPI (agent)',       'user_cash',       2),
  ('upi_company',   'UPI (company)',     'bank',            3),
  ('card',          'Card',              'bank',            4),
  ('cheque',        'Cheque',            'cheques_in_hand', 5),
  ('bank_transfer', 'Bank Transfer',     'bank',            6),
  ('advance',       'Advance',           'customer_advance',7)
on conflict (code) do nothing;

alter table payment_methods enable row level security;
create policy read_all_auth on payment_methods
  for select to authenticated using (true);

-- ##################################################################
-- 4. Credit-limit helper function
-- ##################################################################
create or replace function check_credit_limit(
  p_customer_id uuid,
  p_order_value numeric(14,2)
) returns void
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
    return;  -- 0 = no limit / cash-only not enforced here
  end if;
  -- Compute current outstanding from invoices
  select coalesce(sum(grand_total - amount_paid), 0) into v_out
    from invoices
   where customer_id = p_customer_id
     and status in ('posted','part_paid');
  if v_out + p_order_value > v_limit then
    raise exception 'Credit limit exceeded: outstanding % + order % = %, limit is %. Contact manager for override (credit.override).',
      round(v_out,2), round(p_order_value,2), round(v_out + p_order_value,2), round(v_limit,2);
  end if;
end $$;
comment on function check_credit_limit is 'Raises if the order/invoice would push outstanding past the customer credit limit. No-op if limit is 0. §4.3.';

-- ##################################################################
-- 5. Rewrite post_invoice — adds unit_cogs, cogs_entry_id, is_official
-- ##################################################################
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
  v_no     := next_number('invoice', v_date);

  -- Reserve the invoice number series (invoice_unofficial for non-GST)
  if not v_official then
    v_no := next_number('invoice_unofficial', v_date);
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
      -- Unofficial: total = qty × rate, no tax fields
      v_taxable := round(v_qty * v_price, 2);
      v_cgst := 0; v_sgst := 0; v_igst := 0; v_cess := 0;
      v_ltot := v_taxable;
    end if;
    v_ln := v_ln + 1;

    -- Capture current WA cost before stock moves
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

  -- Build journal lines (official or unofficial)
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
    -- Unofficial: Dr AR / Cr Sales (no tax), use sales-other account
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

  -- Capture the COGS journal entry from the most recent stock_ledger row for this invoice
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

  -- Credit-limit check (after invoice is created so outstanding is accurate)
  perform check_credit_limit(v_cust, v_grand);

  if (p_header ? 'order_id') and nullif(p_header->>'order_id','') is not null then
    update sales_orders set status='invoiced', updated_at=now()
      where id = (p_header->>'order_id')::uuid;
  end if;

  perform write_audit('post','invoices', v_inv::text,
            format('Invoice %s total %s', v_no, v_grand),
            jsonb_build_object('invoice_no', v_no, 'grand_total', v_grand,
                               'is_official', v_official), v_actor);
  return v_inv;
end $$;
comment on function post_invoice is 'Record a sale: posts revenue + journal + stock move + COGS. Supports official (GST) and unofficial (non-GST) sales. Captures unit_cogs on each line. §4.5.';

-- ##################################################################
-- 6. Rewrite post_invoice_from_order — passes through is_official
-- ##################################################################
create or replace function post_invoice_from_order(
  p_order uuid, p_date date default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_o    sales_orders%rowtype;
  v_lines jsonb;
begin
  select * into v_o from sales_orders where id = p_order;
  if not found then raise exception 'post_invoice_from_order: order % not found', p_order; end if;
  if v_o.status = 'invoiced' then raise exception 'order % already invoiced', v_o.order_no; end if;
  if v_o.status = 'cancelled' then raise exception 'order % is cancelled', v_o.order_no; end if;

  select jsonb_agg(jsonb_build_object('item_id', item_id, 'qty', qty, 'unit_price', unit_price)
                   order by line_no)
    into v_lines
    from sales_order_lines where order_id = p_order;

  return post_invoice(
    jsonb_build_object('store_id', v_o.store_id::text, 'branch_id', v_o.branch_id::text,
                       'invoice_date', p_date, 'order_id', p_order::text,
                       'is_official', 'true'),
    v_lines);
end $$;
comment on function post_invoice_from_order is 'Invoice a confirmed order. Always official — orders imply GST sale. §4.5.';

-- ##################################################################
-- 7. Rewrite place_order — adds credit-limit enforcement
-- ##################################################################
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

  -- Compute order total and create lines in one pass
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

  -- Credit-limit check against order total
  perform check_credit_limit(v_cust, v_total);

  perform write_audit('insert','sales_orders', v_order::text,
            format('Order %s for store %s (%s lines, %s)', v_no, v_store, v_ln, v_total),
            jsonb_build_object('order_no', v_no, 'total', v_total), v_actor);
  return v_order;
end $$;
comment on function place_order is 'Create a confirmed sales order. Enforces credit limit. §4.3/§4.4.';

-- ##################################################################
-- 8. Grants (new functions)
-- ##################################################################
revoke all on function check_credit_limit(uuid, numeric) from public, anon;
grant execute on function check_credit_limit(uuid, numeric) to authenticated;

revoke all on function post_invoice(jsonb, jsonb) from public, anon;
grant execute on function post_invoice(jsonb, jsonb) to authenticated;

revoke all on function post_invoice_from_order(uuid, date) from public, anon;
grant execute on function post_invoice_from_order(uuid, date) to authenticated;

revoke all on function place_order(jsonb, jsonb) from public, anon;
grant execute on function place_order(jsonb, jsonb) to authenticated;
