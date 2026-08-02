# WhatsApp Phase 1 — Implementation Plan

**Source:** `docs/superpowers/specs/2026-08-02-whatsapp-phase1-design.md` (committed a63b259)
**Strategy:** Strictly additive; dry-run first; transport vendored from wacrm@d94bea2 (MIT).
**Verification gate:** `npm run typecheck` must stay at baseline 83 (payroll/fleet pre-existing, 0 in new files).

## Steps

### 1. Vendor transport — `app/src/lib/whatsapp/`
Copy verbatim from `%LOCALAPPDATA%\Temp\opencode\wacrm\src\lib\whatsapp\` with MIT header + source commit preserved:
- `meta-api.ts`, `webhook-signature.ts`, `encryption.ts`, `phone-utils.ts`, `template-send-builder.ts`
- No edits. No NEWBIZZ imports. These are pure `fetch`/`crypto`.
- `.env.example`: add `META_APP_SECRET`, `ENCRYPTION_KEY`.

### 2. Schema — migration `app/supabase/migrations/0081_whatsapp_messaging.sql`
- `whatsapp_config` (single row id=1, encrypted token, dry_run default true, verify_token)
- `whatsapp_conversations` (customer_store_id + customer_id + phone E.164, unique(phone))
- `whatsapp_messages` (conversation_id, direction, msg_type, body, template_name/params, wamid, status)
- RLS on all three + `read_all_auth`-style select policies; writes via definer RPCs:
  - `whatsapp_upsert_conversation(p_phone, p_customer_store_id, p_customer_id)`
  - `whatsapp_insert_message(p_conversation_id, p_direction, ...)`
  - `whatsapp_update_message_status(p_wamid, p_status)`
  - `whatsapp_get_or_create_conversation_by_phone(p_phone)`
- Apply to live project `wmpxwpubfxpexybqnynz` via `supabase_apply_migration`.

### 3. Server data layer — `app/src/lib/data/whatsapp.ts`
- `getWhatsappConfig()` (decrypts token via encryption.ts), `listConversations()`, `listMessages(conversationId)`, `resolveConversationForStore(customerStoreId)`.
- Uses `createServiceClient()` (matches cron pattern) or anon-with-RLS.

### 4. Webhook receiver — `app/src/app/api/webhooks/whatsapp/route.ts`
- GET: verify handshake (`hub.challenge` echo).
- POST: verify `X-Hub-Signature-256` (fail-closed via `verifyMetaWebhookSignature`), parse `messages` + `statuses`, upsert conversation, persist inbound message, fire `notify()` to conversation's agent/owner, update outbound status. Fast 200.
- Dry-run aware: if `dry_run`, log and return 200 without persisting (or persist with flag).

### 5. Server actions — `app/src/lib/actions/whatsapp.ts`
- `saveWhatsappConfig()`, `setWhatsappDryRun()`, `sendWhatsAppMessage({conversationId|phone, text|template, params})`.
- `sendWhatsAppMessage` calls meta-api `sendTextMessage`/`sendTemplateMessage` (no-op with dry-run log when `dry_run`).

### 6. Dispatch worker — `app/src/lib/whatsapp/worker.ts` + cron route
- `drainWhatsappNotifications()`: read `notifications` where `delivery_channel='whatsapp' and not sent_external`, resolve recipient phone, check `pref_allows()`, send, set `sent_external`/`sent_at`, per-notification try/catch.
- Route `app/src/app/api/cron/whatsapp/route.ts` guarded by `CRON_SECRET` (mirrors existing `/api/cron/notifications`).

### 7. Verify + commit
- `npm run typecheck` == 83 baseline.
- Live-db spot checks (tables exist, RLS on).
- Commit per logical step with concise messages.

## Ordering rationale
1→2→3→4→5→6: transport first (no project deps), then schema (data depends on nothing), then data layer, then receiver, then actions, then worker (ties notifications + prefs + meta-api together). Each step compiles independently.
