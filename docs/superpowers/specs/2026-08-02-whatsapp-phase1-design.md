# WhatsApp Native Integration — Phase 1 Design

**Date:** 2026-08-02
**Status:** Draft for review
**Owner:** NEWBIZZ platform
**Reference:** wacrm (ArnasDon/wacrm, MIT) as feature/transport reference; Master Build Plan §7.8 (WhatsApp via official Business Cloud API).

## 1. Purpose

Give NEWBIZZ a **native, first-party WhatsApp channel** so the business can reach and reply to customers on WhatsApp directly from the app — no separate CRM deployment, no third-party vendor lock-in. This is the §7.8 "WhatsApp (fixes audit 5.2)" sub-part: official WhatsApp Business Cloud API, approved templates, delivery tracking.

Phase 1 delivers the **messaging core** (config, send, receive, dispatch worker). Inbox UI, template management page, broadcasts, automations, and AI are separate later phases (2–5) built on this foundation.

## 2. Decisions locked

- **Build natively inside NEWBIZZ.** Do NOT deploy wacrm. Rationale: customer data already lives in `customers`/`customer_stores`; the `notifications` table already models `delivery_channel = 'whatsapp'` with `sent_external`/`sent_at` columns awaiting a worker. No second deployment, no contact sync, no auth duplication.
- **Vendor wacrm's MIT transport files** into `src/lib/whatsapp/` with license headers + source commit preserved. wacrm is pure `fetch`/`crypto` at the transport layer — no Next 16-specific APIs that block Next 14.2.35.
- **Conversation = customer_store.** Conversations key off `customer_store.phone` (E.164). This ties threads directly to the existing customer/order/invoice data model.
- **Dispatch via worker over the existing `notifications` table**, not a new ad-hoc outbox. `notify()` rows with `delivery_channel='whatsapp'` are drained by a worker that respects `pref_allows()` and sends via Meta.
- **Dry-run mode first.** Everything builds and tests without real Meta creds (mirrors wacrm's `WHATSAPP_TEMPLATES_DRY_RUN`).
- **Strictly additive.** No existing table/function is modified in Phase 1 except the final dispatch step (worker), which is guarded and reversible. Existing in-app notification behavior is unchanged.

## 3. Architecture

```
Meta Cloud API (Graph)
   │  outbound POST {PHONE_NUMBER_ID}/messages (Bearer token)
   │  inbound  POST → /api/webhooks/whatsapp (X-Hub-Signature-256)
   ▼
NEWBIZZ app
   ├─ src/lib/whatsapp/*         (vendored transport: meta-api, webhook-signature,
   │                              encryption, phone-utils, template-send-builder)
   ├─ src/lib/data/whatsapp.ts   (server-only readers/writers: config, conversations, messages)
   ├─ src/lib/actions/whatsapp.ts(server actions: send message, config save, template send)
   ├─ src/app/api/webhooks/whatsapp/route.ts  (receiver: verify → parse → persist → notify)
   └─ src/lib/whatsapp/worker.ts (dispatch worker: drain notifications → WhatsApp)
Supabase
   ├─ whatsapp_config         (single row, encrypted creds)
   ├─ whatsapp_conversations  (per customer_store/phone)
   ├─ whatsapp_messages       (direction, type, content, wamid, status)
   └─ notifications (existing) — delivery_channel='whatsapp', sent_external gate
```

### Data flow — outbound (worker-driven)

1. A value event (e.g. invoice posted) fires an existing `notify()`/`notify_perm()` trigger, OR app code enqueues a notification with `delivery_channel='whatsapp'`, recipient = customer phone, category = e.g. `invoice`.
2. Worker scans `notifications` where `delivery_channel='whatsapp'` and `not sent_external`.
3. Worker resolves the recipient's phone (customer_store → E.164) and checks `pref_allows(user, category, 'whatsapp')`.
4. Worker picks the Meta template for the category (config mapping) with params, calls `sendTemplateMessage` (or `sendTextMessage` inside the 24h window).
5. Worker records `whatsapp_message_id`, sets `sent_external=true`, `sent_at=now()`.
6. Failure → retry count / stays unsent; no crash of the event flow (send is best-effort side effect).

### Data flow — inbound (webhook)

1. Meta POSTs `{entry:[{changes:[{value:{messages:[...]}}]}]}` with `X-Hub-Signature-256`.
2. Route verifies signature (fail-closed), GET handshake for `hub.challenge`.
3. Normalize phone → E.164; find-or-create conversation against `customer_store`.
4. Persist `whatsapp_messages` (direction=inbound).
5. Fire `notify()` to the store's assigned agent / customer-owning user → in-app bell (existing behavior, unchanged).
6. Delivery `statuses` update the outbound message's status + counts.

## 4. Components

### 4.1 Vendored transport (`src/lib/whatsapp/`)
Copied verbatim from wacrm@<commit> with MIT headers:
- `meta-api.ts` — sendTextMessage, sendTemplateMessage, sendMediaMessage, sendInteractiveButtons/List, uploadResumableMedia, submit/edit/delete template, getMediaUrl, downloadMedia, registerPhoneNumber, subscribeWabaToApp.
- `webhook-signature.ts` — `verifyMetaWebhookSignature`.
- `encryption.ts` — AES-256-GCM encrypt/decrypt for stored tokens.
- `phone-utils.ts` — sanitize/validate E.164, phone variants, isRecipientNotAllowedError.
- `template-send-builder.ts` — build approved-template payloads with params.

### 4.2 Schema (migration `0081_whatsapp_messaging.sql`)
```sql
create table whatsapp_config (
  id smallint primary key default 1 check (id = 1),
  waba_id text, phone_number_id text,
  access_token_encrypted text,        -- AES-256-GCM (encryption.ts)
  meta_app_id text,
  verify_token text,                  -- webhook handshake
  default_template text,              -- fallback template name
  dry_run boolean not null default true,
  registered_at timestamptz,
  updated_at timestamptz,
  updated_by uuid references users(id)
);

create table whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  customer_store_id uuid references customer_stores(id) on delete set null,
  customer_id uuid references customers(id),
  phone text not null,                -- E.164
  status text not null default 'open',   -- open | pending | closed
  assigned_to uuid references users(id),
  last_message_at timestamptz,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  unique (phone)
);

create table whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references whatsapp_conversations(id) on delete cascade,
  direction text not null,            -- inbound | outbound
  msg_type text not null default 'text', -- text | template | image | ...
  body text,
  media_url text, media_mime text, media_filename text,
  template_name text, template_params jsonb,
  whatsapp_message_id text,           -- wamid.
  status text,                        -- sent | delivered | read | failed (outbound)
  sent_by uuid references users(id),  -- agent who sent (outbound)
  created_at timestamptz not null default now()
);
```
RLS: `read_all_auth`-style select for authenticated (mirrors `customers`), writes via definer RPCs/server actions. Indexes: `(conversation_id, created_at desc)`, `(phone)`.

### 4.3 Webhook receiver (`/api/webhooks/whatsapp`)
- `GET`: Meta verification — echo `hub.challenge` when `hub.verify_token` matches config.
- `POST`: verify `X-Hub-Signature-256` (fail-closed). Parse `messages` and `statuses`. Persist inbound, update outbound status, fire agent notifications. Return `200` fast.
- Runtime: Next.js route handler (Next 14 compatible). Guarded by `whatsapp_config.dry_run` for testing.

### 4.4 Server data + actions
- `data/whatsapp.ts`: `getWhatsappConfig()` (decrypt), `listConversations()`, `listMessages(conversationId)`, `upsertConversationByPhone()`.
- `actions/whatsapp.ts`: `saveWhatsappConfig()`, `sendWhatsAppMessage({conversationId|phone, type, text, template})`, `updateWhatsappConfigDryRun()`.

### 4.5 Dispatch worker
- `src/lib/whatsapp/worker.ts`: `drainWhatsappNotifications()` — one batch, idempotent, per-notification try/catch, respects `pref_allows()`.
- Triggered by a Vercel cron route `GET /api/cron/whatsapp` (CRON_SECRET guarded, same pattern as existing `/api/cron/notifications`).

## 5. Error handling

- Signature verification fail-closed: missing `META_APP_SECRET` or bad signature → 401, no processing.
- Outbound send errors are per-notification: caught, logged to the notification row (via `sent_external` stays false + `last_error` appended), never crash the worker loop.
- Phone not E.164 → mark notification as undeliverable (logged), don't retry.
- Template not configured for category → fall back to `default_template` or skip with a log.
- Dry-run mode: worker logs "would send" and marks sent without calling Meta.

## 6. Security

- Tokens encrypted at rest with AES-256-GCM (`encryption.ts`); `ENCRYPTION_KEY` env var (64 hex chars).
- Webhook HMAC verified; fail-closed.
- RLS on all new tables; conversation/message writes via definer RPCs or authed server actions only.
- `CRON_SECRET` Bearer guard on the worker route (mirrors existing cron).
- No PII logged; no secrets in code or env.example without placeholders.

## 7. Testing

- Dry-run mode end-to-end: enqueue → worker → assert Meta not called, row marked sent.
- Unit tests for vendored transport where wacrm ships them (vitest not installed in NEWBIZZ; add targeted tests only if cheap — otherwise rely on wacrm's own test suite as the upstream guarantee).
- Webhook route test: craft signed payload with a known secret, assert signature reject on tamper.
- Typecheck (`npm run typecheck`) must stay at the pre-existing baseline (83 errors in payroll/fleet; none in new files).

## 8. Out of scope (later phases)

- Inbox UI (Phase 2), template management page (Phase 3), broadcasts (Phase 3), automation engine (Phase 4), AI assistant (Phase 5), WhatsApp/portal payments (7.9).
- Editing existing `notify()` triggers is NOT done in this phase except the worker's read-only drain.

## 9. Acceptance criteria (Phase 1)

1. `whatsapp_config` row saved with encrypted token; dry-run on by default.
2. `/api/webhooks/whatsapp` verifies handshake + signature; rejects tampered payloads.
3. Worker drains `delivery_channel='whatsapp'` notifications respecting prefs; marks `sent_external` on success (or dry-run).
4. No existing table/function modified; typecheck baseline unchanged.
5. All new code additive; existing in-app notification behavior byte-identical.
