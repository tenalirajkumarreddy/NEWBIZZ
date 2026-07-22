-- =====================================================================
-- 0027_notifications_documents.sql  ·  Phase 4 — Notifications & documents  (§7.8)
--
-- The DATA layer for two cross-cutting concerns. Neither touches the ledger.
--
-- 1) notifications — an in-app queue (bell icon). Rows are created by app code
--    or by scheduled scans (e.g. license expiry §6.5, follow-ups §7.3). Actual
--    outbound WhatsApp/SMS/email SENDING is app-layer and DEFERRED:
--      • WhatsApp  → official WhatsApp Business Cloud API (template + opt-in)
--      • SMS       → a DLT-registered template via an Indian aggregator
--      • email     → transactional provider
--    Those integrations, plus a payment gateway (Razorpay/Paytm), Tally XML
--    export, global search, i18n rollout, and the customer/portal UI are
--    documented deferrals — intentionally NOT stubbed in the DB (they carry no
--    schema of their own until wired). This migration only stores the in-app
--    queue + a channel hint so a later worker can fan out.
--
-- 2) documents — metadata for files kept in a PRIVATE Supabase Storage bucket.
--    The bytes live in Storage; this table holds the pointer, tags, and the
--    polymorphic entity it attaches to, with RLS gating who can see it.
-- =====================================================================

create type notification_channel  as enum ('in_app','whatsapp','sms','email');
create type notification_status   as enum ('unread','read','archived');
create type notification_severity as enum ('info','success','warning','critical');

-- ---------------------------------------------------------------------
-- notifications — one row per (user, event). entity_* optionally deep-links to
-- the originating record. delivery_channel records the intended fan-out; the
-- in-app row exists regardless (sent_* filled by a later worker, not here).
-- ---------------------------------------------------------------------
create table notifications (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references users(id) on delete cascade,
  title            text not null,
  body             text,
  severity         notification_severity not null default 'info',
  category         text,                                -- 'license'|'target'|'complaint'|'follow_up'|...
  entity_type      text,                                -- deep-link target table
  entity_id        uuid,
  action_url       text,
  delivery_channel notification_channel not null default 'in_app',
  status           notification_status not null default 'unread',
  sent_external    boolean not null default false,       -- set true once a worker dispatches WA/SMS/email
  sent_at          timestamptz,
  read_at          timestamptz,
  created_by       uuid references users(id),
  created_at       timestamptz not null default now()
);
create index notifications_user_idx    on notifications (user_id, status, created_at desc);
create index notifications_unsent_idx  on notifications (delivery_channel) where not sent_external and delivery_channel <> 'in_app';
comment on table notifications is 'In-app notification queue; external WA/SMS/email dispatch is deferred app-layer (§7.8).';

-- ---------------------------------------------------------------------
-- documents — private Storage file metadata + polymorphic attachment + tags.
-- ---------------------------------------------------------------------
create table documents (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  storage_bucket text not null default 'documents',
  storage_path  text not null,                          -- object key inside the bucket
  mime_type     text,
  size_bytes    bigint,
  entity_type   text,                                   -- what it's attached to (invoice, supplier, license, ...)
  entity_id     uuid,
  tags          text[] not null default '{}',
  visibility    text not null default 'internal',       -- 'internal' | 'restricted'
  uploaded_by   uuid references users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz,
  unique (storage_bucket, storage_path)
);
create index documents_entity_idx on documents (entity_type, entity_id);
create index documents_tags_idx   on documents using gin (tags);
comment on table documents is 'Metadata for files in a private Storage bucket; bytes live in Storage, RLS gates the pointer. §7.8.';

create trigger documents_touch before update on documents for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------
-- notify(user, title, opts) -> notification id
-- Thin insert helper so scans/RPCs can enqueue a notification uniformly.
--   opts: { body?, severity?, category?, entity_type?, entity_id?, action_url?,
--           delivery_channel? }
-- ---------------------------------------------------------------------
create or replace function notify(p_user uuid, p_title text, p_opts jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    uuid;
  v_actor uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
begin
  if p_user is null then raise exception 'notify: user required'; end if;
  insert into notifications (user_id, title, body, severity, category,
      entity_type, entity_id, action_url, delivery_channel, created_by)
  values (p_user, p_title, p_opts->>'body',
          coalesce((p_opts->>'severity')::notification_severity,'info'),
          p_opts->>'category', p_opts->>'entity_type',
          nullif(p_opts->>'entity_id','')::uuid, p_opts->>'action_url',
          coalesce((p_opts->>'delivery_channel')::notification_channel,'in_app'),
          v_actor)
  returning id into v_id;
  return v_id;
end $$;
comment on function notify is 'Enqueue an in-app notification (external dispatch deferred). §7.8.';

-- ---------------------------------------------------------------------
-- mark_notifications_read(ids[] | null) -> int
-- Marks the caller's notifications read. null = all of the caller's unread.
-- Only ever touches the CALLER's own rows (Invariant-adjacent least privilege).
-- ---------------------------------------------------------------------
create or replace function mark_notifications_read(p_ids uuid[] default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := current_app_user();
  v_n  int;
begin
  update notifications
     set status = 'read', read_at = now()
   where user_id = v_me and status = 'unread'
     and (p_ids is null or id = any(p_ids));
  get diagnostics v_n = row_count;
  return v_n;
end $$;
comment on function mark_notifications_read is 'Mark the caller''s own notifications read (all unread if ids null). §7.8.';

-- ---------------------------------------------------------------------
-- RLS. A user sees only their OWN notifications (no cross-user leakage);
-- inserts/updates go through the definer RPCs. Documents are readable by any
-- authenticated user for 'internal' visibility, restricted ones only by the
-- uploader or accounting.manage; upload/edit needs a content permission.
-- ---------------------------------------------------------------------
alter table notifications enable row level security;
alter table documents     enable row level security;

create policy read_own_notifications on notifications for select to authenticated
  using (user_id = current_app_user());
-- notifications are written by notify()/mark_notifications_read (definer); no direct write policy.

create policy read_documents on documents for select to authenticated
  using (visibility = 'internal'
         or uploaded_by = current_app_user()
         or has_permission('accounting.manage'));
-- uploading/editing document metadata: anyone who can manage customers, purchases,
-- accounting, or config (the content-owning roles). Bytes are guarded separately
-- by Storage bucket policy (app-layer).
create policy manage_documents on documents for all to authenticated
  using (has_permission('accounting.manage') or has_permission('customer.manage')
         or has_permission('purchase.manage') or has_permission('config.edit'))
  with check (has_permission('accounting.manage') or has_permission('customer.manage')
         or has_permission('purchase.manage') or has_permission('config.edit'));
