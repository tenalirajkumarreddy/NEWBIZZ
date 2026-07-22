-- =====================================================================
-- 0059_store_centric_receipts.sql
--
-- Makes receipts store-centric. store_id becomes required (not null)
-- and record_receipt enforces it at the RPC level. Receipts always
-- belong to a specific store; the customer remains as the roll-up
-- parent for combined views.
-- =====================================================================

-- 1. Make store_id NOT NULL (safe — 0 NULL rows in production)
alter table customer_receipts alter column store_id set not null;

-- 2. Rewrite record_receipt with required store_id
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

comment on function record_receipt is 'Record a customer payment at a specific store. store_id is required (receipts are store-centric). Uses payment_methods.destination to route the journal debit to the correct ledger.';
