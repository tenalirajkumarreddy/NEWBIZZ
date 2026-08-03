-- =====================================================================
-- 0085_whatsapp_webhook_test.sql   Webhook self-test support
--
-- The admin webhook self-test page POSTs signed payloads to
-- /api/webhooks/whatsapp. Inbound messages create a conversation, message
-- rows and notifications — real data in the inbox. This migration adds a
-- definer RPC to remove a test conversation (cascading its messages) plus
-- the notifications it fanned out, so tests are cleanable from the page.
-- =====================================================================

create or replace function whatsapp_delete_conversation(p_phone text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_conv uuid;
begin
  select id into v_conv from whatsapp_conversations where phone = p_phone limit 1;
  if v_conv is not null then
    -- notifications for inbound messages reference the conversation entity
    delete from notifications
     where entity_type = 'whatsapp_conversations'
       and entity_id = v_conv;
    -- whatsapp_messages cascade on conversation delete
    delete from whatsapp_conversations where id = v_conv;
  end if;
end $$;
comment on function whatsapp_delete_conversation is 'Delete a WhatsApp conversation by phone (cascades messages) plus its fan-out notifications. Definer-only, for test cleanup.';

-- New functions default to PUBLIC execute; this is a definer DELETE so it
-- must be locked down to authenticated (the admin self-test action) only.
revoke all on function whatsapp_delete_conversation(text) from public;
revoke all on function whatsapp_delete_conversation(text) from anon;
grant execute on function whatsapp_delete_conversation(text) to authenticated;
