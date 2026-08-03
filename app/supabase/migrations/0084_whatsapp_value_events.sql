-- =====================================================================
-- 0084_whatsapp_value_events.sql   Wire real value events → WhatsApp
--
-- The dispatch worker (drainWhatsappNotifications) drains notifications
-- with delivery_channel='whatsapp', but nothing in production ever created
-- such a row: every value-event trigger (0078) fans out with the default
-- delivery_channel='in_app'. This migration connects the two ends so the
-- worker actually has work to do.
--
-- 1) whatsapp_resolve_recipient_phone gains resolution for the value
--    documents (invoices / sales_orders / customer_receipts → store phone),
--    so a whatsapp notification that references the document resolves a
--    recipient phone.
--
-- 2) whatsapp_pref_allows(user, category) - definer wrapper over the
--    revoked pref_allows() so the anon-key worker can actually honour
--    per-user per-category mutes (its direct pref_allows RPC previously
--    failed silently and the check was a no-op).
--
-- 3) whatsapp_customer_owner(store, customer) - resolve the user who owns
--    the customer relationship (conversation assignee → store creator →
--    customer creator). WhatsApp notifications are addressed to that user
--    (their prefs gate the send); the phone comes from the entity.
--
-- 4) whatsapp_enqueue_value_notify(...) - definer helper. If an owner
--    exists, fire notify() with delivery_channel='whatsapp'. notify() (0033)
--    downgrades to in_app automatically when the owner muted the category.
--
-- 5) New additive triggers on invoices / sales_orders / customer_receipts
--    that enqueue a whatsapp notification for the customer-facing events.
--    Existing 0078 in-app fan-out is byte-identical.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Extend recipient-phone resolution to the value documents.
-- ---------------------------------------------------------------------
create or replace function whatsapp_resolve_recipient_phone(p_entity_type text, p_entity_id uuid)
returns text
language plpgsql stable security definer set search_path = public as $$
declare v_phone text;
begin
  if p_entity_type = 'customer_stores' and p_entity_id is not null then
    select phone into v_phone from customer_stores where id = p_entity_id limit 1;
  elsif p_entity_type = 'customers' and p_entity_id is not null then
    select phone into v_phone from customer_stores
     where customer_id = p_entity_id and is_primary and phone is not null
     order by is_primary desc nulls last limit 1;
    if v_phone is null then
      select phone into v_phone from customer_stores
       where customer_id = p_entity_id and phone is not null limit 1;
    end if;
  elsif p_entity_type = 'whatsapp_conversations' and p_entity_id is not null then
    select phone into v_phone from whatsapp_conversations where id = p_entity_id limit 1;
  elsif p_entity_type = 'invoices' and p_entity_id is not null then
    select cs.phone into v_phone from invoices i
      join customer_stores cs on cs.id = i.store_id
     where i.id = p_entity_id limit 1;
  elsif p_entity_type = 'sales_orders' and p_entity_id is not null then
    select cs.phone into v_phone from sales_orders so
      join customer_stores cs on cs.id = so.store_id
     where so.id = p_entity_id limit 1;
  elsif p_entity_type = 'customer_receipts' and p_entity_id is not null then
    select cs.phone into v_phone from customer_receipts cr
      join customer_stores cs on cs.id = cr.store_id
     where cr.id = p_entity_id limit 1;
  end if;
  return v_phone;
end $$;
comment on function whatsapp_resolve_recipient_phone is 'Resolve the recipient E.164 phone for a notification entity (stores, customers, conversations, or value documents). Definer-only.';

grant execute on function whatsapp_resolve_recipient_phone(text, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 2) Definer wrapper over pref_allows() for the anon-key worker.
-- ---------------------------------------------------------------------
create or replace function whatsapp_pref_allows(p_user uuid, p_category text)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.pref_allows(p_user, p_category, 'whatsapp'::notification_channel);
$$;
comment on function whatsapp_pref_allows is 'WhatsApp mute gate for the dispatch worker. Definer wrapper over pref_allows (revoked from clients).';

grant execute on function whatsapp_pref_allows(uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 3) Customer-owning user resolution.
-- ---------------------------------------------------------------------
create or replace function whatsapp_customer_owner(p_store_id uuid, p_customer_id uuid)
returns uuid
language plpgsql stable security definer set search_path = public as $$
declare
  v_phone text;
  v_owner uuid;
begin
  -- Prefer the agent assigned to the store's WhatsApp thread.
  if p_store_id is not null then
    select phone into v_phone from customer_stores where id = p_store_id and phone is not null limit 1;
    if v_phone is not null then
      select assigned_to into v_owner from whatsapp_conversations
       where phone = v_phone and assigned_to is not null
       order by last_message_at desc nulls last limit 1;
    end if;
  end if;
  -- Fall back to the store / customer creators.
  if v_owner is null and p_store_id is not null then
    select created_by into v_owner from customer_stores where id = p_store_id limit 1;
  end if;
  if v_owner is null and p_customer_id is not null then
    select created_by into v_owner from customers where id = p_customer_id limit 1;
  end if;
  return v_owner;
end $$;
comment on function whatsapp_customer_owner is 'Resolve the user who owns a customer relationship (conversation assignee → store creator → customer creator). Definer-only.';

-- ---------------------------------------------------------------------
-- 4) Enqueue a whatsapp-channel notification for a customer-facing event.
--    No owner (e.g. seed data without a creator) → no-op; the in-app
--    fan-out from 0078 still runs unchanged.
-- ---------------------------------------------------------------------
create or replace function whatsapp_enqueue_value_notify(
  p_store_id uuid,
  p_customer_id uuid,
  p_title text,
  p_opts jsonb
) returns void
language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  v_owner := whatsapp_customer_owner(p_store_id, p_customer_id);
  if v_owner is null then
    return;
  end if;
  perform notify(v_owner, p_title, p_opts || jsonb_build_object('delivery_channel', 'whatsapp'::notification_channel));
end $$;
comment on function whatsapp_enqueue_value_notify is 'Fire a whatsapp-channel notify() for a customer-facing event, addressed to the customer-owning user. Definer-only.';

-- ---------------------------------------------------------------------
-- 5) Additive value-event triggers → whatsapp notifications.
-- ---------------------------------------------------------------------
create or replace function whatsapp_invoices_notify()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.status = 'posted' then
    perform whatsapp_enqueue_value_notify(
      new.store_id, new.customer_id,
      format('Invoice %s issued', new.invoice_no),
      jsonb_build_object(
        'body', format('Your invoice %s for %s is ready.', new.invoice_no, coalesce(new.grand_total::text, '—')),
        'severity', 'info',
        'category', 'invoice',
        'entity_type', 'invoices',
        'entity_id', new.id::text,
        'action_url', '/sales'));
  end if;
  return new;
end $$;
comment on function whatsapp_invoices_notify is 'WhatsApp notification on invoice posted (additive to invoices_notify).';

drop trigger if exists whatsapp_invoices_notify_trg on invoices;
create trigger whatsapp_invoices_notify_trg
  after insert on invoices
  for each row
  execute function whatsapp_invoices_notify();

create or replace function whatsapp_sales_orders_notify()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.status = 'confirmed' then
    perform whatsapp_enqueue_value_notify(
      new.store_id, new.customer_id,
      format('Order %s confirmed', new.order_no),
      jsonb_build_object(
        'body', format('Your order %s has been confirmed.', new.order_no),
        'severity', 'info',
        'category', 'order',
        'entity_type', 'sales_orders',
        'entity_id', new.id::text,
        'action_url', '/orders'));
  elsif tg_op = 'UPDATE' and new.status = 'invoiced' and old.status is distinct from 'invoiced' then
    perform whatsapp_enqueue_value_notify(
      new.store_id, new.customer_id,
      format('Order %s invoiced', new.order_no),
      jsonb_build_object(
        'body', format('Your order %s has been invoiced.', new.order_no),
        'severity', 'info',
        'category', 'order',
        'entity_type', 'sales_orders',
        'entity_id', new.id::text,
        'action_url', '/sales'));
  end if;
  return new;
end $$;
comment on function whatsapp_sales_orders_notify is 'WhatsApp notification on order confirmed/invoiced (additive to sales_orders_notify).';

drop trigger if exists whatsapp_sales_orders_notify_trg on sales_orders;
create trigger whatsapp_sales_orders_notify_trg
  after insert or update of status on sales_orders
  for each row
  execute function whatsapp_sales_orders_notify();

create or replace function whatsapp_customer_receipts_notify()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.status = 'posted' then
    perform whatsapp_enqueue_value_notify(
      new.store_id, new.customer_id,
      format('Payment received: %s', new.receipt_no),
      jsonb_build_object(
        'body', format('%s payment of %s received. Thank you!', new.mode, coalesce(new.amount::text, '—')),
        'severity', 'info',
        'category', 'receipt',
        'entity_type', 'customer_receipts',
        'entity_id', new.id::text,
        'action_url', '/receipts'));
  end if;
  return new;
end $$;
comment on function whatsapp_customer_receipts_notify is 'WhatsApp notification on payment received (additive to customer_receipts_notify).';

drop trigger if exists whatsapp_customer_receipts_notify_trg on customer_receipts;
create trigger whatsapp_customer_receipts_notify_trg
  after insert on customer_receipts
  for each row
  execute function whatsapp_customer_receipts_notify();

-- ---------------------------------------------------------------------
-- Internal helpers: not client-callable.
-- ---------------------------------------------------------------------
revoke all on function whatsapp_customer_owner(uuid, uuid) from public, anon, authenticated;
revoke all on function whatsapp_enqueue_value_notify(uuid, uuid, text, jsonb) from public, anon, authenticated;
