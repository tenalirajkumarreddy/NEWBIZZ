-- =====================================================================
-- 0086_whatsapp_ops.sql   Offline polish for the WhatsApp pipeline
--
-- While Meta credentials are pending, these are fully testable in
-- dry-run:
--
-- 1) whatsapp_message_templates - a lightweight LOCAL catalogue of the
--    approved message templates the inbox composer offers and the worker
--    uses. Real approval still happens in Meta; this just lets an agent
--    pick a template by name and slot in body variables without leaving
--    the inbox. RLS: authenticated read (agents must see templates), writes
--    via definer RPCs gated on 'admin'.
--
-- 2) whatsapp_worker_stats() + whatsapp_recent_notifications() - definer
--    reads for the worker dashboard. Notifications RLS is own-only, so the
--    admin dashboard needs definer helpers to count pending/sent and list
--    recent whatsapp-channel rows (mirrors whatsapp_pending_notifications).
--
-- 3) whatsapp_enqueue_test_notify() - definer helper that fires a
--    whatsapp-channel notify() addressed to an existing conversation's
--    phone, so the Settings page can enqueue a real test notification and
--    then drain it with the worker (dry-run) to eyeball the full path.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Template catalogue.
-- ---------------------------------------------------------------------
create table if not exists whatsapp_message_templates (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id),
  name          text not null,
  category      text not null default 'Utility',       -- Marketing | Utility | Authentication
  language      text not null default 'en_US',
  body_text     text not null,                          -- may contain {{1}} … {{N}}
  status        text not null default 'APPROVED',       -- filtered to approved for the picker
  created_at    timestamptz not null default now(),
  unique (name, language)
);
comment on table whatsapp_message_templates is 'Local catalogue of approved WhatsApp message templates (name → body with {{N}} variables). Meta approval happens out-of-band.';

alter table whatsapp_message_templates enable row level security;
create policy read_all_auth on whatsapp_message_templates for select to authenticated using (true);
-- writes only via definer RPCs below

create or replace function whatsapp_template_list(p_status text default null)
returns setof whatsapp_message_templates
language sql stable security definer set search_path = public as $$
  select * from whatsapp_message_templates
   where p_status is null or status = p_status
   order by name asc;
$$;
comment on function whatsapp_template_list is 'List local message templates (definer read). Definer-only.';

create or replace function whatsapp_template_save(
  p_name text,
  p_body_text text,
  p_category text default 'Utility',
  p_language text default 'en_US',
  p_status text default 'APPROVED'
) returns whatsapp_message_templates
language plpgsql security definer set search_path = public as $$
declare v_row whatsapp_message_templates;
begin
  if not public.has_permission('admin') then
    raise exception 'admin permission required';
  end if;
  if nullif(p_name, '') is null or nullif(p_body_text, '') is null then
    raise exception 'name and body_text are required';
  end if;
  insert into whatsapp_message_templates (user_id, name, category, language, body_text, status)
  values (public.current_app_user(), p_name, p_category, p_language, p_body_text, p_status)
  on conflict (name, language) do update set
    body_text = excluded.body_text,
    category  = excluded.category,
    status    = excluded.status
  returning * into v_row;
  return v_row;
end $$;
comment on function whatsapp_template_save is 'Upsert a local message template (admin, definer).';

create or replace function whatsapp_template_delete(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('admin') then
    raise exception 'admin permission required';
  end if;
  delete from whatsapp_message_templates where id = p_id;
end $$;
comment on function whatsapp_template_delete is 'Delete a local message template (admin, definer).';

revoke all on function whatsapp_template_list(text) from public, anon;
revoke all on function whatsapp_template_save(text, text, text, text, text) from public, anon;
revoke all on function whatsapp_template_delete(uuid) from public, anon;
grant execute on function whatsapp_template_list(text) to authenticated;
grant execute on function whatsapp_template_save(text, text, text, text, text) to authenticated;
grant execute on function whatsapp_template_delete(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 2) Worker dashboard reader helpers.
-- ---------------------------------------------------------------------
create or replace function whatsapp_worker_stats()
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'pending',   (select count(*) from notifications
                   where delivery_channel = 'whatsapp' and not sent_external),
    'sent',      (select count(*) from notifications
                   where delivery_channel = 'whatsapp' and sent_external),
    'open_conversations', (select count(*) from whatsapp_conversations where status = 'open'),
    'templates', (select count(*) from whatsapp_message_templates where status = 'APPROVED')
  );
$$;
comment on function whatsapp_worker_stats is 'Counts for the WhatsApp worker dashboard. Definer-only.';

create or replace function whatsapp_recent_notifications(p_limit int default 15)
returns setof notifications
language sql stable security definer set search_path = public as $$
  select *
    from notifications
   where delivery_channel = 'whatsapp'
   order by created_at desc
   limit p_limit;
$$;
comment on function whatsapp_recent_notifications is 'Most recent whatsapp-channel notifications. Definer-only.';

revoke all on function whatsapp_worker_stats() from public, anon;
revoke all on function whatsapp_recent_notifications(int) from public, anon;
grant execute on function whatsapp_worker_stats() to authenticated;
grant execute on function whatsapp_recent_notifications(int) to authenticated;

-- ---------------------------------------------------------------------
-- 3) Test-notification enqueuer.
-- ---------------------------------------------------------------------
create or replace function whatsapp_enqueue_test_notify(
  p_phone text,
  p_title text,
  p_body text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_conv uuid;
  v_phone text := regexp_replace(p_phone, '\D', '', 'g');
begin
  if not public.has_permission('admin') then
    raise exception 'admin permission required';
  end if;
  select id into v_conv from whatsapp_conversations where phone = v_phone limit 1;
  if v_conv is null then
    insert into whatsapp_conversations (phone, status)
    values (v_phone, 'open') returning id into v_conv;
  end if;
  perform public.notify(
    public.current_app_user(),
    coalesce(nullif(p_title, ''), 'WhatsApp test notification'),
    jsonb_build_object(
      'body', p_body,
      'severity', 'info',
      'category', 'test',
      'delivery_channel', 'whatsapp'::notification_channel,
      'entity_type', 'whatsapp_conversations',
      'entity_id', v_conv::text));
  return v_conv;
end $$;
comment on function whatsapp_enqueue_test_notify is 'Enqueue a whatsapp-channel test notification addressed to a conversation phone (admin, definer). Returns the conversation id.';

revoke all on function whatsapp_enqueue_test_notify(text, text, text) from public, anon;
grant execute on function whatsapp_enqueue_test_notify(text, text, text) to authenticated;