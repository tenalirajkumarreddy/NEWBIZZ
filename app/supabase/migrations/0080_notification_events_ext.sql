-- =====================================================================
-- 0080_notification_events_ext.sql  ·  Notification wiring, part 2 (§7.8)
--
-- Completes the event set from 0078 with the AP / returns / voucher /
-- recon events that also represent business value:
--
--   credit_notes        (incl. sales returns — reason sales_adjustment)
--   supplier_bills      (AP raised / voided)
--   supplier_payments   (money out / voided)
--   delivery_challans   (printed / delivered / cancelled)
--   purchase_receipts   (GRN goods received)
--   journal_entries     (manual vouchers, source='voucher')
--   bank_statement_imports (statement batch imported)
--
-- Same pattern as 0078: SECURITY DEFINER AFTER INSERT/UPDATE triggers that
-- fan out via notify_perm() to permission holders, or notify() the actor /
-- creator directly. Everything is idempotent (drop-trigger-if-exists +
-- create or replace).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Credit notes — posted → creditnote.view; sales returns (reason
--    sales_adjustment) get a distinct title; cancelled → accounting alarm.
--    Covers todo item "sales_returns" (record_sales_return writes a
--    credit_notes header with reason sales_adjustment).
-- ---------------------------------------------------------------------
create or replace function credit_notes_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and new.status = 'posted' then
    if new.reason = 'sales_adjustment' then
      perform notify_perm('creditnote.view',
        format('Sales return posted: %s', new.credit_note_no),
        jsonb_build_object(
          'body', format('Return of %s. Review AR reversal.', coalesce(new.amount::text, '—')),
          'severity', 'info',
          'category', 'credit_note',
          'entity_type', 'credit_notes',
          'entity_id', new.id::text,
          'action_url', '/credit-notes'));
    else
      perform notify_perm('creditnote.view',
        format('Credit note posted: %s', new.credit_note_no),
        jsonb_build_object(
          'body', format('Credit of %s (%s). Review AR reversal.', coalesce(new.amount::text,'—'), new.reason),
          'severity', 'info',
          'category', 'credit_note',
          'entity_type', 'credit_notes',
          'entity_id', new.id::text,
          'action_url', '/credit-notes'));
    end if;
  elsif tg_op = 'UPDATE' and new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    perform notify_perm('accounting.manage',
      format('Credit note %s cancelled', new.credit_note_no),
      jsonb_build_object(
        'body', format('Credit note %s was cancelled. Review the reversal.', new.credit_note_no),
        'severity', 'critical',
        'category', 'credit_note',
        'entity_type', 'credit_notes',
        'entity_id', new.id::text,
        'action_url', '/credit-notes'));
  end if;
  return new;
end $$;
comment on function credit_notes_notify is '§9.9 credit note / sales return notifications.';

drop trigger if exists credit_notes_notify_trg on credit_notes;
create trigger credit_notes_notify_trg
  after insert or update of status on credit_notes
  for each row
  execute function credit_notes_notify();

-- ---------------------------------------------------------------------
-- 2) Supplier bills — AP raised → purchase.view; void → accounting alarm
-- ---------------------------------------------------------------------
create or replace function supplier_bills_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and new.status = 'posted' then
    perform notify_perm('purchase.view',
      format('Supplier bill recorded: %s', new.bill_no),
      jsonb_build_object(
        'body', format('AP of %s raised. Due %s.', coalesce(new.grand_total::text, '—'),
                       coalesce(new.due_date::text, 'not set')),
        'severity', 'info',
        'category', 'supplier_bill',
        'entity_type', 'supplier_bills',
        'entity_id', new.id::text,
        'action_url', '/purchases'));
  elsif tg_op = 'UPDATE' and new.status = 'void' and old.status is distinct from 'void' then
    perform notify_perm('accounting.manage',
      format('Supplier bill %s voided', new.bill_no),
      jsonb_build_object(
        'body', format('Supplier bill %s was voided. Review AP reversal.', new.bill_no),
        'severity', 'critical',
        'category', 'supplier_bill',
        'entity_type', 'supplier_bills',
        'entity_id', new.id::text,
        'action_url', '/purchases'));
  end if;
  return new;
end $$;
comment on function supplier_bills_notify is '§9.9 supplier bill notifications.';

drop trigger if exists supplier_bills_notify_trg on supplier_bills;
create trigger supplier_bills_notify_trg
  after insert or update of status on supplier_bills
  for each row
  execute function supplier_bills_notify();

-- ---------------------------------------------------------------------
-- 3) Supplier payments — money out → purchase.view; void → accounting alarm
-- ---------------------------------------------------------------------
create or replace function supplier_payments_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and new.status = 'posted' then
    perform notify_perm('purchase.view',
      format('Supplier payment posted: %s', new.payment_no),
      jsonb_build_object(
        'body', format('Payment of %s (%s).', coalesce(new.amount::text, '—'), new.mode),
        'severity', 'info',
        'category', 'payment',
        'entity_type', 'supplier_payments',
        'entity_id', new.id::text,
        'action_url', '/payables'));
  elsif tg_op = 'UPDATE' and new.status = 'void' and old.status is distinct from 'void' then
    perform notify_perm('accounting.manage',
      format('Supplier payment %s voided', new.payment_no),
      jsonb_build_object(
        'body', format('Supplier payment %s was voided. Review reversal.', new.payment_no),
        'severity', 'critical',
        'category', 'payment',
        'entity_type', 'supplier_payments',
        'entity_id', new.id::text,
        'action_url', '/payables'));
  end if;
  return new;
end $$;
comment on function supplier_payments_notify is '§9.9 supplier payment notifications.';

drop trigger if exists supplier_payments_notify_trg on supplier_payments;
create trigger supplier_payments_notify_trg
  after insert or update of status on supplier_payments
  for each row
  execute function supplier_payments_notify();

-- ---------------------------------------------------------------------
-- 4) Delivery challans — printed → order.view; delivered → creator
--    (fulfilment complete); cancelled → creator warning
-- ---------------------------------------------------------------------
create or replace function delivery_challans_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creator uuid;
begin
  if tg_op = 'INSERT' and new.status = 'printed' then
    perform notify_perm('order.view',
      format('Delivery challan printed: %s', new.challan_no),
      jsonb_build_object(
        'body', 'A delivery note has been printed against an order.',
        'severity', 'info',
        'category', 'challan',
        'entity_type', 'delivery_challans',
        'entity_id', new.id::text,
        'action_url', '/challans'));
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    select created_by into v_creator from sales_orders where id = new.order_id;
    if new.status = 'delivered' and v_creator is not null then
      perform notify(v_creator,
        format('Challan %s delivered', new.challan_no),
        jsonb_build_object(
          'body', 'The goods you dispatched have been marked delivered.',
          'severity', 'info',
          'category', 'challan',
          'entity_type', 'delivery_challans',
          'entity_id', new.id::text,
          'action_url', '/challans'));
    elsif new.status = 'cancelled' and v_creator is not null then
      perform notify(v_creator,
        format('Challan %s cancelled', new.challan_no),
        jsonb_build_object(
          'body', 'A delivery note for your order was cancelled.',
          'severity', 'warning',
          'category', 'challan',
          'entity_type', 'delivery_challans',
          'entity_id', new.id::text,
          'action_url', '/challans'));
    end if;
  end if;
  return new;
end $$;
comment on function delivery_challans_notify is '§9.9 delivery challan notifications.';

drop trigger if exists delivery_challans_notify_trg on delivery_challans;
create trigger delivery_challans_notify_trg
  after insert or update of status on delivery_challans
  for each row
  execute function delivery_challans_notify();

-- ---------------------------------------------------------------------
-- 5) Purchase receipts (GRN) — goods received → purchase.view
-- ---------------------------------------------------------------------
create or replace function purchase_receipts_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and new.status = 'received' then
    perform notify_perm('purchase.view',
      format('Goods received: %s', new.grn_no),
      jsonb_build_object(
        'body', format('GRN %s received. Goods value %s.', new.grn_no, coalesce(new.goods_value::text, '—')),
        'severity', 'info',
        'category', 'purchase',
        'entity_type', 'purchase_receipts',
        'entity_id', new.id::text,
        'action_url', '/purchases'));
  elsif tg_op = 'UPDATE' and new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    perform notify_perm('purchase.view',
      format('GRN %s cancelled', new.grn_no),
      jsonb_build_object(
        'body', format('GRN %s was cancelled. Review stock impact.', new.grn_no),
        'severity', 'warning',
        'category', 'purchase',
        'entity_type', 'purchase_receipts',
        'entity_id', new.id::text,
        'action_url', '/purchases'));
  end if;
  return new;
end $$;
comment on function purchase_receipts_notify is '§9.9 GRN notifications.';

drop trigger if exists purchase_receipts_notify_trg on purchase_receipts;
create trigger purchase_receipts_notify_trg
  after insert or update of status on purchase_receipts
  for each row
  execute function purchase_receipts_notify();

-- ---------------------------------------------------------------------
-- 6) Manual vouchers — journal_entries with source='voucher' (post_voucher)
--    → journal.post holders. Cheap guard so the trigger is a no-op for the
--    hot sale/payment/purchase journal writes.
-- ---------------------------------------------------------------------
create or replace function journal_vouchers_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.source = 'voucher' and new.status = 'posted' and new.reverses_id is null then
    perform notify_perm('journal.post',
      format('Voucher posted: %s', new.entry_no),
      jsonb_build_object(
        'body', coalesce(nullif(new.narration, ''), 'A manual voucher was posted.'),
        'severity', 'info',
        'category', 'voucher',
        'entity_type', 'journal_entries',
        'entity_id', new.id::text,
        'action_url', '/accounting'));
  elsif new.source = 'voucher' and new.reverses_id is not null then
    perform notify_perm('journal.post',
      format('Voucher reversed: %s', new.entry_no),
      jsonb_build_object(
        'body', 'A manual voucher was reversed.',
        'severity', 'warning',
        'category', 'voucher',
        'entity_type', 'journal_entries',
        'entity_id', new.id::text,
        'action_url', '/accounting'));
  end if;
  return new;
end $$;
comment on function journal_vouchers_notify is '§9.9 manual voucher notifications.';

drop trigger if exists journal_vouchers_notify_trg on journal_entries;
create trigger journal_vouchers_notify_trg
  after insert on journal_entries
  for each row
  execute function journal_vouchers_notify();

-- ---------------------------------------------------------------------
-- 7) Bank statement imports — batch imported → bank.reconcile holders
-- ---------------------------------------------------------------------
create or replace function bank_statement_imports_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform notify_perm('bank.reconcile',
    format('Bank statement imported: %s', coalesce(nullif(new.file_name, ''), 'new batch')),
    jsonb_build_object(
      'body', format('%s rows inserted (%s duplicates). Review matches.', new.inserted_count, new.duplicate_count),
      'severity', 'info',
      'category', 'bank',
      'entity_type', 'bank_statement_imports',
      'entity_id', new.id::text,
      'action_url', '/bank'));
  return new;
end $$;
comment on function bank_statement_imports_notify is '§9.9 bank statement import notifications.';

drop trigger if exists bank_statement_imports_notify_trg on bank_statement_imports;
create trigger bank_statement_imports_notify_trg
  after insert on bank_statement_imports
  for each row
  execute function bank_statement_imports_notify();
