-- =====================================================================
-- 0033_notification_prefs.sql   (Platform layer — Notification preferences)
--
-- Adds per-user, per-category channel mute switches, a permission-based
-- recipient resolver (for approval/alert routing), and extends notify() to
-- honour preferences. Builds on 0027 (notifications table + notify()).
--
-- Rules:
--   * in_app is the durable queue + bell — it can NEVER be muted (always on).
--   * whatsapp/sms/email are opt-out per (category): if a user mutes a channel
--     for a category, notify() downgrades that delivery to in_app only.
--   * A missing preference row = enabled (sensible default).
--   * The DB never sends external itself; delivery_channel + sent_external stay
--     the durable queue a later dispatch worker drains.
-- Append-only. No transaction rows touched.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) notification_preferences — per-user, per-category, per-external-channel.
--    Only the three external channels are configurable; in_app is implicit.
-- ---------------------------------------------------------------------
create table if not exists public.notification_preferences (
  user_id    uuid not null references public.users(id) on delete cascade,
  category   text not null,                              -- free-form category tag used by notify()
  channel    notification_channel not null
             check (channel in ('whatsapp','sms','email')),
  enabled    boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, category, channel)
);

create index if not exists notif_prefs_user_idx on public.notification_preferences (user_id);

alter table public.notification_preferences enable row level security;

-- A user sees/edits only their own preferences; roles.manage may read all.
drop policy if exists notif_prefs_read on public.notification_preferences;
create policy notif_prefs_read on public.notification_preferences
  for select to authenticated
  using (user_id = public.current_app_user() or public.has_permission('roles.manage'));

-- ---------------------------------------------------------------------
-- 2) pref_allows(user, category, channel) — does this channel fire?
--    in_app: always true. external: honour the mute (default enabled).
-- ---------------------------------------------------------------------
create or replace function public.pref_allows(
  p_user uuid, p_category text, p_channel notification_channel)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select case
    when p_channel = 'in_app' then true
    else coalesce((
      select enabled from notification_preferences
       where user_id = p_user
         and channel = p_channel
         and category is not distinct from p_category
       limit 1), true)
  end;
$function$;

-- ---------------------------------------------------------------------
-- 3) set_notification_preference(category, channel, enabled) — self-service.
--    Users manage their OWN preferences; no elevated permission needed.
-- ---------------------------------------------------------------------
create or replace function public.set_notification_preference(
  p_category text, p_channel notification_channel, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_uid uuid := current_app_user();
begin
  if v_uid is null then raise exception 'set_notification_preference: not signed in'; end if;
  if p_channel = 'in_app' then
    raise exception 'set_notification_preference: in_app cannot be muted';
  end if;
  if p_category is null then raise exception 'set_notification_preference: category required'; end if;

  insert into notification_preferences (user_id, category, channel, enabled)
  values (v_uid, p_category, p_channel, p_enabled)
  on conflict (user_id, category, channel)
    do update set enabled = excluded.enabled, updated_at = now();
end $function$;

-- ---------------------------------------------------------------------
-- 4) Extend notify() to honour preferences.
--    Always writes the durable (in_app) row; if an external channel is
--    requested but muted for that (user, category), downgrade to in_app.
-- ---------------------------------------------------------------------
create or replace function public.notify(p_user uuid, p_title text, p_opts jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id       uuid;
  v_actor    uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
  v_category text := p_opts->>'category';
  v_channel  notification_channel := coalesce((p_opts->>'delivery_channel')::notification_channel, 'in_app');
begin
  if p_user is null then raise exception 'notify: user required'; end if;

  -- Respect the recipient's mute for external channels; in_app is never muted.
  if v_channel <> 'in_app' and not pref_allows(p_user, v_category, v_channel) then
    v_channel := 'in_app';
  end if;

  insert into notifications (user_id, title, body, severity, category,
      entity_type, entity_id, action_url, delivery_channel, created_by)
  values (p_user, p_title, p_opts->>'body',
          coalesce((p_opts->>'severity')::notification_severity,'info'),
          v_category, p_opts->>'entity_type',
          nullif(p_opts->>'entity_id','')::uuid, p_opts->>'action_url',
          v_channel, v_actor)
  returning id into v_id;
  return v_id;
end $function$;

-- ---------------------------------------------------------------------
-- 5) resolve_recipients(permission) — active users holding a permission.
--    Same precedence as has_permission() via perms_for_user(); excludes
--    suspended/disabled automatically. Used to route approvals/alerts.
-- ---------------------------------------------------------------------
create or replace function public.resolve_recipients(p_code text)
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $function$
  select u.id
    from users u
   where u.status = 'active'
     and p_code = any(public.perms_for_user(u.id));
$function$;

-- ---------------------------------------------------------------------
-- 6) notify_by_permission(permission, title, opts) — fan-out to everyone
--    who holds a permission (e.g. notify all approvers). Returns count sent.
--    Gated: only callers who themselves hold roles.manage OR the target
--    permission may broadcast (prevents notification spam by any user).
-- ---------------------------------------------------------------------
create or replace function public.notify_by_permission(
  p_code text, p_title text, p_opts jsonb default '{}'::jsonb)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_r uuid; v_n int := 0;
begin
  if not (has_permission('roles.manage') or has_permission(p_code)) then
    raise exception 'notify_by_permission: not authorized to broadcast %', p_code;
  end if;
  for v_r in select resolve_recipients(p_code) loop
    perform notify(v_r, p_title, p_opts);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $function$;

-- ---------------------------------------------------------------------
-- 7) Harden: search_path + client-callable grants.
--    pref_allows / resolve_recipients are internal helpers (definer-only);
--    set_notification_preference, notify, notify_by_permission are callable
--    by authenticated (each self-gates or is inherently self-scoped).
-- ---------------------------------------------------------------------
alter function public.pref_allows(uuid, text, notification_channel)         set search_path = public;
alter function public.set_notification_preference(text, notification_channel, boolean) set search_path = public;
alter function public.notify(uuid, text, jsonb)                             set search_path = public;
alter function public.resolve_recipients(text)                              set search_path = public;
alter function public.notify_by_permission(text, text, jsonb)               set search_path = public;

revoke execute on function public.pref_allows(uuid, text, notification_channel)         from anon, authenticated, public;
revoke execute on function public.resolve_recipients(text)                              from anon, authenticated, public;

revoke execute on function public.set_notification_preference(text, notification_channel, boolean) from anon, public;
revoke execute on function public.notify(uuid, text, jsonb)                             from anon, public;
revoke execute on function public.notify_by_permission(text, text, jsonb)               from anon, public;

grant  execute on function public.set_notification_preference(text, notification_channel, boolean) to authenticated;
grant  execute on function public.notify(uuid, text, jsonb)                             to authenticated;
grant  execute on function public.notify_by_permission(text, text, jsonb)               to authenticated;
