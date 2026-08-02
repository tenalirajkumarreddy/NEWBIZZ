-- =====================================================================
-- 0081_whatsapp_messaging.sql   WhatsApp messaging core (7.8)
--
-- DATA layer for the official WhatsApp Business Cloud API integration.
-- Three new tables, all STRICTLY ADDITIVE (nothing existing is touched):
--
--   1) whatsapp_config       - single row (id=1) of connection settings.
--      The Meta access token is stored ENCRYPTED (AES-256-GCM via the
--      vendored wacrm encryption.ts) as access_token_encrypted; the
--      app decrypts with the ENCRYPTION_KEY env var. dry_run defaults
--      true so everything works with no Meta credentials.
--
--   2) whatsapp_conversations - one thread per customer phone (E.164),
--      linked to the existing customer_stores/customers so threads tie
--      directly into the CRM/orders/invoices data model.
--
--   3) whatsapp_messages    - both directions. Inbound rows land here
--      from the webhook; outbound rows are written before send and get
--      their whatsapp_message_id + status back from the Meta callback.
--
-- RLS follows the repo convention: authenticated users can read all
-- (read_all_auth), writes go through SECURITY DEFINER RPCs (least
-- privilege - no direct INSERT/UPDATE/DELETE policies except config
-- management which needs 'admin').
-- =====================================================================

-- ---------------------------------------------------------------------
-- whatsapp_config - singleton connection settings row (id is locked to 1).
-- ---------------------------------------------------------------------
create table whatsapp_config (
  id                     smallint primary key default 1 check (id = 1),
  waba_id                text,
  phone_number_id        text,
  access_token_encrypted text,                  -- AES-256-GCM (encryption.ts)
  meta_app_id            text,
  verify_token           text,                  -- webhook hub.verify_token handshake
  default_template       text,                  -- fallback template name for notifications
  dry_run                boolean not null default true,
  registered_at          timestamptz,
  updated_at             timestamptz,
  updated_by             uuid references users(id)
);
create index whatsapp_config_singleton_idx on whatsapp_config ((true)); -- enforces intent
comment on table whatsapp_config is 'WhatsApp Business Cloud API connection settings (singleton). Token encrypted at rest.';

-- ---------------------------------------------------------------------
-- whatsapp_conversations - a thread per customer phone, tied to a store.
-- ---------------------------------------------------------------------
create table whatsapp_conversations (
  id                 uuid primary key default gen_random_uuid(),
  customer_store_id  uuid references customer_stores(id) on delete set null,
  customer_id        uuid references customers(id) on delete set null,
  phone              text not null,             -- E.164 (digits only)
  status             text not null default 'open',  -- open | pending | closed
  assigned_to        uuid references users(id),
  last_message_at    timestamptz,
  created_by         uuid references users(id),
  created_at         timestamptz not null default now(),
  unique (phone)
);
create index whatsapp_conversations_store_idx on whatsapp_conversations (customer_store_id);
comment on table whatsapp_conversations is 'WhatsApp thread per customer phone, linked to customer_stores.';

-- ---------------------------------------------------------------------
-- whatsapp_messages - both directions.
-- ---------------------------------------------------------------------
create table whatsapp_messages (
  id                     uuid primary key default gen_random_uuid(),
  conversation_id        uuid not null references whatsapp_conversations(id) on delete cascade,
  direction              text not null check (direction in ('inbound','outbound')),
  msg_type               text not null default 'text',  -- text | template | image | ...
  body                   text,
  media_url              text,
  media_mime             text,
  media_filename         text,
  template_name          text,
  template_params        jsonb,
  whatsapp_message_id    text,                  -- wamid from Meta
  status                 text,                  -- sent | delivered | read | failed
  error_message          text,
  sent_by                uuid references users(id),  -- agent who sent (outbound)
  created_at             timestamptz not null default now()
);
create index whatsapp_messages_conversation_idx on whatsapp_messages (conversation_id, created_at desc);
create index whatsapp_messages_wamid_idx     on whatsapp_messages (whatsapp_message_id) where whatsapp_message_id is not null;
comment on table whatsapp_messages is 'WhatsApp messages, both directions. Outbound get wamid/status from Meta callbacks.';

-- ---------------------------------------------------------------------
-- RLS. Reads open to authenticated (read_all_auth convention); writes
-- only via the SECURITY DEFINER RPCs below. whatsapp_config also exposes
-- a manage policy gated on 'admin'.
-- ---------------------------------------------------------------------
alter table whatsapp_config       enable row level security;
alter table whatsapp_conversations enable row level security;
alter table whatsapp_messages     enable row level security;

create policy read_all_auth on whatsapp_config       for select to authenticated using (true);
create policy read_all_auth on whatsapp_conversations for select to authenticated using (true);
create policy read_all_auth on whatsapp_messages     for select to authenticated using (true);
create policy manage_config on whatsapp_config for all to authenticated
  using (has_permission('admin')) with check (has_permission('admin'));

-- ---------------------------------------------------------------------
-- RPC: whatsapp_save_config - upsert the singleton row. Token is passed
-- already-encrypted by the app (ENCRYPTION_KEY never leaves the server).
-- ---------------------------------------------------------------------
create or replace function whatsapp_save_config(
  p_waba_id text,
  p_phone_number_id text,
  p_access_token_encrypted text,
  p_meta_app_id text,
  p_verify_token text,
  p_default_template text default null,
  p_dry_run boolean default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := current_app_user();
begin
  insert into whatsapp_config (id, waba_id, phone_number_id, access_token_encrypted,
      meta_app_id, verify_token, default_template, dry_run, updated_at, updated_by)
  values (1, p_waba_id, p_phone_number_id, p_access_token_encrypted,
      p_meta_app_id, p_verify_token, p_default_template,
      coalesce(p_dry_run, true), now(), v_me)
  on conflict (id) do update set
    waba_id                = excluded.waba_id,
    phone_number_id        = excluded.phone_number_id,
    access_token_encrypted = excluded.access_token_encrypted,
    meta_app_id            = excluded.meta_app_id,
    verify_token           = excluded.verify_token,
    default_template       = coalesce(excluded.default_template, whatsapp_config.default_template),
    dry_run                = coalesce(excluded.dry_run, whatsapp_config.dry_run),
    updated_at             = now(),
    updated_by             = v_me;
end $$;
comment on function whatsapp_save_config is 'Upsert WhatsApp connection config (singleton). Definer-only.';

-- ---------------------------------------------------------------------
-- RPC: whatsapp_get_or_create_conversation - find a thread by phone or
-- create it (attaching to a store/customer when known). Returns the id.
-- ---------------------------------------------------------------------
create or replace function whatsapp_get_or_create_conversation(
  p_phone text,
  p_customer_store_id uuid default null,
  p_customer_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_me uuid := current_app_user();
begin
  select id into v_id from whatsapp_conversations where phone = p_phone limit 1;
  if v_id is null then
    insert into whatsapp_conversations (customer_store_id, customer_id, phone, created_by)
    values (p_customer_store_id, p_customer_id, p_phone, v_me)
    on conflict (phone) do nothing
    returning id into v_id;
    if v_id is null then
      select id into v_id from whatsapp_conversations where phone = p_phone limit 1;
    end if;
  end if;
  return v_id;
end $$;
comment on function whatsapp_get_or_create_conversation is 'Find-or-create a WhatsApp conversation by E.164 phone. Definer-only.';

-- ---------------------------------------------------------------------
-- RPC: whatsapp_insert_message - record a message row (used by the
-- webhook for inbound and by the send path for outbound before/after send).
-- ---------------------------------------------------------------------
create or replace function whatsapp_insert_message(
  p_conversation_id uuid,
  p_direction text,
  p_msg_type text default 'text',
  p_body text default null,
  p_media_url text default null,
  p_media_mime text default null,
  p_media_filename text default null,
  p_template_name text default null,
  p_template_params jsonb default null,
  p_whatsapp_message_id text default null,
  p_status text default null,
  p_sent_by uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  insert into whatsapp_messages (
    conversation_id, direction, msg_type, body, media_url, media_mime,
    media_filename, template_name, template_params, whatsapp_message_id,
    status, sent_by)
  values (
    p_conversation_id, p_direction, p_msg_type, p_body, p_media_url, p_media_mime,
    p_media_filename, p_template_name, p_template_params, p_whatsapp_message_id,
    p_status, p_sent_by)
  returning id into v_id;

  update whatsapp_conversations
     set last_message_at = now(),
         status = case when p_direction = 'inbound' then 'open' else status end
   where id = p_conversation_id;
  return v_id;
end $$;
comment on function whatsapp_insert_message is 'Record a WhatsApp message row + touch conversation. Definer-only.';

-- ---------------------------------------------------------------------
-- RPC: whatsapp_update_message_status - webhook status callback updates
-- the outbound row (sent -> delivered -> read -> failed).
-- ---------------------------------------------------------------------
create or replace function whatsapp_update_message_status(
  p_whatsapp_message_id text,
  p_status text,
  p_error_message text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  update whatsapp_messages
     set status = p_status,
         error_message = coalesce(p_error_message, error_message)
   where whatsapp_message_id = p_whatsapp_message_id;
end $$;
comment on function whatsapp_update_message_status is 'Apply a Meta delivery status update to the outbound row. Definer-only.';

-- ---------------------------------------------------------------------
-- Grants. RPCs run definer so callers just need execute (authenticated).
-- ---------------------------------------------------------------------
grant execute on function whatsapp_save_config(text, text, text, text, text, text, boolean) to authenticated;
grant execute on function whatsapp_get_or_create_conversation(text, uuid, uuid) to authenticated;
grant execute on function whatsapp_insert_message(uuid, text, text, text, text, text, text, text, jsonb, text, text, uuid) to authenticated;
grant execute on function whatsapp_update_message_status(text, text, text) to authenticated;
