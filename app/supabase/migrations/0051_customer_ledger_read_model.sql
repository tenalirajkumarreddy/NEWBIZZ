-- =====================================================================
-- 0051_customer_ledger_read_model.sql
--
-- Implements the customer_ledger read-model (§4.6, spec §1.3).
-- One row per sale invoice and per receipt, giving O(1) outstanding
-- lookups. Written by post_invoice and record_receipt in the same
-- transaction. Rebuildable from source tables via rebuild_customer_ledger().
-- =====================================================================

-- 1. Create customer_ledger table
create table if not exists customer_ledger (
  id                 uuid primary key default gen_random_uuid(),
  customer_store_id  uuid not null references customer_stores(id),
  customer_id        uuid not null references customers(id),
  txn_type           text not null check (txn_type in ('sale','payment','credit_note','debit_note','scheme','opening')),
  reference_id       uuid not null,
  reference_type     text not null,
  amount             numeric(14,2) not null,
  balance_after      numeric(14,2) not null,
  due_date           date,
  created_at         timestamptz not null default now()
);

create index if not exists idx_customer_ledger_customer on customer_ledger(customer_id, created_at desc);
create index if not exists idx_customer_ledger_store on customer_ledger(customer_store_id, created_at desc);
create index if not exists idx_customer_ledger_ref on customer_ledger(reference_type, reference_id);

comment on table customer_ledger is 'Read-model: running balance per customer. One row per sale invoice (txn_type=sale) and per receipt (txn_type=payment). Authoritative source = journal_lines; rebuilt via rebuild_customer_ledger(). §4.6.';
comment on column customer_ledger.customer_store_id is 'FK → customer_stores. Identifies the store that owns this balance entry.';
comment on column customer_ledger.customer_id is 'Denormalized from customer_stores for fast per-customer queries.';
comment on column customer_ledger.txn_type is 'sale | payment | credit_note | debit_note | scheme | opening';
comment on column customer_ledger.reference_id is 'UUID of the source row (invoices.id or customer_receipts.id).';
comment on column customer_ledger.reference_type is 'Table name: invoices | customer_receipts | etc.';
comment on column customer_ledger.amount is 'Signed: positive for sale, negative for payment.';
comment on column customer_ledger.balance_after is 'Running balance after this entry (positive = owed by customer).';

-- 2. Helper to get previous balance for a customer
create or replace function previous_customer_balance(p_customer_id uuid)
returns numeric(14,2)
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(balance_after, 0) from customer_ledger
   where customer_id = p_customer_id
   order by created_at desc, id desc
   limit 1
$$;

comment on function previous_customer_balance is 'Returns the latest balance_after for a customer, or 0 if none.';

-- 3. Rewrite post_invoice — add customer_ledger write (+ soft-block from 0050)
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

  -- Write customer_ledger: sale (+grand_total)
  v_prev_bal := previous_customer_balance(v_cust);
  insert into customer_ledger (customer_store_id, customer_id, txn_type, reference_id,
                               reference_type, amount, balance_after)
    values (v_store, v_cust, 'sale', v_inv, 'invoices', v_grand, v_prev_bal + v_grand);

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

comment on function post_invoice is 'Record a sale: posts revenue + journal + stock move + COGS. Supports official (GST) and unofficial (non-GST) sales. Maintains customer_ledger read-model. Soft credit-limit enforcement with manager override.';

-- 4. Rewrite record_receipt — add customer_ledger write
create or replace function record_receipt(p_header jsonb, p_allocations jsonb default '[]'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cust    uuid := (p_header->>'customer_id')::uuid;
  v_store   uuid := nullif(p_header->>'store_id','')::uuid;
  v_date    date := coalesce((p_header->>'receipt_date')::date, current_date);
  v_fy      uuid;
  v_amount  numeric(14,2) := (p_header->>'amount')::numeric;
  v_method  uuid := nullif(p_header->>'method_id','')::uuid;
  v_dest    text;
  v_deposit text;
  v_staff   uuid := nullif(p_header->>'collected_by','')::uuid;
  v_rno     text;
  v_rcpt    uuid;
  v_je      uuid;
  v_alloc   jsonb;
  v_inv     uuid; v_aamt numeric(14,2); v_out numeric(14,2);
  v_sum_alloc numeric(14,2) := 0;
  v_dr_lines jsonb;
  v_cr_lines jsonb;
  v_actor   uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
  v_prev_bal numeric(14,2);
begin
  if v_cust is null then raise exception 'record_receipt: customer_id required'; end if;
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
                                 method_id, mode, amount, reference, deposit_account,
                                 collected_by, notes, created_by)
  values (v_rno, v_fy, v_cust, v_store, v_date,
          v_method,
          case v_dest
            when 'user_cash'        then 'cash'::receipt_mode
            when 'bank'             then 'bank'::receipt_mode
            when 'cheques_in_hand'  then 'cheque'::receipt_mode
            when 'customer_advance' then 'adjustment'::receipt_mode
          end,
          v_amount, p_header->>'reference', v_deposit,
          v_staff, p_header->>'notes', v_actor)
  returning id into v_rcpt;

  if v_dest = 'customer_advance' then
    v_dr_lines := jsonb_build_array(
      jsonb_build_object('account_code', v_deposit, 'debit', v_amount, 'credit', 0));
    v_cr_lines := jsonb_build_array(
      jsonb_build_object('account_code','2100','debit',0,'credit', v_amount,
                         'party_type','customer','party_id', v_cust::text));
  else
    v_dr_lines := jsonb_build_array(case v_dest
      when 'user_cash' then
        jsonb_build_object('account_code','2140','debit', v_amount,'credit',0,
                           'party_type','user','party_id', coalesce(v_staff, v_actor)::text)
      when 'cheques_in_hand' then
        jsonb_build_object('account_code','1180','debit', v_amount,'credit',0)
      else
        jsonb_build_object('account_code', v_deposit, 'debit', v_amount, 'credit', 0)
    end);
    v_cr_lines := jsonb_build_array(
      jsonb_build_object('account_code','1130','debit',0,'credit', v_amount,
                         'party_type','customer','party_id', v_cust::text));
  end if;

  v_je := post_journal(
    jsonb_build_object('entry_date', v_date, 'source','receipt', 'source_id', v_rcpt::text,
                       'narration','Receipt '||v_rno),
    v_dr_lines || v_cr_lines);

  update customer_receipts set journal_entry_id = v_je where id = v_rcpt;

  if jsonb_typeof(p_allocations) = 'array' then
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
  end if;

  if v_sum_alloc > v_amount then
    raise exception 'record_receipt: allocations % exceed receipt amount %', v_sum_alloc, v_amount;
  end if;
  update customer_receipts set allocated_amount = v_sum_alloc where id = v_rcpt;

  -- Write customer_ledger: payment (-amount; use allocated_amount if any)
  -- Using v_amount to record total receipt, not just allocated portion.
  -- The balance tracks total outstanding: a receipt of 500 reduces outstanding by 500,
  -- regardless of which specific invoices it's allocated to.
  v_prev_bal := previous_customer_balance(v_cust);
  insert into customer_ledger (customer_store_id, customer_id, txn_type, reference_id,
                               reference_type, amount, balance_after)
    values (coalesce(v_store, (select store_id from customer_receipts where id = v_rcpt)),
            v_cust, 'payment', v_rcpt, 'customer_receipts', -v_amount, v_prev_bal - v_amount);

  perform write_audit('post','customer_receipts', v_rcpt::text,
            format('Receipt %s %s from customer', v_rno, v_amount),
            jsonb_build_object('receipt_no', v_rno, 'amount', v_amount, 'method_id', v_method,
                               'allocated', v_sum_alloc), v_actor);
  return v_rcpt;
end $$;

comment on function record_receipt is 'Record a customer payment. Uses payment_methods.destination to route the journal debit to the correct ledger (§1.7). Maintains customer_ledger read-model.';

-- 5. rebuild_customer_ledger: recompute from invoices + customer_receipts
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

comment on function rebuild_customer_ledger is 'Recomputed customer_ledger from scratch. Pass a customer_id to rebuild one customer, or omit for all. Idempotent.';

-- 6. get_customer_ledger: paginated query
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
    i.invoice_no::text,
    r.receipt_no::text
  from customer_ledger cl
  left join invoices i on cl.reference_type = 'invoices' and cl.reference_id = i.id
  left join customer_receipts r on cl.reference_type = 'customer_receipts' and cl.reference_id = r.id
  where cl.customer_id = p_customer_id
  order by cl.created_at desc, cl.id desc
  limit p_limit
  offset p_offset
$$;

comment on function get_customer_ledger is 'Paginated ledger entries for a customer, newest first.';

-- 7. customer_outstanding using ledger (fast path)
create or replace function customer_outstanding_via_ledger(
  p_customer_id uuid
)
returns numeric(14,2)
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(balance_after, 0) from customer_ledger
   where customer_id = p_customer_id
   order by created_at desc, id desc
   limit 1
$$;

comment on function customer_outstanding_via_ledger is 'O(1) outstanding from customer_ledger read-model. For authoritative value, use customer_outstanding() which computes from invoices.';

-- 8. Grants
grant all on customer_ledger to authenticated;
grant execute on function previous_customer_balance(uuid) to authenticated;
grant execute on function rebuild_customer_ledger(uuid) to authenticated;
grant execute on function get_customer_ledger(uuid, int, int) to authenticated;
grant execute on function customer_outstanding_via_ledger(uuid) to authenticated;
