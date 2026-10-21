-- =====================================================================
-- tests/0965_opening_stock_authorization.sql
--
-- 0037 gated the opening-stock batch on settings.manage alone. 0056 keeps that
-- gate and adds an admin fallback for the nested-SECURITY-DEFINER chain. The
-- fallback is the risky half: if it is written naively it also fires for a
-- switched-off admin or an explicit per-user deny, turning a documented
-- kill-switch into decoration.
--
-- This proves, as `authenticated` principals:
--   * a manager (settings.manage via 0055) may post an opening batch
--   * an active admin may post it through the fallback
--   * a staff user with no permission may not
--   * a SUSPENDED admin may not — status kill-switch survives the fallback
--   * an admin with an explicit `deny` override may not — overrides rank first
--   * omitting p_as_of still posts, dated today (production's null default
--     would raise 'entry_date is required' on the first line)
--   * anon cannot call it
--
-- Self-rolling-back: fixtures are created and discarded in one transaction, and
-- every assertion raises on failure, so the PASS line cannot print after one.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/0965_opening_stock_authorization.sql
-- Requires: all migrations + seed 0100/0110/0120 applied.
-- =====================================================================
begin;

create or replace function pg_temp.os_ok(ok boolean, label text)
returns void language plpgsql as $$
begin
  if ok is not true then
    raise exception 'OPENING STOCK FAIL: %', label;
  end if;
  raise notice 'OK  %', label;
end $$;

/** Runs a statement that must raise (any failure counts as refused). */
create or replace function pg_temp.os_refused(stmt text, label text)
returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'OPENING STOCK FAIL: % (statement was allowed)', label;
exception
  when others then
    if sqlerrm like 'OPENING STOCK FAIL%' then
      raise;
    end if;
    raise notice 'OK  % (%)', label, sqlerrm;
end $$;

/** Posts one opening line as the current JWT subject. */
create or replace function pg_temp.os_post(p_item uuid, p_branch uuid, p_as_of date)
returns integer language plpgsql as $$
begin
  return public.receive_opening_stock_batch(
    jsonb_build_array(jsonb_build_object(
      'item_id', p_item, 'branch_id', p_branch, 'qty', 5, 'unit_cost', 100)),
    p_as_of);
end $$;

do $os$
declare
  v_item uuid; v_branch uuid;
  v_admin uuid := gen_random_uuid();
  v_mgr   uuid := gen_random_uuid();
  v_plain uuid := gen_random_uuid();
  v_susp  uuid := gen_random_uuid();
  v_deny  uuid := gen_random_uuid();
  v_admin_role uuid;
  v_mgr_role   uuid;
  v_entries int;
begin
  select id into v_item from items where sku = '500ML-CASE';
  select id into v_branch from branches where code = 'HO';
  select id into v_admin_role from roles where code = 'admin';
  select id into v_mgr_role   from roles where code = 'manager';

  perform pg_temp.os_ok(v_item is not null and v_branch is not null,
    'fixtures: seeded item and head office branch exist');

  ---------------------------------------------------------------------
  -- Fixtures. The first auth user in a fresh database is bootstrapped as an
  -- active admin (0030); everyone else is created explicitly.
  ---------------------------------------------------------------------
  insert into auth.users (id, phone, raw_user_meta_data)
  values (v_admin, '919999900001', '{"full_name":"OS Admin"}'::jsonb);
  perform pg_temp.os_ok((select count(*) from user_roles where user_id = v_admin
                          and role_id = v_admin_role) = 1,
    'fixtures: first auth user became the admin');

  insert into auth.users (id, phone, raw_user_meta_data)
  values (v_mgr, '919999900002', '{"full_name":"OS Manager"}'::jsonb);
  insert into auth.users (id, phone, raw_user_meta_data)
  values (v_plain, '919999900003', '{"full_name":"OS Staff"}'::jsonb);
  insert into auth.users (id, phone, raw_user_meta_data)
  values (v_susp, '919999900004', '{"full_name":"OS Suspended"}'::jsonb);
  insert into auth.users (id, phone, raw_user_meta_data)
  values (v_deny, '919999900005', '{"full_name":"OS Denied"}'::jsonb);

  update users set status = 'active' where id in (v_mgr, v_plain);
  update users set status = 'suspended' where id = v_susp;
  update users set status = 'active' where id = v_deny;

  insert into user_roles (user_id, role_id) values (v_mgr, v_mgr_role);
  insert into user_roles (user_id, role_id) values (v_susp, v_admin_role);
  insert into user_roles (user_id, role_id) values (v_deny, v_admin_role);
  insert into user_permission_overrides (user_id, permission, effect)
  values (v_deny, 'settings.manage', 'deny');

  ---------------------------------------------------------------------
  -- 1. No permission at all
  ---------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_plain, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform pg_temp.os_refused(
    format('select pg_temp.os_post(%L, %L, date %L)', v_item, v_branch, '2026-04-01'),
    'staff with no permission cannot load opening stock');
  execute 'reset role';

  ---------------------------------------------------------------------
  -- 2. Manager — settings.manage came from 0055, no admin involved
  ---------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_mgr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform pg_temp.os_ok(
    pg_temp.os_post(v_item, v_branch, date '2026-04-01') = 1,
    'manager with settings.manage posts a batch');
  execute 'reset role';

  ---------------------------------------------------------------------
  -- 3. Active admin — fallback path
  ---------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform pg_temp.os_ok(
    pg_temp.os_post(v_item, v_branch, date '2026-04-01') = 1,
    'active admin posts a batch');
  execute 'reset role';

  ---------------------------------------------------------------------
  -- 4. Kill-switches the fallback must not swallow
  ---------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_susp, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform pg_temp.os_refused(
    format('select pg_temp.os_post(%L, %L, date %L)', v_item, v_branch, '2026-04-01'),
    'suspended admin cannot load opening stock');
  execute 'reset role';

  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_deny, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform pg_temp.os_refused(
    format('select pg_temp.os_post(%L, %L, date %L)', v_item, v_branch, '2026-04-01'),
    'explicit deny override beats the admin fallback');
  execute 'reset role';

  ---------------------------------------------------------------------
  -- 5. Blank date still posts, dated today
  ---------------------------------------------------------------------
  select count(*) into v_entries from journal_entries where source = 'opening';
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform pg_temp.os_ok(
    pg_temp.os_post(v_item, v_branch, null) = 1,
    'omitted p_as_of posts instead of raising entry_date is required');
  execute 'reset role';

  perform pg_temp.os_ok(
    (select count(*) from journal_entries where source = 'opening') = v_entries + 1,
    'the blank-date load wrote one journal entry');
  perform pg_temp.os_ok(
    (select max(entry_date) from journal_entries where source = 'opening') = current_date,
    'and dated it today');

  ---------------------------------------------------------------------
  -- 6. Client surface
  ---------------------------------------------------------------------
  perform pg_temp.os_ok(
    has_function_privilege('anon',
      'public.receive_opening_stock_batch(jsonb,date)', 'execute') is false,
    'anon cannot execute the batch RPC');

  raise notice '===== OPENING STOCK AUTHORIZATION PASSED =====';
end $os$;

rollback;
