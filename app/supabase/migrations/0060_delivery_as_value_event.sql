-- =====================================================================
-- 0060_delivery_as_value_event.sql
--
-- Decouples the sale's value event from the invoice document:
--   post_delivery       → fulfil all remaining, post accounting (no invoice)
--   generate_gst_invoice → optional GST doc from a fulfilled order
--
-- Also updates rebuild_customer_ledger to include delivery_challans.
-- =====================================================================

-- 1. Add journal entry columns to delivery_challans
alter table delivery_challans add column if not exists journal_entry_id uuid references journal_entries(id);
alter table delivery_challans add column if not exists cogs_entry_id uuid references journal_entries(id);

-- 2. post_delivery — one-click fulfil: deliver all remaining, post accounting
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

comment on function post_delivery is 'Fulfil an order: deliver all remaining qty, post revenue + stock + customer_ledger. No invoice created. For GST docs, call generate_gst_invoice.';

-- 3. generate_gst_invoice — optional GST doc from a fulfilled order
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

comment on function generate_gst_invoice is 'Generate an optional GST invoice doc from a fulfilled order. No accounting entry — links to the delivery journal instead.';

-- 4. Update rebuild_customer_ledger to include delivery_challans
create or replace function rebuild_customer_ledger(
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
    select 'sale' as txn_type, id as ref_id, 'invoices' as ref_type,
           grand_total as amount, customer_id, store_id,
           coalesce(invoice_date::timestamptz, created_at) as txn_time
      from invoices
     where (p_customer_id is null or customer_id = p_customer_id)
       and grand_total > 0
    union all
    select 'sale' as txn_type, dc.id as ref_id, 'delivery_challans' as ref_type,
           -- amount = AR debit minus round-off from delivery journal
           coalesce((
             select sum(jl.debit)
               from journal_lines jl
              where jl.entry_id = dc.journal_entry_id and jl.account_code = '1130'
           ), 0)
           - coalesce((
             select abs(jl2.credit) from journal_lines jl2
              where jl2.entry_id = dc.journal_entry_id and jl2.account_code = '5700'
           ), 0) as amount,
           so.customer_id, so.store_id,
           coalesce(dc.delivered_at::timestamptz, dc.created_at) as txn_time
      from delivery_challans dc
      join sales_orders so on so.id = dc.order_id
     where (p_customer_id is null or so.customer_id = p_customer_id)
       and dc.status = 'delivered'
       and dc.journal_entry_id is not null
    union all
    select 'payment' as txn_type, id as ref_id, 'customer_receipts' as ref_type,
           -amount as amount, customer_id, store_id,
           coalesce(receipt_date::timestamptz, created_at) as txn_time
      from customer_receipts
     where (p_customer_id is null or customer_id = p_customer_id)
       and amount > 0
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

comment on function rebuild_customer_ledger is 'Recomputed customer_ledger from scratch. Includes invoices, delivery_challans, and customer_receipts. Pass a customer_id to rebuild one customer, or omit for all. Idempotent.';

-- 5. Update get_customer_ledger to show delivery as challan_no
create or replace function get_customer_ledger(
  p_customer_id uuid,
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  id             uuid,
  txn_type       text,
  reference_id   uuid,
  reference_type text,
  amount         numeric(14,2),
  balance_after  numeric(14,2),
  created_at     timestamptz,
  invoice_no     text,
  receipt_no     text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    cl.id,
    cl.txn_type,
    cl.reference_id,
    cl.reference_type,
    cl.amount,
    cl.balance_after,
    cl.created_at,
    coalesce(i.invoice_no, dc.challan_no)::text as invoice_no,
    r.receipt_no::text as receipt_no
  from customer_ledger cl
  left join invoices i on cl.reference_type = 'invoices' and cl.reference_id = i.id
  left join delivery_challans dc on cl.reference_type = 'delivery_challans' and cl.reference_id = dc.id
  left join customer_receipts r on cl.reference_type = 'customer_receipts' and cl.reference_id = r.id
  where cl.customer_id = p_customer_id
  order by cl.created_at desc, cl.id desc
  limit p_limit
  offset p_offset
$$;

comment on function get_customer_ledger is 'Paginated ledger entries for a customer, newest first. Includes delivery challans.';

-- 6. Grant execute
revoke all on function post_delivery(uuid) from public, anon;
grant execute on function post_delivery(uuid) to authenticated;

revoke all on function generate_gst_invoice(uuid, date) from public, anon;
grant execute on function generate_gst_invoice(uuid, date) to authenticated;
