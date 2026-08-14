-- =====================================================================
-- 0096_secure_service_rpc.sql   Remove the anon EXECUTE surface
--
-- Root cause (found in the 08/2026 security audit): lib/supabase/service.ts —
-- the client used by the webhook receiver, CRON routes, the WhatsApp worker and
-- the intangles poller — was built on NEXT_PUBLIC_SUPABASE_ANON_KEY (the PUBLIC
-- key). To let that client work, the SECURITY DEFINER RPCs it calls
-- (whatsapp_*, notification_daily_scan, notify_perm) were granted to `anon`.
-- Because the anon key is public, ANY unauthenticated caller could invoke them
-- over /rest/v1/rpc/... directly: read WhatsApp config + verify_token, resolve
-- customer phone numbers, forge inbound messages / statuses, mark alerts sent,
-- or spam notifications.
--
-- This migration (paired with service.ts now using SUPABASE_SERVICE_ROLE_KEY):
--   * revokes anon + the PUBLIC default grant from that RPC set, and
--   * regrants explicitly to service_role (the server infra path) and
--     authenticated (signed-in app users), which is all they ever needed.
--
-- KEEP anon (external, keyless infra legitimately running under the anon key):
--   * insert_production_log / insert_production_logs_batch (ESP32 devices)
--   * invitation_for_phone                                (anonymous login screen)
-- =====================================================================

revoke execute on function whatsapp_get_config()                                  from public, anon;
revoke execute on function whatsapp_pending_notifications(integer)                from public, anon;
revoke execute on function whatsapp_resolve_recipient_phone(text, uuid)           from public, anon;
revoke execute on function whatsapp_mark_sent(uuid)                               from public, anon;
revoke execute on function whatsapp_pref_allows(uuid, text)                       from public, anon;
revoke execute on function whatsapp_insert_message(uuid, text, text, text, text, text, text, text, jsonb, text, text, uuid) from public, anon;
revoke execute on function whatsapp_update_message_status(text, text, text)       from public, anon;
revoke execute on function whatsapp_get_or_create_conversation(text, uuid, uuid)  from public, anon;
revoke execute on function notify_perm(text, text, jsonb)                         from public, anon;
revoke execute on function notification_daily_scan()                              from public, anon;

grant execute on function whatsapp_get_config()                                  to service_role, authenticated;
grant execute on function whatsapp_pending_notifications(integer)                to service_role, authenticated;
grant execute on function whatsapp_resolve_recipient_phone(text, uuid)           to service_role, authenticated;
grant execute on function whatsapp_mark_sent(uuid)                               to service_role, authenticated;
grant execute on function whatsapp_pref_allows(uuid, text)                       to service_role, authenticated;
grant execute on function whatsapp_insert_message(uuid, text, text, text, text, text, text, text, jsonb, text, text, uuid) to service_role, authenticated;
grant execute on function whatsapp_update_message_status(text, text, text)       to service_role, authenticated;
grant execute on function whatsapp_get_or_create_conversation(text, uuid, uuid)  to service_role, authenticated;
grant execute on function notify_perm(text, text, jsonb)                         to service_role, authenticated;
grant execute on function notification_daily_scan()                              to service_role, authenticated;