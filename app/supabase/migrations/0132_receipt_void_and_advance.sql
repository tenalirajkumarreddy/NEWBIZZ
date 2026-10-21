-- =====================================================================
-- 0132_receipt_void_and_advance.sql
--
-- H2 / H3 remediation:
--
--   H2  There was no way to void or unapply a receipt. A bounced cheque,
--       a duplicated collection or a mis-allocated payment could only be
--       fixed with raw SQL, and void_invoice() refused forever once any
--       payment had been allocated ("Un-allocate receipts before voiding")
--       with no RPC able to un-allocate.
--
--   H3  record_receipt() credited AR (1130) for the whole receipt even when
--       only part of it was allocated to an invoice. The remainder had no
--       invoice and no liability entry: AR GL and the invoice subledger
--       silently diverged, and the Collect screen still told the user the
--       remainder was "kept as advance".
--
-- This migration:
--   1. splits the receipt journal: allocated portion clears 1130, the
--      unallocated remainder is credited to 2100 customer advance (a real
--      liability, visible through customer_advance());
--   2. adds void_receipt(): reverses the journal, releases allocations,
--      reopens the invoices, marks the receipt void and writes the
--      reversing ledger row;
--   3. adds unapply_receipt(): moves an allocated amount back to customer
--      advance without touching the cash side (a 1130/2100 reclass);
--   4. makes void_invoice() release receipts and credit notes to advance
--      instead of refusing, so a paid invoice can finally be voided;
--   5. allows the 'payment_void' ledger txn_type that (2) needs. 0131 fixed
--      the same class of bug for 'sale_void'.
--
-- Void receipts are excluded from customer_ledger rebuilds (0131 already
-- filters status = 'posted'), so the runtime +amount/-amount pair and the
-- rebuilt single row-less state agree.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Ledger txn type for a voided receipt
-- ---------------------------------------------------------------------
alter table public.customer_ledger
  drop constraint if exists customer_ledger_txn_type_check;
alter table public.customer_ledger
  add constraint customer_ledger_txn_type_check
  check (txn_type in ('sale','payment','credit_note','debit_note','scheme',
                      'opening','sale_void','payment_void'));

-- ---------------------------------------------------------------------
-- 2. Permission to reverse a collection
-- ---------------------------------------------------------------------
insert into public.permissions (code, description) values
  ('receipt.void', 'Void a receipt or unapply it from an invoice')
on conflict (code) do nothing;

do $$
declare
  v_role uuid;
begin
  select id into v_role from public.roles where code = 'manager';
  if v_role is not null then
    insert into public.role_permissions (role_id, permission, scope)
    values (v_role, 'receipt.void', 'all')
    on conflict on constraint role_permissions_pkey do nothing;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. Customer advance balance (GL truth, not a read-model)
--    credit - debit on 2100 for one customer. Positive = we hold money.
-- ---------------------------------------------------------------------
create or replace function public.customer_advance(p_customer uuid)
returns numeric(14,2)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(l.credit) - sum(l.debit), 0)::numeric(14,2)
    from journal_lines l
    join journal_entries e on e.id = l.entry_id
    join chart_of_accounts a on a.id = l.account_id
   where a.code = '2100'
     and e.status = 'posted'
     and l.party_type = 'customer'
     and l.party_id = p_customer;
$$;

comment on function customer_advance(uuid) is
  'Unapplied customer money held on account (2100 credits minus debits). Positive means the company owes the customer.';

create or replace view public.v_customer_advance as
  select l.party_id as customer_id,
         sum(l.credit) - sum(l.debit) as advance_amount
    from journal_lines l
    join journal_entries e on e.id = l.entry_id
    join chart_of_accounts a on a.id = l.account_id
   where a.code = '2100'
     and e.status = 'posted'
     and l.party_type = 'customer'
     and public.has_permission('invoice.payment')
   group by l.party_id;

comment on view public.v_customer_advance is
  'Per-customer advance balance for staff who can record payments.';

-- ---------------------------------------------------------------------
-- 4. _release_invoice_allocations  (internal)
--    Removes every live receipt/credit-note allocation against an invoice
--    and returns the total released. The invoice keeps its amount_paid at
--    zero because the caller (void_invoice) voids it; the money that was
--    applied is reclassified to 2100 by the caller.
-- ---------------------------------------------------------------------
create or replace function public._release_invoice_allocations(
  p_invoice uuid,
  p_reason  text default null
)
returns numeric(14,2)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec   record;
  v_total numeric(14,2) := 0;
begin
  for v_rec in
    select a.id, a.receipt_id, a.amount
      from receipt_allocations a
      join customer_receipts r on r.id = a.receipt_id
     where a.invoice_id = p_invoice
       and r.status = 'posted'
     order by a.receipt_id
       for update of a
  loop
    delete from receipt_allocations where id = v_rec.id;
    update customer_receipts
       set allocated_amount = greatest(allocated_amount - v_rec.amount, 0)
     where id = v_rec.receipt_id;
    v_total := v_total + v_rec.amount;
  end loop;

  for v_rec in
    select ca.id, ca.amount
      from credit_note_allocations ca
      join credit_notes cn on cn.id = ca.credit_note_id
     where ca.invoice_id = p_invoice
       and cn.status = 'posted'
     order by ca.id
       for update of ca
  loop
    delete from credit_note_allocations where id = v_rec.id;
    v_total := v_total + v_rec.amount;
  end loop;

  update invoices set amount_paid = 0 where id = p_invoice;
  return v_total;
end $$;

comment on function _release_invoice_allocations(uuid, text) is
  'Internal: detach every posted receipt/credit-note allocation from an invoice and return the released total.';

-- ---------------------------------------------------------------------
-- 5. record_receipt — allocate first, then split the journal
--    Dr  deposit                amount
--    Cr  1130 AR                sum(allocations)
--    Cr  2100 customer advance  amount - sum(allocations)
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
  v_advance   numeric(14,2);
  v_lines   jsonb := '[]'::jsonb;
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

  -- You cannot apply money that is not on account: an `advance` method is a
  -- draw-down of 2100, not a new collection.
  if v_dest = 'customer_advance'
     and v_amount > public.customer_advance(v_cust) + 0.005 then
    raise exception 'record_receipt: advance % exceeds the customer advance balance %',
      v_amount, public.customer_advance(v_cust);
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

  -- The unallocated part is money we hold, not a payment of debt: it belongs
  -- in 2100 customer advance, never in an unexplained AR credit.
  v_advance := v_amount - v_sum_alloc;

  -- Applying an existing advance debits 2100 itself: that side needs the
  -- party tag too, or customer_advance() never sees the draw-down.
  v_lines := jsonb_build_array(
    case when v_deposit = '2100'
         then jsonb_build_object('account_code','2100','debit', v_amount,'credit',0,
                                 'party_type','customer','party_id', v_cust::text)
         else jsonb_build_object('account_code', v_deposit, 'debit', v_amount, 'credit', 0)
    end);
  if v_sum_alloc > 0 then
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_code','1130','debit',0,'credit', v_sum_alloc,
                         'party_type','customer','party_id', v_cust::text));
  end if;
  if v_advance > 0 then
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_code','2100','debit',0,'credit', v_advance,
                         'party_type','customer','party_id', v_cust::text));
  end if;

  v_je := post_journal(
    jsonb_build_object('entry_date', v_date, 'source','receipt', 'source_id', v_rcpt::text,
                       'narration','Receipt '||v_rno),
    v_lines);

  update customer_receipts set journal_entry_id = v_je where id = v_rcpt;

  v_prev_bal := coalesce(previous_customer_balance(v_cust), 0);
  insert into customer_ledger (customer_store_id, customer_id, txn_type, reference_id,
                               reference_type, amount, balance_after)
    values (v_store, v_cust, 'payment', v_rcpt, 'customer_receipts', -v_amount, v_prev_bal - v_amount);

  perform write_audit('post','customer_receipts', v_rcpt::text,
            format('Receipt %s %s from customer', v_rno, v_amount),
            jsonb_build_object('receipt_no', v_rno, 'amount', v_amount,
                               'method_id', v_method, 'mode', v_mode,
                               'collected_by', v_staff, 'allocated', v_sum_alloc,
                               'advance', v_advance, 'client_request_id', v_req), v_actor);
  return v_rcpt;
end $$;

comment on function record_receipt(jsonb, jsonb) is
  'Record a customer payment. Accepts method_id or the legacy mode sent by shipped APKs, stores mode/collected_by, resolves the deposit account from payment_methods.destination, splits the credit into AR (allocated) and 2100 customer advance (unallocated), and is idempotent on client_request_id.';

-- ---------------------------------------------------------------------
-- 6. void_receipt — reverse a collection completely
-- ---------------------------------------------------------------------
create or replace function public.void_receipt(
  p_receipt uuid,
  p_reason  text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r      customer_receipts%rowtype;
  v_a      record;
  v_status invoice_status;
  v_paid   numeric(14,2);
  v_prev   numeric(14,2);
  v_actor  uuid := public.current_app_user();
  v_n      int := 0;
begin
  if not (has_permission('receipt.void') or has_permission('invoice.void')) then
    raise exception 'void_receipt: not authorized (receipt.void required)';
  end if;

  select * into v_r from customer_receipts where id = p_receipt for update;
  if not found then raise exception 'void_receipt: receipt % not found', p_receipt; end if;
  if v_r.status = 'void' then
    raise exception 'void_receipt: receipt % is already void', v_r.receipt_no;
  end if;

  -- 1) Release the allocations and reopen the invoices they paid.
  for v_a in
    select a.id, a.invoice_id, a.amount
      from receipt_allocations a
     where a.receipt_id = p_receipt
     order by a.invoice_id
  loop
    select status, amount_paid into v_status, v_paid
      from invoices where id = v_a.invoice_id for update;
    if v_status is not null then
      delete from receipt_allocations where id = v_a.id;
      if v_status <> 'void' then
        update invoices
           set amount_paid = greatest(amount_paid - v_a.amount, 0),
               status = (case when amount_paid - v_a.amount <= 0.005 then 'posted'
                             else 'part_paid' end)::invoice_status
         where id = v_a.invoice_id;
      end if;
      v_n := v_n + 1;
    end if;
  end loop;

  -- 2) Reverse the cash journal (deposit back out, AR and advance restored).
  if v_r.journal_entry_id is not null then
    perform reverse_journal(v_r.journal_entry_id,
      coalesce('Void ' || v_r.receipt_no || ': ' || p_reason, 'Void of ' || v_r.receipt_no));
  end if;

  update customer_receipts
     set status = 'void', allocated_amount = 0
   where id = p_receipt;

  -- 3) Ledger reversal: the customer owes the money again.
  v_prev := coalesce(previous_customer_balance(v_r.customer_id), 0);
  insert into customer_ledger (customer_store_id, customer_id, txn_type, reference_id,
                               reference_type, amount, balance_after)
    values (v_r.store_id, v_r.customer_id, 'payment_void', p_receipt, 'customer_receipts',
            v_r.amount, v_prev + v_r.amount);

  perform write_audit('void','customer_receipts', p_receipt::text,
            format('Voided receipt %s (%s), released %s allocation(s)', v_r.receipt_no, v_r.amount, v_n),
            jsonb_build_object('receipt_no', v_r.receipt_no, 'amount', v_r.amount,
                               'reason', p_reason, 'released_allocations', v_n), v_actor);
  return p_receipt;
end $$;

comment on function void_receipt(uuid, text) is
  'Void a receipt: reverse its journal, release its allocations (invoices reopen), mark it void and reverse the ledger row.';

-- ---------------------------------------------------------------------
-- 7. unapply_receipt — move part of an allocation back to advance
--    Dr 1130 AR (invoice owes again) / Cr 2100 advance (money held).
--    The cash side is untouched, so the receipt journal is not reversed.
-- ---------------------------------------------------------------------
create or replace function public.unapply_receipt(
  p_receipt uuid,
  p_invoice uuid,
  p_amount  numeric default null
)
returns numeric(14,2)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r      customer_receipts%rowtype;
  v_status invoice_status;
  v_alloc  numeric(14,2);
  v_amt    numeric(14,2);
  v_actor  uuid := public.current_app_user();
  v_je     uuid;
begin
  -- Detaching money from an invoice is a reversal, not a collection: it needs
  -- the same authority as voiding the receipt.
  if not (has_permission('receipt.void') or has_permission('invoice.void')) then
    raise exception 'unapply_receipt: not authorized (receipt.void required)';
  end if;

  select * into v_r from customer_receipts where id = p_receipt for update;
  if not found then raise exception 'unapply_receipt: receipt % not found', p_receipt; end if;
  if v_r.status <> 'posted' then
    raise exception 'unapply_receipt: receipt % is %', v_r.receipt_no, v_r.status;
  end if;

  select status into v_status from invoices where id = p_invoice for update;
  if v_status is null then raise exception 'unapply_receipt: invoice % not found', p_invoice; end if;

  select amount into v_alloc from receipt_allocations
   where receipt_id = p_receipt and invoice_id = p_invoice;
  if v_alloc is null then
    raise exception 'unapply_receipt: receipt % is not allocated to invoice %', v_r.receipt_no, p_invoice;
  end if;

  v_amt := least(coalesce(p_amount, v_alloc), v_alloc);
  if v_amt is null or v_amt <= 0 then
    raise exception 'unapply_receipt: amount must be > 0';
  end if;

  if v_amt >= v_alloc - 0.005 then
    delete from receipt_allocations where receipt_id = p_receipt and invoice_id = p_invoice;
  else
    update receipt_allocations set amount = amount - v_amt
     where receipt_id = p_receipt and invoice_id = p_invoice;
  end if;

  update customer_receipts
     set allocated_amount = greatest(allocated_amount - v_amt, 0)
   where id = p_receipt;

  if v_status <> 'void' then
    update invoices
       set amount_paid = greatest(amount_paid - v_amt, 0),
           status = (case when amount_paid - v_amt <= 0.005 then 'posted'
                         else 'part_paid' end)::invoice_status
     where id = p_invoice;
  end if;

  v_je := post_journal(
    jsonb_build_object('entry_date', current_date, 'source','receipt',
                       'source_id', p_receipt::text,
                       'narration', format('Unapply %s from invoice %s (held as advance)', v_amt, p_invoice)),
    jsonb_build_array(
      jsonb_build_object('account_code','1130','debit', v_amt,'credit',0,
                         'party_type','customer','party_id', v_r.customer_id::text),
      jsonb_build_object('account_code','2100','debit',0,'credit', v_amt,
                         'party_type','customer','party_id', v_r.customer_id::text)));

  perform write_audit('update','customer_receipts', p_receipt::text,
            format('Unapplied %s of receipt %s from invoice %s; held as customer advance',
                   v_amt, v_r.receipt_no, p_invoice),
            jsonb_build_object('amount', v_amt, 'invoice_id', p_invoice,
                               'journal_entry_id', v_je), v_actor);
  return v_amt;
end $$;

comment on function unapply_receipt(uuid, uuid, numeric) is
  'Detach part of a receipt from an invoice and hold it as customer advance (1130 → 2100). The cash side is unchanged.';

-- ---------------------------------------------------------------------
-- 8. void_invoice — release payments to advance instead of refusing
-- ---------------------------------------------------------------------
create or replace function public.void_invoice(
  p_invoice uuid,
  p_reason  text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv     invoices%rowtype;
  v_line    record;
  v_type    item_type;
  v_actor   uuid := current_app_user();
  v_prev    numeric(14,2);
  v_released numeric(14,2);
begin
  if not has_permission('invoice.void') then
    raise exception 'void_invoice: not authorized (invoice.void required)';
  end if;

  select * into v_inv from invoices where id = p_invoice for update;
  if not found then raise exception 'void_invoice: invoice % not found', p_invoice; end if;
  if v_inv.status = 'void' then
    raise exception 'void_invoice: invoice % is already void', v_inv.invoice_no;
  end if;

  -- Money already received stays with the customer as advance: releasing it
  -- is the only way a paid invoice can be voided, and the cash is real.
  v_released := public._release_invoice_allocations(p_invoice, p_reason);

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

  -- 4) Reclass the released payments from AR to customer advance, so the
  --    invoice's AR is fully cleared and the money is not lost in a credit
  --    balance nobody can apply.
  if v_released > 0.005 then
    perform post_journal(
      jsonb_build_object('entry_date', current_date, 'source','invoice_void',
                         'source_id', p_invoice::text,
                         'narration', format('Release %s paid on voided invoice %s to customer advance',
                                             v_released, v_inv.invoice_no)),
      jsonb_build_array(
        jsonb_build_object('account_code','1130','debit', v_released,'credit',0,
                           'party_type','customer','party_id', v_inv.customer_id::text),
        jsonb_build_object('account_code','2100','debit',0,'credit', v_released,
                           'party_type','customer','party_id', v_inv.customer_id::text)));
  end if;

  -- 5) Mark the invoice void
  update invoices set status = 'void', amount_paid = 0 where id = p_invoice;

  -- 6) Release a linked order back to approved so it can be re-invoiced
  if v_inv.order_id is not null then
    update sales_orders set status = 'approved', updated_at = now(), version = version + 1
      where id = v_inv.order_id and status = 'invoiced';
  end if;

  perform write_audit('void', 'invoices', p_invoice::text,
            format('Voided %s (total %s)%s', v_inv.invoice_no, v_inv.grand_total,
                   case when p_reason is null then '' else ': ' || p_reason end),
            jsonb_build_object('invoice_no', v_inv.invoice_no, 'grand_total', v_inv.grand_total,
                               'is_official', v_inv.is_official, 'reason', p_reason,
                               'released_to_advance', v_released),
            v_actor);
  return p_invoice;
end $$;

comment on function void_invoice(uuid, text) is
  'Void a posted invoice: reverse the journal, restock, reverse the ledger, and release any allocated payments to customer advance (2100).';

-- ---------------------------------------------------------------------
-- 9. Grants
-- ---------------------------------------------------------------------
revoke all on function public._release_invoice_allocations(uuid, text)
  from public, anon, authenticated;
grant execute on function public._release_invoice_allocations(uuid, text) to service_role;

revoke all on function public.void_receipt(uuid, text) from public, anon;
grant execute on function public.void_receipt(uuid, text) to authenticated, service_role;

revoke all on function public.unapply_receipt(uuid, uuid, numeric) from public, anon;
grant execute on function public.unapply_receipt(uuid, uuid, numeric) to authenticated, service_role;

revoke all on function public.customer_advance(uuid) from public, anon;
grant execute on function public.customer_advance(uuid) to authenticated, service_role;

revoke all on function public.record_receipt(jsonb, jsonb) from public, anon;
grant execute on function public.record_receipt(jsonb, jsonb) to authenticated, service_role;

revoke all on function public.void_invoice(uuid, text) from public, anon;
grant execute on function public.void_invoice(uuid, text) to authenticated, service_role;

grant select on public.v_customer_advance to authenticated;
