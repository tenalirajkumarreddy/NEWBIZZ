-- =====================================================================
-- 0032_auth_token_hook.sql   (Platform layer — Custom Access Token Hook)
--
-- Injects app claims into every issued/refreshed JWT so the client and RLS
-- can read roles/permissions cheaply, WITHOUT another round-trip. Runs as
-- Supabase's Custom Access Token Hook (must be enabled in Auth settings — task 51).
--
--   claims.app_metadata.roles         = ['manager', ...]
--   claims.app_metadata.perms         = ['order.create', ...]   (post-override)
--   claims.app_metadata.branch_id     = uuid | null
--   claims.app_metadata.user_status   = 'active' | 'suspended' | ...
--   claims.app_metadata.token_version = int
--   claims.app_metadata.is_admin      = bool
--
-- THESE CLAIMS ARE A UI/RLS CACHE ONLY. The authoritative check is always
-- has_permission() inside definer RPCs, which reads live tables. A stale claim
-- can only make the UI briefly optimistic; every mutation still re-checks in DB.
--
-- Resilience: the hook NEVER blocks login. Any internal error is swallowed and
-- the original event is returned unchanged (user signs in with no app claims;
-- the client falls back to get_my_permissions()). Append-only. No txn rows.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) perms_for_user(user) — effective permission codes for ANY user.
--    Same precedence as has_permission(), but parameterised by user_id so
--    the token hook (which has no request.jwt.claim.sub yet) can call it.
--    Single source of truth: get_my_permissions() is refactored to reuse it.
-- ---------------------------------------------------------------------
create or replace function public.perms_for_user(p_user uuid)
returns text[]
language sql
stable
security definer
set search_path to 'public'
as $function$
  select case
    -- kill-switch: suspended/disabled/unknown => no permissions.
    when p_user is null
      or (select status from users where id = p_user) is null
      or (select status from users where id = p_user) in ('suspended','disabled')
    then '{}'::text[]
    else coalesce((
      select array_agg(p.code order by p.code)
        from permissions p
       where
         -- 2) explicit override wins (deny beats grant), honouring expiry.
         case
           when exists (
             select 1 from user_permission_overrides o
              where o.user_id = p_user and o.permission = p.code
                and (o.expires_at is null or o.expires_at > now()))
           then (
             select o.effect = 'grant' from user_permission_overrides o
              where o.user_id = p_user and o.permission = p.code
                and (o.expires_at is null or o.expires_at > now())
              limit 1)
           -- 3) admin role bypasses all remaining checks.
           when exists (
             select 1 from user_roles ur join roles r on r.id = ur.role_id
              where ur.user_id = p_user and r.code = 'admin')
           then true
           -- 4) any role grants the code (scope='none' is a role-level deny).
           else exists (
             select 1 from user_roles ur
               join role_permissions rp on rp.role_id = ur.role_id
              where ur.user_id = p_user and rp.permission = p.code
                and rp.scope <> 'none')
         end
    ), '{}'::text[])
  end;
$function$;

-- Refactor get_my_permissions() to delegate — one precedence implementation.
create or replace function public.get_my_permissions()
returns text[]
language sql
stable
security definer
set search_path to 'public'
as $function$
  select public.perms_for_user(current_app_user());
$function$;

-- ---------------------------------------------------------------------
-- 2) roles_for_user(user) — role codes (for the roles claim + is_admin).
-- ---------------------------------------------------------------------
create or replace function public.roles_for_user(p_user uuid)
returns text[]
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(array_agg(r.code order by r.code), '{}'::text[])
    from user_roles ur join roles r on r.id = ur.role_id
   where ur.user_id = p_user;
$function$;

-- ---------------------------------------------------------------------
-- 3) The hook itself. Signature is fixed by Supabase: (event jsonb)->jsonb.
--    event = { user_id, claims, authentication_method }.
--    We merge our claims into event.claims.app_metadata and return event.
-- ---------------------------------------------------------------------
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_user   uuid;
  v_status text;
  v_branch uuid;
  v_roles  text[];
  v_perms  text[];
  v_admin  boolean;
  v_tv     int;
  v_app    jsonb;
begin
  v_user := (event->>'user_id')::uuid;

  select status, branch_id, coalesce(token_version,0)
    into v_status, v_branch, v_tv
    from users where id = v_user;

  -- Unknown profile (trigger not yet run / edge case): mint a bare token so
  -- login still succeeds; the client will show a 'pending' state.
  if v_status is null then
    v_app := coalesce(event->'claims'->'app_metadata','{}'::jsonb)
             || jsonb_build_object('user_status','unknown','token_version',0,'is_admin',false);
    return jsonb_set(event, '{claims,app_metadata}', v_app, true);
  end if;

  v_roles := roles_for_user(v_user);
  v_admin := 'admin' = any(v_roles);
  -- Suspended/disabled users carry an EMPTY perms array (kill-switch visible in UI too).
  v_perms := perms_for_user(v_user);

  v_app := coalesce(event->'claims'->'app_metadata','{}'::jsonb) || jsonb_build_object(
    'roles',         to_jsonb(v_roles),
    'perms',         to_jsonb(v_perms),
    'branch_id',     to_jsonb(v_branch),
    'user_status',   v_status,
    'token_version', v_tv,
    'is_admin',      v_admin
  );

  return jsonb_set(event, '{claims,app_metadata}', v_app, true);
exception
  when others then
    -- Never block login on a hook error: return the event untouched.
    return event;
end $function$;

-- ---------------------------------------------------------------------
-- 4) Grants. The hook is executed by supabase_auth_admin (the GoTrue role).
--    It needs EXECUTE on the hook, and the SECURITY DEFINER owner (postgres)
--    already has table access. We also grant the auth admin USAGE + the read
--    it needs on our tables in case the definer chain is bypassed by Supabase.
-- ---------------------------------------------------------------------
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;

-- Keep the hook OUT of reach of app clients (it is infrastructure, not an API).
revoke execute on function public.custom_access_token_hook(jsonb) from anon, authenticated, public;

-- Let the auth admin read the tables the hook (and its callees) touch, so the
-- hook works whether Supabase runs it as definer-owner or as supabase_auth_admin.
grant select on public.users, public.user_roles, public.roles,
                 public.role_permissions, public.permissions,
                 public.user_permission_overrides
  to supabase_auth_admin;

-- ---------------------------------------------------------------------
-- 5) Harden the helper functions (search_path + client-callable grants).
--    perms_for_user / roles_for_user are internal (used by the hook and by
--    get_my_permissions) -> not exposed to clients. get_my_permissions stays
--    callable by authenticated.
-- ---------------------------------------------------------------------
alter function public.perms_for_user(uuid)  set search_path = public;
alter function public.roles_for_user(uuid)  set search_path = public;
alter function public.get_my_permissions()  set search_path = public;

revoke execute on function public.perms_for_user(uuid) from anon, authenticated, public;
revoke execute on function public.roles_for_user(uuid) from anon, authenticated, public;
revoke execute on function public.get_my_permissions() from anon, public;
grant  execute on function public.get_my_permissions() to authenticated;
-- perms_for_user/roles_for_user must remain callable by the hook's role.
grant  execute on function public.perms_for_user(uuid) to supabase_auth_admin;
grant  execute on function public.roles_for_user(uuid) to supabase_auth_admin;
