-- =====================================================================
-- 0031_access_overrides.sql   (Platform layer — Fine-grained access)
--
-- Adds per-user permission overrides + an instant kill-switch, and rewrites
-- has_permission() with a clear precedence so admins get immediate,
-- unpredictable control without editing shared roles.
--
--   Precedence (evaluated in has_permission(p_code)):
--     1. user suspended/disabled          -> FALSE  (hard stop, ignores all)
--     2. explicit user override for code  -> use it (deny=FALSE, grant=TRUE),
--                                            honouring expires_at
--     3. admin role                       -> TRUE   (bypass)
--     4. any role grants code (scope<>'none') -> TRUE
--     5. else                             -> FALSE
--
-- STABLE SECURITY DEFINER, reads live tables => overrides and suspension take
-- effect on the very next RPC/RLS evaluation, independent of any cached JWT.
-- The JWT claims (0032) are only a UI-speed cache; the DB never trusts them.
--
-- Backward compatible: roles/role_permissions unchanged; scope='none' keeps its
-- role-level DENY meaning. Append-only. No transaction rows touched.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) user_permission_overrides — surgical per-user grant/deny (deny wins).
-- ---------------------------------------------------------------------
create table if not exists public.user_permission_overrides (
  user_id     uuid not null references public.users(id) on delete cascade,
  permission  text not null references public.permissions(code) on delete cascade,
  effect      text not null check (effect in ('grant','deny')),
  reason      text,
  granted_by  uuid references public.users(id),
  expires_at  timestamptz,                 -- null = permanent
  created_at  timestamptz not null default now(),
  primary key (user_id, permission)
);

create index if not exists upo_user_idx on public.user_permission_overrides (user_id);

alter table public.user_permission_overrides enable row level security;

-- Only roles.manage may read overrides directly; all writes go via RPCs.
drop policy if exists upo_read on public.user_permission_overrides;
create policy upo_read on public.user_permission_overrides
  for select to authenticated
  using (public.has_permission('roles.manage'));

-- ---------------------------------------------------------------------
-- 2) Rewrite has_permission() with the new precedence.
-- ---------------------------------------------------------------------
create or replace function public.has_permission(p_code text)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_uid    uuid := current_app_user();
  v_status text;
  v_effect text;
begin
  if v_uid is null then
    return false;
  end if;

  -- 1) kill-switch: suspended/disabled => zero permissions.
  select status into v_status from users where id = v_uid;
  if v_status is null or v_status in ('suspended','disabled') then
    return false;
  end if;

  -- 2) explicit per-user override wins over roles (deny beats grant).
  select effect into v_effect
    from user_permission_overrides
   where user_id = v_uid
     and permission = p_code
     and (expires_at is null or expires_at > now())
   limit 1;
  if v_effect is not null then
    return v_effect = 'grant';
  end if;

  -- 3) admin role bypasses all remaining checks.
  if exists (
    select 1 from user_roles ur
      join roles r on r.id = ur.role_id
     where ur.user_id = v_uid and r.code = 'admin'
  ) then
    return true;
  end if;

  -- 4) any role grants the code (scope='none' is a role-level deny).
  return exists (
    select 1 from user_roles ur
      join role_permissions rp on rp.role_id = ur.role_id
     where ur.user_id = v_uid
       and rp.permission = p_code
       and rp.scope <> 'none'
  );
end $function$;

-- ---------------------------------------------------------------------
-- 3) get_my_permissions() — caller's effective permission codes.
--    Used by the UI on load and by the token hook (0032) to fill claims.
--    Runs the same precedence as has_permission for each catalog code.
-- ---------------------------------------------------------------------
create or replace function public.get_my_permissions()
returns text[]
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(array_agg(p.code order by p.code), '{}')
    from permissions p
   where public.has_permission(p.code);
$function$;

-- ---------------------------------------------------------------------
-- 4) bump_token_version(user) — invalidate cached JWT claims.
--    Internal helper; called by every admin mutation below.
-- ---------------------------------------------------------------------
create or replace function public.bump_token_version(p_user uuid)
returns void
language sql
security definer
set search_path to 'public'
as $function$
  update users set token_version = token_version + 1, updated_at = now()
   where id = p_user;
$function$;

-- ---------------------------------------------------------------------
-- 5) admin_set_user_status(user, status, reason) — the kill-switch.
-- ---------------------------------------------------------------------
create or replace function public.admin_set_user_status(
  p_user uuid, p_status text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_actor uuid := current_app_user();
begin
  if not has_permission('roles.manage') then
    raise exception 'admin_set_user_status: not authorized (roles.manage required)';
  end if;
  if p_status not in ('active','suspended','pending_review','pending_activation','disabled') then
    raise exception 'admin_set_user_status: invalid status %', p_status;
  end if;
  if p_user = v_actor and p_status in ('suspended','disabled') then
    raise exception 'admin_set_user_status: refuse to lock yourself out';
  end if;

  update users set status = p_status, updated_at = now() where id = p_user;
  if not found then
    raise exception 'admin_set_user_status: no such user %', p_user;
  end if;

  perform bump_token_version(p_user);
  perform write_audit('update', 'users', p_user::text,
    format('status -> %s%s', p_status, coalesce(' ('||p_reason||')','')),
    jsonb_build_object('status', p_status, 'reason', p_reason), v_actor);
end $function$;

-- ---------------------------------------------------------------------
-- 6) grant_user_permission / revoke_user_permission — overrides.
-- ---------------------------------------------------------------------
create or replace function public.grant_user_permission(
  p_user uuid, p_code text, p_effect text default 'grant',
  p_expires_at timestamptz default null, p_reason text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_actor uuid := current_app_user();
begin
  if not has_permission('roles.manage') then
    raise exception 'grant_user_permission: not authorized (roles.manage required)';
  end if;
  if p_effect not in ('grant','deny') then
    raise exception 'grant_user_permission: effect must be grant|deny';
  end if;
  if not exists (select 1 from permissions where code = p_code) then
    raise exception 'grant_user_permission: unknown permission %', p_code;
  end if;

  insert into user_permission_overrides (user_id, permission, effect, reason, granted_by, expires_at)
  values (p_user, p_code, p_effect, p_reason, v_actor, p_expires_at)
  on conflict (user_id, permission) do update
     set effect = excluded.effect, reason = excluded.reason,
         granted_by = excluded.granted_by, expires_at = excluded.expires_at,
         created_at = now();

  perform bump_token_version(p_user);
  perform write_audit('update', 'user_permission_overrides', p_user::text,
    format('%s %s%s', p_effect, p_code, coalesce(' until '||p_expires_at::text,'')),
    jsonb_build_object('permission', p_code, 'effect', p_effect, 'expires_at', p_expires_at), v_actor);
end $function$;

create or replace function public.revoke_user_permission(p_user uuid, p_code text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_actor uuid := current_app_user();
begin
  if not has_permission('roles.manage') then
    raise exception 'revoke_user_permission: not authorized (roles.manage required)';
  end if;
  delete from user_permission_overrides where user_id = p_user and permission = p_code;
  perform bump_token_version(p_user);
  perform write_audit('update', 'user_permission_overrides', p_user::text,
    format('cleared override %s', p_code),
    jsonb_build_object('permission', p_code), v_actor);
end $function$;

-- ---------------------------------------------------------------------
-- 7) assign_role / unassign_role.
-- ---------------------------------------------------------------------
create or replace function public.assign_role(p_user uuid, p_role_code text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_actor uuid := current_app_user(); v_role uuid;
begin
  if not has_permission('roles.manage') then
    raise exception 'assign_role: not authorized (roles.manage required)';
  end if;
  select id into v_role from roles where code = p_role_code;
  if v_role is null then raise exception 'assign_role: unknown role %', p_role_code; end if;

  insert into user_roles (user_id, role_id) values (p_user, v_role)
  on conflict do nothing;

  perform bump_token_version(p_user);
  perform write_audit('update', 'user_roles', p_user::text,
    format('assigned role %s', p_role_code),
    jsonb_build_object('role', p_role_code), v_actor);
end $function$;

create or replace function public.unassign_role(p_user uuid, p_role_code text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_actor uuid := current_app_user(); v_role uuid;
begin
  if not has_permission('roles.manage') then
    raise exception 'unassign_role: not authorized (roles.manage required)';
  end if;
  select id into v_role from roles where code = p_role_code;
  if v_role is null then raise exception 'unassign_role: unknown role %', p_role_code; end if;

  delete from user_roles where user_id = p_user and role_id = v_role;

  perform bump_token_version(p_user);
  perform write_audit('update', 'user_roles', p_user::text,
    format('removed role %s', p_role_code),
    jsonb_build_object('role', p_role_code), v_actor);
end $function$;

-- ---------------------------------------------------------------------
-- 8) admin_create_role / set_role_permission — custom roles, live toggles.
-- ---------------------------------------------------------------------
create or replace function public.admin_create_role(p_code text, p_name text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_actor uuid := current_app_user(); v_id uuid;
begin
  if not has_permission('roles.manage') then
    raise exception 'admin_create_role: not authorized (roles.manage required)';
  end if;
  if p_code = 'admin' then
    raise exception 'admin_create_role: admin is reserved';
  end if;
  insert into roles (code, name) values (p_code, p_name)
  on conflict (code) do update set name = excluded.name
  returning id into v_id;

  perform write_audit('update', 'roles', v_id::text,
    format('role %s (%s)', p_code, p_name),
    jsonb_build_object('code', p_code, 'name', p_name), v_actor);
  return v_id;
end $function$;

create or replace function public.set_role_permission(
  p_role_code text, p_code text, p_scope text default 'all')
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_actor uuid := current_app_user(); v_role uuid;
begin
  if not has_permission('roles.manage') then
    raise exception 'set_role_permission: not authorized (roles.manage required)';
  end if;
  if p_role_code = 'admin' then
    raise exception 'set_role_permission: admin role is implicit (bypasses checks)';
  end if;
  if p_scope not in ('all','none') then
    raise exception 'set_role_permission: scope must be all|none';
  end if;
  select id into v_role from roles where code = p_role_code;
  if v_role is null then raise exception 'set_role_permission: unknown role %', p_role_code; end if;
  if not exists (select 1 from permissions where code = p_code) then
    raise exception 'set_role_permission: unknown permission %', p_code;
  end if;

  insert into role_permissions (role_id, permission, scope)
  values (v_role, p_code, p_scope)
  on conflict (role_id, permission) do update set scope = excluded.scope;

  perform write_audit('update', 'role_permissions', v_role::text,
    format('%s.%s = %s', p_role_code, p_code, p_scope),
    jsonb_build_object('role', p_role_code, 'permission', p_code, 'scope', p_scope), v_actor);
end $function$;

-- ---------------------------------------------------------------------
-- 9) get_my_token_version() — lightweight staleness probe for the client.
-- ---------------------------------------------------------------------
create or replace function public.get_my_token_version()
returns integer
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce((select token_version from users where id = current_app_user()), 0);
$function$;

-- ---------------------------------------------------------------------
-- 10) Harden the new/changed functions.
--     has_permission + get_my_permissions + current_app_user must remain
--     callable by authenticated (RLS/UI depend on them). bump_token_version
--     is internal-only (called by definer RPCs) -> revoke from clients.
-- ---------------------------------------------------------------------
alter function public.has_permission(text)                                   set search_path = public;
alter function public.get_my_permissions()                                   set search_path = public;
alter function public.get_my_token_version()                                 set search_path = public;
alter function public.bump_token_version(uuid)                               set search_path = public;
alter function public.admin_set_user_status(uuid, text, text)                set search_path = public;
alter function public.grant_user_permission(uuid, text, text, timestamptz, text) set search_path = public;
alter function public.revoke_user_permission(uuid, text)                     set search_path = public;
alter function public.assign_role(uuid, text)                                set search_path = public;
alter function public.unassign_role(uuid, text)                              set search_path = public;
alter function public.admin_create_role(text, text)                          set search_path = public;
alter function public.set_role_permission(text, text, text)                  set search_path = public;

revoke execute on function public.bump_token_version(uuid)                   from anon, public, authenticated;

revoke execute on function public.has_permission(text)                       from anon, public;
revoke execute on function public.get_my_permissions()                       from anon, public;
revoke execute on function public.get_my_token_version()                     from anon, public;
revoke execute on function public.admin_set_user_status(uuid, text, text)    from anon, public;
revoke execute on function public.grant_user_permission(uuid, text, text, timestamptz, text) from anon, public;
revoke execute on function public.revoke_user_permission(uuid, text)         from anon, public;
revoke execute on function public.assign_role(uuid, text)                    from anon, public;
revoke execute on function public.unassign_role(uuid, text)                  from anon, public;
revoke execute on function public.admin_create_role(text, text)              from anon, public;
revoke execute on function public.set_role_permission(text, text, text)      from anon, public;

grant execute on function public.has_permission(text)                        to authenticated;
grant execute on function public.get_my_permissions()                        to authenticated;
grant execute on function public.get_my_token_version()                      to authenticated;
grant execute on function public.admin_set_user_status(uuid, text, text)     to authenticated;
grant execute on function public.grant_user_permission(uuid, text, text, timestamptz, text) to authenticated;
grant execute on function public.revoke_user_permission(uuid, text)          to authenticated;
grant execute on function public.assign_role(uuid, text)                     to authenticated;
grant execute on function public.unassign_role(uuid, text)                   to authenticated;
grant execute on function public.admin_create_role(text, text)               to authenticated;
grant execute on function public.set_role_permission(text, text, text)       to authenticated;
