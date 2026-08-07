-- =====================================================================
-- 0092_reconcile_payment_intents.sql  --  close the portal pay loop
--
-- A customer submits a payment_intents "I paid" suggestion from the portal.
-- Staff reconcile it into a real posted receipt (record_receipt) or void it.
-- These are the ONLY ways an intent leaves 'pending', and they are gated to
-- staff holding receipt.record or accounting.manage (the same gate that can
-- SEE a pending intent at all). Both functions are SECURITY DEFINER and only
-- accept the intent id plus the staff-chosen routing (store/method/date/
-- deposit); the amount and customer come from the intent row, never the caller.
--
-- Grants: both new functions are granted to `authenticated` only; anon/public
-- REVOKEd. (Portal principals have no roles, so even as `authenticated` they
-- never pass the has_permission gate.)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) reconcile_payment_intent  --  intent -> posted receipt (one txn)
-- ---------------------------------------------------------------------
create or replace function public.reconcile_payment_intent(
  p_intent_id       uuid,
  p_store_id        uuid,
  p_method_id       uuid,
  p_receipt_date    date default null,
  p_deposit_account text default null
)
returns uuid  -- the created customer_receipts.id
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_intent payment_intents%rowtype;
  v_receipt uuid;
  v_header jsonb;
begin
  -- Gate: must be staff with receipt/accounting access (same as seeing pending).
  if not (public.has_permission('receipt.record') or public.has_permission('accounting.manage')) then
    raise exception 'reconcile_payment_intent: not authorized (receipt.record or accounting.manage required)';
  end if;

  if p_store_id is null then raise exception 'reconcile_payment_intent: store_id required'; end if;
  if p_method_id is null then raise exception 'reconcile_payment_intent: method_id required'; end if;

  select * into v_intent
    from public.payment_intents
   where id = p_intent_id
   for update;
  if v_intent.id is null then
    raise exception 'reconcile_payment_intent: intent % not found', p_intent_id;
  end if;
  if v_intent.status <> 'pending' then
    raise exception 'reconcile_payment_intent: intent % is already %', p_intent_id, v_intent.status;
  end if;

  -- All money-bearing fields come from the intent row; the caller only picks
  -- where it was collected (store), the instrument (method), and optional
  -- deposit/date overrides.
  v_header := jsonb_build_object(
    'customer_id',  v_intent.customer_id,
    'store_id',     p_store_id,
    'method_id',    p_method_id,
    'amount',       v_intent.amount,
    'reference',    v_intent.reference,
    'notes',        v_intent.note
  );
  if p_receipt_date is not null then
    v_header := v_header || jsonb_build_object('receipt_date', p_receipt_date::text);
  end if;
  if p_deposit_account is not null then
    v_header := v_header || jsonb_build_object('deposit_account', p_deposit_account);
  end if;

  v_receipt := public.record_receipt(v_header);

  update public.payment_intents
     set status = 'matched',
         matched_receipt_id = v_receipt
   where id = p_intent_id;

  perform public.write_audit(
    'update', 'payment_intents', p_intent_id::text,
    format('Reconciled intent %s into receipt %s', p_intent_id, v_receipt),
    jsonb_build_object('receipt_id', v_receipt,
                       'store_id', p_store_id, 'method_id', p_method_id));

  return v_receipt;
end $$;

-- ---------------------------------------------------------------------
-- 2) void_payment_intent  -- reject a pending "I paid" signal
-- ---------------------------------------------------------------------
create or replace function public.void_payment_intent(
  p_intent_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_intent payment_intents%rowtype;
begin
  if not (public.has_permission('receipt.record') or public.has_permission('accounting.manage')) then
    raise exception 'void_payment_intent: not authorized (receipt.record or accounting.manage required)';
  end if;

  select * into v_intent
    from public.payment_intents
   where id = p_intent_id
   for update;
  if v_intent.id is null then
    raise exception 'void_payment_intent: intent % not found', p_intent_id;
  end if;
  if v_intent.status <> 'pending' then
    raise exception 'void_payment_intent: intent % is already %', p_intent_id, v_intent.status;
  end if;

  update public.payment_intents
     set status = 'void'
   where id = p_intent_id;

  perform public.write_audit(
    'void', 'payment_intents', p_intent_id::text,
    coalesce(nullif(p_reason,''), 'Voided pending payment intent'),
    null);

end $$;

-- ---------------------------------------------------------------------
-- 3) Grants - authenticated only, anon/public revoked
-- ---------------------------------------------------------------------
revoke all on function public.reconcile_payment_intent(uuid,uuid,uuid,date,text) from anon, public;
revoke all on function public.void_payment_intent(uuid,text)              from anon, public;

grant execute on function public.reconcile_payment_intent(uuid,uuid,uuid,date,text) to authenticated;
grant execute on function public.void_payment_intent(uuid,text)                       to authenticated;