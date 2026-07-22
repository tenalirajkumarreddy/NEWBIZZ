-- =====================================================================
-- 0030_auth_bridge.sql   (Platform layer — Auth)
--
-- THE IDENTITY LINCHPIN. current_app_user() / has_permission() / every RLS
-- policy / every RPC actor derive identity from the JWT `sub`, so
-- public.users.id MUST equal the Supabase Auth user id (auth.uid()).
--
-- This migration wires that guarantee at the source: an AFTER INSERT trigger
-- on auth.users that creates the matching public.users row keyed to NEW.id,
-- reconciling against an invitation staging table so an admin can pre-assign
-- roles/branch. Unknown phones land in pending_review with zero roles (can log
-- in, can do nothing) — no self-serve escalation.
--
-- Bootstrap: the very first auth user ever created becomes an active admin,
-- so the system has an operator without a chicken-and-egg on roles.manage.
--
-- Append-only. Idempotent where practical. No transaction rows touched.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) users: token_version (claim-cache invalidator) + status vocabulary
--    status is free text (no CHECK today); documented values:
--    active | suspended | pending_review | pending_activation | disabled
-- ---------------------------------------------------------------------
alter table public.users
  add column if not exists token_version integer not null default 0;

comment on column public.users.status is
  'active | suspended | pending_review | pending_activation | disabled. '
  'suspended/disabled => zero permissions regardless of roles (see has_permission).';
comment on column public.users.token_version is
  'Bumped on any status/role/override change to force JWT claim refresh (§2.5).';

-- ---------------------------------------------------------------------
-- 2) user_invitations — staging for admin-provisioned people.
--    admin_create_user writes here; the trigger consumes it at first login.
--    We DO NOT pre-create public.users rows (id must be the auth id).
-- ---------------------------------------------------------------------
create table if not exists public.user_invitations (
  id           uuid primary key default gen_random_uuid(),
  phone        text not null,
  full_name    text not null,
  email        text,
  branch_id    uuid references public.branches(id),
  role_codes   text[] not null default '{}',
  invited_by   uuid references public.users(id),
  status       text not null default 'pending',   -- pending | consumed | expired | revoked
  expires_at   timestamptz not null default (now() + interval '30 days'),
  consumed_at  timestamptz,
  consumed_by  uuid references public.users(id),
  created_at   timestamptz not null default now()
);

-- One live (pending) invitation per phone; consumed/revoked rows may accumulate.
create unique index if not exists user_invitations_phone_pending_key
  on public.user_invitations (phone)
  where status = 'pending';

create index if not exists user_invitations_phone_idx
  on public.user_invitations (phone);

alter table public.user_invitations enable row level security;

-- Only roles.manage may see/administer invitations; all writes go via RPCs.
drop policy if exists user_invitations_read on public.user_invitations;
create policy user_invitations_read on public.user_invitations
  for select to authenticated
  using (public.has_permission('roles.manage'));

-- ---------------------------------------------------------------------
-- 3) The bridge: handle_new_auth_user() — AFTER INSERT on auth.users.
--    Runs as definer (owner postgres) so it can write public.users and
--    bypass RLS. Keeps public.users.id = auth.users.id.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_phone   text := nullif(new.phone, '');
  v_email   text := nullif(new.email, '');
  v_inv     public.user_invitations%rowtype;
  v_role_id uuid;
  v_code    text;
  v_is_first boolean;
begin
  -- Is this the very first user in the system? (bootstrap admin)
  select not exists (select 1 from public.users) into v_is_first;

  -- Find a live invitation matching this phone (phone is the identity key).
  if v_phone is not null then
    select * into v_inv
      from public.user_invitations
     where phone = v_phone and status = 'pending' and expires_at > now()
     order by created_at desc
     limit 1;
  end if;

  -- Create the profile keyed to the AUTH id (linchpin).
  insert into public.users (id, full_name, phone, email, status, branch_id)
  values (
    new.id,
    coalesce(v_inv.full_name,
             nullif(new.raw_user_meta_data->>'full_name',''),
             coalesce(v_phone, v_email, 'New User')),
    v_phone,
    coalesce(v_inv.email, v_email),
    case
      when v_is_first then 'active'          -- bootstrap admin
      when v_inv.id is not null then 'active' -- invited & recognised
      else 'pending_review'                   -- unknown phone: no access yet
    end,
    v_inv.branch_id
  )
  on conflict (id) do nothing;

  -- Assign roles.
  if v_is_first then
    -- Bootstrap: first user is admin.
    select id into v_role_id from public.roles where code = 'admin';
    if v_role_id is not null then
      insert into public.user_roles (user_id, role_id)
      values (new.id, v_role_id) on conflict do nothing;
    end if;
  elsif v_inv.id is not null then
    -- Apply invited roles.
    foreach v_code in array v_inv.role_codes loop
      select id into v_role_id from public.roles where code = v_code;
      if v_role_id is not null then
        insert into public.user_roles (user_id, role_id)
        values (new.id, v_role_id) on conflict do nothing;
      end if;
    end loop;
    -- Mark invitation consumed.
    update public.user_invitations
       set status = 'consumed', consumed_at = now(), consumed_by = new.id
     where id = v_inv.id;
  end if;
  -- else: pending_review with zero roles — deliberately powerless.

  return new;
end $$;

-- Attach to auth.users (drop-and-create so re-applies cleanly).
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------
-- 4) admin_create_user — invite a person (writes staging, not public.users).
--    Gated by roles.manage. Upserts the pending invitation for a phone.
-- ---------------------------------------------------------------------
create or replace function public.admin_create_user(
  p_phone      text,
  p_full_name  text,
  p_role_codes text[] default '{}',
  p_branch_id  uuid default null,
  p_email      text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_actor uuid := public.current_app_user();
  v_id    uuid;
  v_code  text;
begin
  if not public.has_permission('roles.manage') then
    raise exception 'admin_create_user: not authorized (roles.manage required)';
  end if;
  if nullif(p_phone,'') is null then
    raise exception 'admin_create_user: phone is required';
  end if;
  if nullif(p_full_name,'') is null then
    raise exception 'admin_create_user: full_name is required';
  end if;

  -- Validate role codes up front.
  foreach v_code in array coalesce(p_role_codes,'{}') loop
    if not exists (select 1 from public.roles where code = v_code) then
      raise exception 'admin_create_user: unknown role_code %', v_code;
    end if;
  end loop;

  -- Retire any existing pending invite for this phone, then insert fresh.
  update public.user_invitations
     set status = 'revoked'
   where phone = p_phone and status = 'pending';

  insert into public.user_invitations
      (phone, full_name, email, branch_id, role_codes, invited_by)
  values (p_phone, p_full_name, nullif(p_email,''), p_branch_id,
          coalesce(p_role_codes,'{}'), v_actor)
  returning id into v_id;

  perform public.write_audit('insert', 'user_invitations', v_id::text,
    format('invited %s (%s) roles=%s', p_full_name, p_phone,
           array_to_string(coalesce(p_role_codes,'{}'), ',')),
    jsonb_build_object('phone', p_phone, 'roles', p_role_codes), v_actor);

  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- 5) admin_revoke_invitation — cancel a pending invite.
-- ---------------------------------------------------------------------
create or replace function public.admin_revoke_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_actor uuid := public.current_app_user();
begin
  if not public.has_permission('roles.manage') then
    raise exception 'admin_revoke_invitation: not authorized (roles.manage required)';
  end if;
  update public.user_invitations
     set status = 'revoked'
   where id = p_invitation_id and status = 'pending';
  perform public.write_audit('update', 'user_invitations', p_invitation_id::text,
    'invitation revoked', '{}'::jsonb, v_actor);
end $$;

-- ---------------------------------------------------------------------
-- 6) assert_identity_integrity — orphan/mismatch guard (defense in depth).
--    Returns rows describing any drift; empty result = healthy.
-- ---------------------------------------------------------------------
create or replace function public.assert_identity_integrity()
returns table (issue text, id uuid, detail text)
language sql
stable
security definer
set search_path to 'public'
as $$
  -- public.users with no matching auth.users row
  select 'orphan_profile'::text, u.id, u.phone
    from public.users u
    left join auth.users a on a.id = u.id
   where a.id is null
  union all
  -- auth.users with no matching profile (trigger failed / disabled)
  select 'missing_profile'::text, a.id, a.phone
    from auth.users a
    left join public.users u on u.id = a.id
   where u.id is null;
$$;

-- ---------------------------------------------------------------------
-- 7) Harden the new public functions (search_path + least privilege).
--    (handle_new_auth_user is invoked by the trigger, not by clients —
--     it must NOT be granted to authenticated.)
-- ---------------------------------------------------------------------
alter function public.admin_create_user(text, text, text[], uuid, text) set search_path = public;
alter function public.admin_revoke_invitation(uuid)                     set search_path = public;
alter function public.assert_identity_integrity()                       set search_path = public;

revoke execute on function public.handle_new_auth_user()                     from anon, public, authenticated;
revoke execute on function public.admin_create_user(text, text, text[], uuid, text) from anon, public;
revoke execute on function public.admin_revoke_invitation(uuid)              from anon, public;
revoke execute on function public.assert_identity_integrity()                from anon, public;

grant  execute on function public.admin_create_user(text, text, text[], uuid, text) to authenticated;
grant  execute on function public.admin_revoke_invitation(uuid)              to authenticated;
grant  execute on function public.assert_identity_integrity()                to authenticated;
