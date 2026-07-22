-- =====================================================================
-- 0010_fix_receipt_status_cast.sql
-- Fix caught by the live Phase-1 smoke test: invoices.status is the enum
-- invoice_status, but the CASE expression in record_receipt() yields text
-- and Postgres won't implicitly coerce it. Add an explicit ::invoice_status
-- cast. (0009 is already shipped/applied, so this is an append-only patch;
-- the base file 0009_collections.sql was also corrected for fresh installs.)
-- Body identical to 0009's record_receipt except the cast on `status`.
-- =====================================================================
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
  v_mode    receipt_mode := (p_header->>'mode')::receipt_mode;
  v_deposit text := coalesce(nullif(p_header->>'deposit_account',''), '1110');
  v_staff   uuid := nullif(p_header->>'collected_by','')::uuid;
  v_rno     text;
  v_rcpt    uuid;
  v_je      uuid;
  v_alloc   jsonb;
  v_inv     uuid; v_aamt numeric(14,2); v_out numeric(14,2);
  v_sum_alloc numeric(14,2) := 0;
  v_dr_lines jsonb;
  v_actor   uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
begin
  if v_cust is null then raise exception 'record_receipt: customer_id required'; end if;
  if v_amount is null or v_amount <= 0 then raise exception 'record_receipt: amount must be > 0'; end if;
  v_fy  := fy_for_date(v_date);
  v_rno := next_number('receipt', v_date);

  insert into customer_receipts (receipt_no, fy_id, customer_id, store_id, receipt_date,
                                 mode, amount, reference, deposit_account, collected_by, notes, created_by)
  values (v_rno, v_fy, v_cust, nullif(p_header->>'store_id','')::uuid, v_date,
          v_mode, v_amount, p_header->>'reference', v_deposit, v_staff, p_header->>'notes', v_actor)
  returning id into v_rcpt;

  ------------------------------------------------------------ value posting
  -- Dr deposit account (cash/bank/custody) / Cr AR (customer control)
  -- custody (2140) carries the collecting user as its party.
  v_dr_lines := jsonb_build_array(
    case when v_deposit = '2140' then
      jsonb_build_object('account_code','2140','debit', v_amount,'credit',0,
                         'party_type','user','party_id', coalesce(v_staff, v_actor)::text)
    else
      jsonb_build_object('account_code', v_deposit,'debit', v_amount,'credit',0)
    end,
    jsonb_build_object('account_code','1130','debit',0,'credit', v_amount,
                       'party_type','customer','party_id', v_cust::text));

  v_je := post_journal(
    jsonb_build_object('entry_date', v_date, 'source','receipt', 'source_id', v_rcpt::text,
                       'narration','Receipt '||v_rno),
    v_dr_lines);

  update customer_receipts set journal_entry_id = v_je where id = v_rcpt;

  ------------------------------------------------------------- allocations
  if jsonb_typeof(p_allocations) = 'array' then
    for v_alloc in select * from jsonb_array_elements(p_allocations) loop
      v_inv  := (v_alloc->>'invoice_id')::uuid;
      v_aamt := (v_alloc->>'amount')::numeric;
      if v_aamt is null or v_aamt <= 0 then raise exception 'allocation amount must be > 0'; end if;

      -- guard: cannot pay an invoice belonging to another customer
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

      -- maintain invoice read-model (Invariant 5)
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
            jsonb_build_object('receipt_no', v_rno, 'amount', v_amount, 'allocated', v_sum_alloc), v_actor);
  return v_rcpt;
end $$;
