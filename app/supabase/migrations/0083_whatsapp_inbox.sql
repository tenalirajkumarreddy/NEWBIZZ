-- =====================================================================
-- 0083_whatsapp_inbox.sql   Phase 2 - inbox read-tracking
--
-- Adds a per-conversation last_read_at marker plus a SECURITY DEFINER
-- RPC to bump it when an agent opens a thread. Unread counts are then
-- computed in the data layer (inbound messages after last_read_at).
-- ---------------------------------------------------------------------
alter table whatsapp_conversations
  add column if not exists last_read_at timestamptz;

comment on column whatsapp_conversations.last_read_at is 'When the assigned agent last viewed this thread (inbox unread tracking).';

create or replace function whatsapp_mark_read(p_conversation_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update whatsapp_conversations
     set last_read_at = now()
   where id = p_conversation_id;
end $$;
comment on function whatsapp_mark_read is 'Record that an agent has read the thread (inbox unread tracking). Definer-only.';

revoke execute on function whatsapp_mark_read(uuid) from public, anon;
grant execute on function whatsapp_mark_read(uuid) to authenticated;
