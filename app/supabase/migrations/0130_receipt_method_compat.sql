-- =====================================================================
-- 0130_receipt_method_compat.sql
--
-- C3 remediation: the shipped APK (1.2.9) sends `mode` + `deposit_account`
-- and never `method_id`, while record_receipt requires method_id. Every
-- cash/UPI sale therefore posts the invoice and loses the receipt: the
-- customer paid, the ledger says unpaid, and the money never lands in 2140.
--
-- This migration:
--   1. accepts a legacy `mode` and resolves it to payment_methods.code
--      (cash → cash, upi → upi_agent, bank → bank_transfer, ...);
--   2. stores customer_receipts.mode and .collected_by, which 0102 omitted;
--   3. derives deposit_account from payment_methods.destination and only
--      honours an explicit override for accounting managers, validating it
--      is a postable asset account (no more Dr 4000 revenue);
--   4. adds client_request_id so a retried request cannot double-post;
--   5. locks invoice rows before allocation, and refuses void invoices;
--   6. adds record_sale_with_payment(invoice, lines, payment) so a new
--      client can commit the sale and its collection in one transaction.
--
-- Existing clients keep working unchanged: no APK rebuild is required for
-- the money path to be correct.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Idempotency key (NULLs are distinct, so old rows are unaffected)
-- ---------------------------------------------------------------------
alter table public.customer_receipts
  add column if not exists client_request_id text;

create unique index if not exists customer_receipts_client_request_key
  on public.customer_receipts (client_request_id);

comment on column public.customer_receipts.client_request_id is
  'Client-generated idempotency key; a retried request returns the original receipt.';

-- ---------------------------------------------------------------------
-- 2. record_receipt — method compatibility, attribution, idempotency
-- ---------------------------------------------------------------------
create or replace function public.record_receipt(
  p_header jsonb, p_allocations jsonb default '[]'::jsonb)
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
  v_mode_in text  := nullif(p_header->>'mode','');
  v_code    text;
  v_dest    text;
  v_deposit text;
  v_mode    receipt_mode;
  v_req     text  := nullif(p_header->>'client_request_id','');
  v_staff   uuid  := nullif(p_header->>'collected_by','')::uuid;
  v_actor   uuid  := public.current_app_user();
  v_prev    uuid;
  v_prev_cust uuid;
  v_fy      uuid;
  v_rno     text;
  v_rcpt    uuid;
  v_je      uuid;
  v_alloc   jsonb;
  v_inv     uuid;
  v_aamt    numeric(14,2);
  v_out     numeric(14,2);
  v_sum_alloc numeric(14,2) := 0;
  v_dr_lines jsonb := '[]'::jsonb;
  v_cr_lines jsonb := '[]'::jsonb;
  v_deposit_line jsonb;
  v_prev_bal numeric(14,2);
begin
  if not (has_permission('invoice.payment') or has_permission('receipt.record')) then
    raise exception 'record_receipt: not authorized (invoice.payment required)';
  end if;
  if v_cust is null then raise exception 'record_receipt: customer_id required'; end if;
  if v_store is null then raise exception 'record_receipt: store_id required'; end if;
  if v_amount is null or v_amount <= 0 then raise exception 'record_receipt: amount must be > 0'; end if;
  if not exists (select 1 from customer_stores where id = v_store and customer_id = v_cust) then
    raise exception 'record_receipt: store % does not belong to customer %', v_store, v_cust;
  end if;

  -- A retry must return the original receipt, not post a second one.
  if v_req is not null then
    select id, customer_id into v_prev, v_prev_cust
      from customer_receipts where client_request_id = v_req;
    if v_prev is not null then
      if v_prev_cust <> v_cust then
        raise exception 'record_receipt: client_request_id % belongs to another customer', v_req;
      end if;
      return v_prev;
    end if;
  end if;

  -- Legacy APK compatibility: resolve mode → payment method when method_id
  -- is missing. Never trust a client-chosen method id that is inactive.
  if v_method is null and v_mode_in is not null then
    select id into v_method
      from payment_methods
     where is_active
       and code = case v_mode_in
                    when 'cash' then 'cash'
                    when 'upi' then 'upi_agent'
                    when 'upi_agent' then 'upi_agent'
                    when 'upi_company' then 'upi_company'
                    when 'bank' then 'bank_transfer'
                    when 'bank_transfer' then 'bank_transfer'
                    when 'cheque' then 'cheque'
                    when 'card' then 'card'
                    when 'adjustment' then 'advance'
                    when 'advance' then 'advance'
                    else v_mode_in
                  end
     limit 1;
  end if;
  if v_method is null then
    raise exception 'record_receipt: method_id required (or a legacy mode of cash/upi/bank/cheque/card)';
  end if;

  select destination, code into v_dest, v_code
    from payment_methods
   where id = v_method and is_active;
  if v_dest is null then
    raise exception 'record_receipt: payment_method % not found or inactive', v_method;
  end if;

  -- Cash custody must be attributed to a real person. A client may name
  -- itself; naming a different collector requires admin.
  if v_staff is not null and v_staff <> v_actor and not has_permission('admin') then
    raise exception 'record_receipt: cannot attribute this receipt to another user';
  end if;
  v_staff := coalesce(v_staff, v_actor);

  v_deposit := case v_dest
    when 'user_cash'        then '2140'
    when 'bank'             then '1120'
    when 'cheques_in_hand'  then '1180'
    when 'customer_advance' then '2100'
  end;

  -- Deposit override: only an accounting manager, and only to a postable
  -- asset account. A normal caller (and every legacy APK) uses the method's
  -- destination, so `deposit_account: '4000'` cannot debit revenue.
  if nullif(p_header->>'deposit_account','') is not null
     and (p_header->>'deposit_account') <> v_deposit then
    if not has_permission('accounting.manage') then
      raise exception 'record_receipt: deposit_account override requires accounting.manage';
    end if;
    if not exists (
      select 1 from chart_of_accounts
       where code = (p_header->>'deposit_account')
         and type = 'asset' and is_postable and status = 'active'
    ) then
      raise exception 'record_receipt: % is not a postable asset account', p_header->>'deposit_account';
    end if;
    v_deposit := p_header->>'deposit_account';
  end if;

  -- Receipt mode mirrors the method destination, not a client string.
  v_mode := case v_dest
    when 'user_cash'        then (case when v_code = 'upi_agent' then 'upi' else 'cash' end)::receipt_mode
    when 'bank'             then (case when v_code = 'card' then 'card' else 'bank' end)::receipt_mode
    when 'cheques_in_hand'  then 'cheque'::receipt_mode
    when 'customer_advance' then 'adjustment'::receipt_mode
  end;

  v_fy  := fy_for_date(v_date);
  v_rno := next_number('receipt', v_date);

  insert into customer_receipts (receipt_no, fy_id, customer_id, store_id, receipt_date,
                                 amount, reference, method_id, mode, deposit_account,
                                 collected_by, notes, created_by, client_request_id)
  values (v_rno, v_fy, v_cust, v_store, v_date, v_amount,
          nullif(p_header->>'reference',''), v_method, v_mode, v_deposit,
          v_staff, p_header->>'notes', v_actor, v_req)
  on conflict (client_request_id) do nothing
  returning id into v_rcpt;

  -- Lost a race on the same idempotency key: return the winner.
  if v_rcpt is null then
    select id into v_rcpt from customer_receipts where client_request_id = v_req;
    return v_rcpt;
  end if;

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

  -- Explicit allocations: lock each invoice, refuse void/paid, and never
  -- allocate past outstanding.
  if jsonb_typeof(p_allocations) = 'array' and jsonb_array_length(p_allocations) > 0 then
    for v_alloc in select * from jsonb_array_elements(p_allocations) loop
      v_inv  := (v_alloc->>'invoice_id')::uuid;
      v_aamt := (v_alloc->>'amount')::numeric;
      if v_aamt is null or v_aamt <= 0 then raise exception 'allocation amount must be > 0'; end if;

      select customer_id into v_prev_cust from invoices where id = v_inv for update;
      if v_prev_cust is null then raise exception 'allocation invoice % not found', v_inv; end if;
      if v_prev_cust is distinct from v_cust then
        raise exception 'allocation invoice % is not for customer %', v_inv, v_cust;
      end if;
      if (select status from invoices where id = v_inv) in ('void','paid') then
        raise exception 'allocation invoice % is %', v_inv, (select status from invoices where id = v_inv);
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
    -- Auto-allocate FIFO across open invoices. Lock the candidate rows first,
    -- then compute outstanding from the allocation rows: concurrent receipts
    -- therefore cannot both claim the same balance.
    for v_inv in
      select i.id
        from invoices i
       where i.customer_id = v_cust and i.status in ('posted','part_paid')
       order by i.invoice_date, i.id
       for update
    loop
      exit when v_amount <= v_sum_alloc + 0.005;
      v_out := invoice_outstanding(v_inv);
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

  if v_sum_alloc > v_amount then
    raise exception 'record_receipt: allocations % exceed receipt amount %', v_sum_alloc, v_amount;
  end if;
  update customer_receipts set allocated_amount = v_sum_alloc where id = v_rcpt;

  v_prev_bal := coalesce(previous_customer_balance(v_cust), 0);
  insert into customer_ledger (customer_store_id, customer_id, txn_type, reference_id,
                               reference_type, amount, balance_after)
    values (v_store, v_cust, 'payment', v_rcpt, 'customer_receipts', -v_amount, v_prev_bal - v_amount);

  perform write_audit('post','customer_receipts', v_rcpt::text,
            format('Receipt %s %s from customer', v_rno, v_amount),
            jsonb_build_object('receipt_no', v_rno, 'amount', v_amount,
                               'method_id', v_method, 'mode', v_mode,
                               'collected_by', v_staff, 'allocated', v_sum_alloc,
                               'client_request_id', v_req), v_actor);
  return v_rcpt;
end $$;

comment on function record_receipt(jsonb, jsonb) is
  'Record a customer payment. Accepts method_id or the legacy mode sent by shipped APKs, stores mode/collected_by, resolves the deposit account from payment_methods.destination, and is idempotent on client_request_id.';

-- ---------------------------------------------------------------------
-- 3. Atomic sale + collection for new clients
--    post_invoice and record_receipt run in one transaction: if the receipt
--    fails, the invoice rolls back with it instead of leaving a paid sale
--    with no receipt. Only one payment instrument per call; split tender
--    still uses two record_receipt calls (each idempotent).
-- ---------------------------------------------------------------------
create or replace function public.record_sale_with_payment(
  p_invoice jsonb,
  p_lines jsonb,
  p_payment jsonb default null,
  p_allocations jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv    uuid;
  v_cust   uuid;
  v_store  uuid;
  v_total  numeric(14,2);
  v_amount numeric(14,2) := coalesce((p_payment->>'amount')::numeric, 0);
  v_pay    jsonb;
  v_alloc  jsonb := p_allocations;
  v_rcpt   uuid;
begin
  v_inv := post_invoice(p_invoice, p_lines);
  select customer_id, store_id, grand_total
    into v_cust, v_store, v_total
    from invoices where id = v_inv;

  if v_amount > 0 then
    if v_alloc is null
       or jsonb_typeof(v_alloc) <> 'array'
       or jsonb_array_length(v_alloc) = 0 then
      v_alloc := jsonb_build_array(
        jsonb_build_object('invoice_id', v_inv, 'amount', least(v_amount, v_total)));
    end if;
    v_pay := p_payment || jsonb_build_object(
      'customer_id', v_cust,
      'store_id', v_store,
      'amount', v_amount,
      'collected_by', coalesce(p_payment->>'collected_by', public.current_app_user()::text));
    v_rcpt := record_receipt(v_pay, v_alloc);
  end if;

  return jsonb_build_object('invoice_id', v_inv, 'receipt_id', v_rcpt);
end $$;

comment on function record_sale_with_payment(jsonb, jsonb, jsonb, jsonb) is
  'Post an invoice and (optionally) its collection atomically. Any payment above the invoice total stays unallocated on account.';

-- ---------------------------------------------------------------------
-- 4. Grants
-- ---------------------------------------------------------------------
revoke all on function public.record_receipt(jsonb, jsonb) from public, anon;
grant execute on function public.record_receipt(jsonb, jsonb) to authenticated, service_role;

revoke all on function public.record_sale_with_payment(jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.record_sale_with_payment(jsonb, jsonb, jsonb, jsonb)
  to authenticated, service_role;
