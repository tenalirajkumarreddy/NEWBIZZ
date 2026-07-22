-- =====================================================================
-- 0049_receipt_payment_method_fk.sql
--
-- Connects customer_receipts to payment_methods so the destination-ledger
-- mapping (§1.7) drives journal routing instead of a hard-coded enum.
-- Also adds credit.override permission for the forthcoming soft-block fix.
-- =====================================================================

-- 1. Add FK column
alter table customer_receipts
  add column if not exists method_id uuid references payment_methods(id);

comment on column customer_receipts.method_id is 'FK → payment_methods. Its destination drives the journal debit side. Populated from mode on existing rows.';

-- 2. Backfill: map old receipt_mode values to payment_methods.code
update customer_receipts r
  set method_id = pm.id
  from payment_methods pm
  where (r.mode = 'cash'    and pm.code = 'cash')
     or (r.mode = 'upi'     and pm.code = 'upi_agent')
     or (r.mode = 'bank'    and pm.code = 'bank_transfer')
     or (r.mode = 'cheque'  and pm.code = 'cheque')
     or (r.mode = 'card'    and pm.code = 'card')
     or (r.mode = 'adjustment' and pm.code = 'bank_transfer');

-- 3. Make NOT NULL now that backfill is done (safe — few/no rows)
alter table customer_receipts alter column method_id set not null;

-- 4. Rewrite record_receipt to use method_id + payment_methods.destination
create or replace function record_receipt(p_header jsonb, p_allocations jsonb default '[]'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cust    uuid := (p_header->>'customer_id')::uuid;
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
begin
  if v_cust is null then raise exception 'record_receipt: customer_id required'; end if;
  if v_amount is null or v_amount <= 0 then raise exception 'record_receipt: amount must be > 0'; end if;
  if v_method is null then raise exception 'record_receipt: method_id required'; end if;

  -- Resolve destination from payment method
  select destination into v_dest from payment_methods where id = v_method;
  if v_dest is null then raise exception 'record_receipt: payment_method % not found', v_method; end if;

  v_fy  := fy_for_date(v_date);
  v_rno := next_number('receipt', v_date);

  -- deposit_account from header overrides the default derived from destination
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
  values (v_rno, v_fy, v_cust, nullif(p_header->>'store_id','')::uuid, v_date,
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

  -- Build journal: Dr = destination ledger, Cr = Customer AR (or Customer Advances for advance method)
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
      else  -- bank — use deposit_account (e.g. 1120 for savings, 1121 for current)
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

  -- Process invoice allocations (same as before)
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

  perform write_audit('post','customer_receipts', v_rcpt::text,
            format('Receipt %s %s from customer', v_rno, v_amount),
            jsonb_build_object('receipt_no', v_rno, 'amount', v_amount, 'method_id', v_method,
                               'allocated', v_sum_alloc), v_actor);
  return v_rcpt;
end $$;

comment on function record_receipt is 'Record a customer payment. Uses payment_methods.destination to route the journal debit to the correct ledger (§1.7). deposit_account in the header overrides the default derived from the method destination.';

-- 5. Add credit.override permission (needed for Fix #3)
insert into permissions (code, description) values
  ('credit.override', 'Override credit-limit block on orders and sales')
on conflict (code) do nothing;

-- 6. Grants
revoke all on function record_receipt(jsonb, jsonb) from public, anon;
grant execute on function record_receipt(jsonb, jsonb) to authenticated;
