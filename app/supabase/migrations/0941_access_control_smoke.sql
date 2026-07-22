-- =====================================================================
-- 0941_access_control_smoke.sql   (Platform layer — consolidated smoke)
--
-- End-to-end proof of the platform/auth/access layer (migrations 0030-0035),
-- run as a SENTINEL-ROLLBACK test: the whole thing executes in one transaction
-- and ends with `raise exception 'SMOKE_OK...'` so NOTHING persists. A P0001
-- error whose message starts with SMOKE_OK is a PASS.
--
-- Proves, in order:
--   1. Invitation path: admin_create_user stages an invite; a new auth.users
--      insert fires handle_new_auth_user -> public.users.id = auth id, status
--      active, invited roles applied, invitation consumed.
--   2. Unknown-phone path: a signup with no invite -> pending_review, zero roles
--      (can log in, can do nothing).
--   3. Bootstrap: with users present, a new signup is NOT auto-admin.
--   4. Token hook: custom_access_token_hook injects roles/perms/status/is_admin
--      for the invited user; reflects overrides.
--   5. Precedence: role grant honored; deny override beats it; grant override
--      adds a capability; expiry is honored.
--   6. Kill-switch: suspend -> zero perms in has_permission AND in claims;
--      reactivate restores. Self-lockout refused.
--   7. Notifications: notify() respects a per-category mute (downgrade to
--      in_app); notify_by_permission fans out to permission holders; gated.
--   8. Read-models: refresh + report RPCs gated by report.view_all.
--   9. Identity integrity + audit trail intact throughout.
-- =====================================================================
do $smoke$
declare
  -- auth identities (simulate Supabase Auth ids)
  a_first uuid := gen_random_uuid();   -- pre-existing admin (so we are NOT bootstrapping)
  a_inv   uuid := gen_random_uuid();   -- invited manager (fires trigger)
  a_unk   uuid := gen_random_uuid();   -- unknown-phone signup
  inv_id  uuid;
  v_status text;
  v_roles  text;
  claims   jsonb;
  meta     jsonb;
  n_id     uuid;
  v_chan   notification_channel;
  v_cnt    int;
  r_admin  uuid := (select id from roles where code='admin');
  fy       uuid := (select id from financial_years limit 1);
  n_audit0 bigint;
begin
  -- ---- Establish a first admin directly (represents the bootstrap already
  --      having happened in a prior real run; we need an actor with roles.manage).
  insert into users(id, full_name, phone, status) values (a_first,'SMOKE First Admin','+910000000001','active');
  insert into user_roles(user_id, role_id) values (a_first, r_admin);
  select count(*) into n_audit0 from audit_log;

  -- Act as the first admin for all provisioning.
  perform set_config('request.jwt.claim.sub', a_first::text, true);

  -- ===== 1. INVITATION PATH =====
  inv_id := admin_create_user('+910000000002','SMOKE Manager', array['manager'], null, 'mgr@smoke.test');
  if not exists (select 1 from user_invitations where id=inv_id and status='pending') then
    raise exception 'FAIL 1a: invitation not staged';
  end if;

  -- Fire the real signup trigger via auth.users insert (rolled back with everything).
  insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at)
  values (a_inv, '00000000-0000-0000-0000-000000000000', 'authenticated','authenticated',
          '910000000002', now(), now());

  select status into v_status from users where id=a_inv;
  if v_status is distinct from 'active' then raise exception 'FAIL 1b: invited user status=% (want active)', v_status; end if;
  if not exists (select 1 from user_roles ur join roles r on r.id=ur.role_id
                 where ur.user_id=a_inv and r.code='manager') then
    raise exception 'FAIL 1c: invited role manager not applied';
  end if;
  if not exists (select 1 from user_invitations where id=inv_id and status='consumed') then
    raise exception 'FAIL 1d: invitation not consumed';
  end if;

  -- ===== 2. UNKNOWN-PHONE PATH =====
  insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at)
  values (a_unk, '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
          '919999999999', now(), now());
  select status into v_status from users where id=a_unk;
  if v_status is distinct from 'pending_review' then raise exception 'FAIL 2a: unknown status=% (want pending_review)', v_status; end if;
  if exists (select 1 from user_roles where user_id=a_unk) then raise exception 'FAIL 2b: unknown user has roles'; end if;

  -- ===== 3. BOOTSTRAP GUARD (not first => not admin) =====
  if exists (select 1 from user_roles ur join roles r on r.id=ur.role_id
             where ur.user_id=a_unk and r.code='admin') then
    raise exception 'FAIL 3: non-first signup became admin';
  end if;

  -- ===== 4 & 5. TOKEN HOOK + PRECEDENCE =====
  -- give the 'manager' role a concrete perm to test flow-through
  perform set_role_permission('manager','order.create','all');

  -- token claims for the invited manager
  claims := custom_access_token_hook(jsonb_build_object(
    'user_id', a_inv::text,
    'claims', jsonb_build_object('app_metadata', jsonb_build_object('provider','phone'))));
  meta := claims->'claims'->'app_metadata';
  if (meta->>'user_status') <> 'active' then raise exception 'FAIL 4a: claim status'; end if;
  if not (meta->'roles' ? 'manager') then raise exception 'FAIL 4b: claim roles'; end if;
  if not (meta->'perms' ? 'order.create') then raise exception 'FAIL 4c: role perm not in claims (%)', meta->'perms'; end if;
  if (meta->>'provider') <> 'phone' then raise exception 'FAIL 4d: existing app_metadata clobbered'; end if;

  -- deny override beats role grant (check both has_permission and claims)
  perform grant_user_permission(a_inv,'order.create','deny');
  perform set_config('request.jwt.claim.sub', a_inv::text, true);
  if has_permission('order.create') then raise exception 'FAIL 5a: deny override did not win'; end if;
  perform set_config('request.jwt.claim.sub', a_first::text, true);
  claims := custom_access_token_hook(jsonb_build_object('user_id', a_inv::text,
              'claims', jsonb_build_object('app_metadata','{}'::jsonb)));
  if (claims->'claims'->'app_metadata'->'perms') ? 'order.create' then
    raise exception 'FAIL 5b: deny not reflected in claims';
  end if;

  -- expired deny is ignored -> grant returns
  perform grant_user_permission(a_inv,'order.create','deny', now() - interval '1 hour');
  perform set_config('request.jwt.claim.sub', a_inv::text, true);
  if not has_permission('order.create') then raise exception 'FAIL 5c: expired deny not ignored'; end if;

  -- grant override adds a capability the role lacks
  perform set_config('request.jwt.claim.sub', a_first::text, true);
  perform grant_user_permission(a_inv,'report.view_all','grant');
  perform set_config('request.jwt.claim.sub', a_inv::text, true);
  if not has_permission('report.view_all') then raise exception 'FAIL 5d: grant override not honored'; end if;

  -- ===== 6. KILL-SWITCH =====
  perform set_config('request.jwt.claim.sub', a_first::text, true);
  perform admin_set_user_status(a_inv,'suspended','smoke kill');
  perform set_config('request.jwt.claim.sub', a_inv::text, true);
  if has_permission('order.create') or has_permission('report.view_all') then
    raise exception 'FAIL 6a: suspended user retains perms';
  end if;
  -- claims also show empty perms + suspended status
  perform set_config('request.jwt.claim.sub', a_first::text, true);
  claims := custom_access_token_hook(jsonb_build_object('user_id', a_inv::text,
              'claims', jsonb_build_object('app_metadata','{}'::jsonb)));
  meta := claims->'claims'->'app_metadata';
  if (meta->>'user_status') <> 'suspended' then raise exception 'FAIL 6b: claim status not suspended'; end if;
  if jsonb_array_length(meta->'perms') <> 0 then raise exception 'FAIL 6c: suspended claims have perms'; end if;
  -- reactivate restores
  perform admin_set_user_status(a_inv,'active');
  perform set_config('request.jwt.claim.sub', a_inv::text, true);
  if not has_permission('report.view_all') then raise exception 'FAIL 6d: reactivation did not restore'; end if;
  -- self-lockout refused
  perform set_config('request.jwt.claim.sub', a_first::text, true);
  begin
    perform admin_set_user_status(a_first,'suspended');
    raise exception 'FAIL 6e: self-lockout allowed';
  exception when others then
    if sqlerrm not like '%lock yourself out%' then raise; end if;
  end;

  -- ===== 7. NOTIFICATIONS =====
  -- invited manager mutes sms for 'approvals'
  perform set_config('request.jwt.claim.sub', a_inv::text, true);
  perform set_notification_preference('approvals','sms', false);
  perform set_config('request.jwt.claim.sub', a_first::text, true);
  n_id := notify(a_inv,'Approve me', jsonb_build_object('category','approvals','delivery_channel','sms'));
  select delivery_channel into v_chan from notifications where id=n_id;
  if v_chan <> 'in_app' then raise exception 'FAIL 7a: muted sms not downgraded (%)', v_chan; end if;
  -- broadcast to roles.manage holders reaches the first admin; gated for non-holders
  v_cnt := notify_by_permission('roles.manage','Platform check', jsonb_build_object('category','system'));
  if v_cnt < 1 then raise exception 'FAIL 7b: broadcast reached nobody'; end if;
  perform set_config('request.jwt.claim.sub', a_inv::text, true);  -- manager lacks roles.manage now
  begin
    perform notify_by_permission('roles.manage','sneaky','{}'::jsonb);
    raise exception 'FAIL 7c: unauthorized broadcast succeeded';
  exception when others then
    if sqlerrm not like '%not authorized to broadcast%' then raise; end if;
  end;

  -- ===== 8. READ-MODELS =====
  perform set_config('request.jwt.claim.sub', a_first::text, true);
  perform refresh_read_models();
  perform get_trial_balance(fy);
  perform get_ar_aging(null);
  -- unknown-review user (no perms) is refused
  perform set_config('request.jwt.claim.sub', a_unk::text, true);
  begin
    perform get_trial_balance(fy);
    raise exception 'FAIL 8: pending_review user read reports';
  exception when others then
    if sqlerrm not like '%not authorized%' then raise; end if;
  end;

  -- ===== 9. IDENTITY INTEGRITY + AUDIT =====
  perform assert_identity_integrity();  -- must not raise
  if (select count(*) from audit_log) <= n_audit0 then
    raise exception 'FAIL 9: no audit rows written for the mutation stream';
  end if;

  raise exception 'SMOKE_OK: 0941 access-control pass | invite->active+roles+consumed, unknown->pending_review/0-roles, no-bootstrap-2nd, claims reflect roles/perms/overrides/suspend, precedence(deny>grant, expiry, grant-add), kill-switch+restore+self-lockout-guard, notify mute-downgrade+gated-broadcast, read-models gated, identity+audit intact | audit_added=%',
    (select count(*) from audit_log) - n_audit0;
end $smoke$;
