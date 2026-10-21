-- =====================================================================
-- tests/0960_rls_tenant_isolation.sql
--
-- The two-principal proof 0128 was written for and never had: an internal
-- staff user and a customer-portal user, both `authenticated`, both able to
-- reach the API — and only one of them allowed to see the books.
--
-- Before 0128 every staff table carried `using (true)` for `authenticated`;
-- the only thing keeping a portal customer out was a separate deny-all
-- policy. This test asserts the replacement predicate instead:
--
--   * a portal principal resolves to a customer (portal_customer_id) and is
--     NOT staff (is_staff_principal), so every staff read returns zero rows
--   * a suspended staff user is not staff either (kill-switch at data layer)
--   * an active staff user still reads both tenants and both invoices
--   * a portal user still gets its own invoices through the portal RPCs
--     (isolation must not mean breakage)
--   * column-level privileges stop self-service `users.status` edits
--   * internal SECURITY DEFINER helpers are not callable by `authenticated`
--   * no permissive `using (true)` SELECT policy survives on the tables 0128
--     rewrote, and storage objects are not readable across buckets
--
-- Self-rolling-back: fixtures are created and discarded in one transaction.
-- Everything runs inside a single DO block, so a failed assertion aborts the
-- transaction and the PASS line is never printed — the script cannot report
-- success after a failure, with or without ON_ERROR_STOP.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/0960_rls_tenant_isolation.sql
-- Requires: all migrations + seed 0100/0110/0120 applied.
-- =====================================================================
begin;

create or replace function pg_temp.rls_ok(ok boolean, label text)
returns void language plpgsql as $$
begin
  if ok is not true then
    raise exception 'RLS FAIL: %', label;
  end if;
  raise notice 'OK  %', label;
end $$;

/** Runs a statement that must be refused by privilege checks. */
create or replace function pg_temp.rls_denied(stmt text, label text)
returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'RLS FAIL: % (statement was allowed: %)', label, stmt;
exception
  when insufficient_privilege then
    raise notice 'OK  % (42501)', label;
end $$;

do $rls$
declare
  v_c1 uuid; v_c2 uuid; v_s1 uuid; v_s2 uuid;
  v_branch uuid; v_fy uuid; v_admin_role uuid;
  v_staff  uuid := gen_random_uuid();
  v_susp   uuid := gen_random_uuid();
  v_portal uuid := gen_random_uuid();
  v_broad  int;
  v_names  text;
  v_tables text[] := array[
    'customers','customer_stores','customer_receipts','sales_orders',
    'customer_ledger','stock_ledger','company_settings','payment_methods',
    'roles','user_roles','users'];
begin
  ---------------------------------------------------------------------
  -- Fixtures: two tenants, one staff user, one suspended staff user, one
  -- portal customer. Runs as the migration owner, so RLS does not interfere.
  ---------------------------------------------------------------------
  select id into v_branch from branches where code = 'HO';
  select id into v_fy from financial_years where code = 'FY26-27';
  select id into v_admin_role from roles where code = 'admin';

  insert into customers (code, name, state_code, credit_limit, credit_days, status)
  values ('RLS-C1', 'RLS Alpha Traders', '33', 0, 0, 'active') returning id into v_c1;
  insert into customers (code, name, state_code, credit_limit, credit_days, status)
  values ('RLS-C2', 'RLS Beta Stores', '33', 0, 0, 'active') returning id into v_c2;

  insert into customer_stores (customer_id, code, name, state_code, is_primary, status, kind)
  values (v_c1, 'RLS-S1', 'Alpha Depot', '33', true, 'active', 'retail') returning id into v_s1;
  insert into customer_stores (customer_id, code, name, state_code, is_primary, status, kind)
  values (v_c2, 'RLS-S2', 'Beta Depot', '33', true, 'active', 'retail') returning id into v_s2;

  -- identities: the first auth user in a fresh database becomes bootstrap admin
  insert into auth.users (id, phone, raw_user_meta_data)
  values (v_staff, '918888800001', '{"full_name":"RLS Staff"}'::jsonb);
  insert into auth.users (id, phone, raw_user_meta_data)
  values (v_susp, '918888800002', '{"full_name":"RLS Suspended"}'::jsonb);
  insert into auth.users (id, phone, raw_user_meta_data)
  values (v_portal, '918888800003', '{"full_name":"RLS Portal"}'::jsonb);

  -- the suspended one is a real internal user, switched off
  update users set status = 'suspended', branch_id = v_branch where id = v_susp;
  insert into user_roles (user_id, role_id) values (v_susp, v_admin_role);

  -- portal link: contact_phone matches the auth phone (the path 0128 relies on)
  insert into customer_portal (customer_id, status, contact_phone)
  values (v_c1, 'active', '918888800003');

  -- two tenants' documents
  insert into invoices (invoice_no, fy_id, store_id, customer_id, branch_id, invoice_date,
                        place_of_supply, is_interstate, taxable_amount, cgst_amount, sgst_amount,
                        igst_amount, cess_amount, round_off, grand_total, status, amount_paid,
                        created_by, is_official)
  values ('RLS/1', v_fy, v_s1, v_c1, v_branch, date '2026-04-10', '33', false,
          1000, 90, 90, 0, 0, 0, 1180, 'posted', 0, v_staff, true);
  insert into invoices (invoice_no, fy_id, store_id, customer_id, branch_id, invoice_date,
                        place_of_supply, is_interstate, taxable_amount, cgst_amount, sgst_amount,
                        igst_amount, cess_amount, round_off, grand_total, status, amount_paid,
                        created_by, is_official)
  values ('RLS/2', v_fy, v_s2, v_c2, v_branch, date '2026-04-11', '33', false,
          2000, 180, 180, 0, 0, 0, 2360, 'posted', 0, v_staff, true);

  -- a staff-only storage object
  insert into storage.buckets (id, name, public) values ('company-assets', 'company-assets', false)
  on conflict (id) do nothing;
  insert into storage.objects (bucket_id, name, owner)
  values ('company-assets', 'company/logo.png', v_staff);

  ---------------------------------------------------------------------
  -- 1. PORTAL PRINCIPAL — authenticated, but a customer, not staff
  ---------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_portal, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  perform pg_temp.rls_ok(public.is_staff_principal() is false,
    'portal user is not a staff principal');
  perform pg_temp.rls_ok(public.is_portal_principal() is true,
    'portal user resolves as a portal principal');
  perform pg_temp.rls_ok(public.portal_customer_id() = v_c1,
    'portal user resolves to its own customer');

  perform pg_temp.rls_ok((select count(*) from public.customers) = 0,
    'portal user reads zero customers');
  perform pg_temp.rls_ok((select count(*) from public.customer_stores) = 0,
    'portal user reads zero stores via the staff policy');
  perform pg_temp.rls_ok((select count(*) from public.invoices) = 0,
    'portal user reads zero invoices via the staff policy');
  perform pg_temp.rls_ok((select count(*) from public.customer_receipts) = 0,
    'portal user reads zero receipts');
  perform pg_temp.rls_ok((select count(*) from public.customer_ledger) = 0,
    'portal user reads zero ledger rows');
  perform pg_temp.rls_ok((select count(*) from public.sales_orders) = 0,
    'portal user reads zero sales orders');
  perform pg_temp.rls_ok((select count(*) from public.stock_ledger) = 0,
    'portal user reads zero stock rows');
  perform pg_temp.rls_ok((select count(*) from public.users) = 0,
    'portal user reads zero staff users');
  perform pg_temp.rls_ok((select count(*) from public.roles) = 0,
    'portal user reads zero roles');
  perform pg_temp.rls_ok((select count(*) from public.user_roles) = 0,
    'portal user reads zero role assignments');
  perform pg_temp.rls_ok((select count(*) from public.company_settings) = 0,
    'portal user reads zero company settings rows');
  perform pg_temp.rls_ok((select count(*) from public.payment_methods) = 0,
    'portal user reads zero payment methods');
  perform pg_temp.rls_ok((select count(*) from public.documents) = 0,
    'portal user reads zero internal documents');
  perform pg_temp.rls_ok((select count(*) from storage.objects) = 0,
    'portal user reads zero storage objects');

  -- isolation must not break the portal's own read path
  perform pg_temp.rls_ok((select count(*) from public.portal_my_stores()) = 1,
    'portal RPC exposes exactly one store');
  perform pg_temp.rls_ok(
    (select count(*) from public.portal_my_invoices()) = 1
      and exists (select 1 from public.portal_my_invoices() where invoice_no = 'RLS/1'),
    'portal RPC exposes its own invoice only');
  perform pg_temp.rls_ok(
    (select customer_id from public.portal_my_profile()) = v_c1,
    'portal profile resolves to its own customer');

  -- internal definer helpers are not client surface
  perform pg_temp.rls_denied('select public.rebuild_account_balances(null)',
    'portal cannot call rebuild_account_balances');
  perform pg_temp.rls_denied($q$select public.next_number('invoice', current_date)$q$,
    'portal cannot call next_number');
  perform pg_temp.rls_denied($q$select public.write_audit('update','x','1','forged',null,null)$q$,
    'portal cannot call write_audit');

  ---------------------------------------------------------------------
  -- 2. SUSPENDED STAFF — a real internal row, but switched off
  ---------------------------------------------------------------------
  execute 'reset role';
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_susp, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  perform pg_temp.rls_ok(public.is_staff_principal() is false,
    'suspended user is not a staff principal even with the admin role');
  perform pg_temp.rls_ok((select count(*) from public.customers) = 0,
    'suspended user reads zero customers');
  perform pg_temp.rls_ok((select count(*) from public.invoices) = 0,
    'suspended user reads zero invoices');

  ---------------------------------------------------------------------
  -- 3. ACTIVE STAFF — still sees both tenants (no regression to staff UX)
  ---------------------------------------------------------------------
  execute 'reset role';
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  perform pg_temp.rls_ok(public.is_staff_principal() is true,
    'active internal user is a staff principal');
  perform pg_temp.rls_ok(public.is_portal_principal() is false,
    'active internal user is not a portal principal');

  perform pg_temp.rls_ok((select count(*) from public.customers where code like 'RLS-C%') = 2,
    'staff user reads both tenants');

  select string_agg(invoice_no, ',' order by invoice_no) into v_names
    from public.invoices where invoice_no like 'RLS/%';
  perform pg_temp.rls_ok(v_names = 'RLS/1,RLS/2',
    'staff user reads both invoices');

  perform pg_temp.rls_ok((select count(*) from public.users) >= 3,
    'staff user reads the user directory');
  perform pg_temp.rls_ok((select count(*) from storage.objects) = 1,
    'staff user reads the company-assets object');

  -- self-service edits: own columns only, never privileged ones
  execute format('update public.users set full_name = %L where id = %L',
                 'RLS Staff Renamed', v_staff);
  perform pg_temp.rls_ok(true, 'staff user may edit their own full_name');
  perform pg_temp.rls_denied(
    format('update public.users set status = %L where id = %L', 'suspended', v_staff),
    'staff user cannot self-escalate users.status');
  perform pg_temp.rls_denied(
    format('update public.users set token_version = 99 where id = %L', v_staff),
    'staff user cannot bump their own token_version');

  ---------------------------------------------------------------------
  -- 4. POLICY / GRANT SHAPE — the reason 0128 exists, asserted directly
  ---------------------------------------------------------------------
  execute 'reset role';

  select count(*) into v_broad
    from pg_policies
   where schemaname = 'public'
     and tablename = any (v_tables)
     and cmd = 'SELECT'
     and roles::text like '%authenticated%'
     and (qual is null or btrim(qual) = 'true');
  perform pg_temp.rls_ok(v_broad = 0,
    format('no permissive using(true) SELECT policy on staff tables (found %s)', v_broad));

  perform pg_temp.rls_ok(
    has_function_privilege('anon', 'public.is_staff_principal()', 'execute') is false,
    'anon cannot execute is_staff_principal');
  perform pg_temp.rls_ok(
    has_function_privilege('anon', 'public.is_portal_principal()', 'execute') is false,
    'anon cannot execute is_portal_principal');
  perform pg_temp.rls_ok(
    has_function_privilege('authenticated',
      'public.rebuild_account_balances(uuid)', 'execute') is false,
    'authenticated has no EXECUTE on rebuild_account_balances');
  perform pg_temp.rls_ok(
    has_function_privilege('authenticated',
      'public.write_audit(audit_action,text,text,text,jsonb,uuid)', 'execute') is false,
    'authenticated has no EXECUTE on write_audit');
  perform pg_temp.rls_ok(
    has_table_privilege('authenticated', 'public.users', 'update') is false,
    'authenticated has no table-wide UPDATE on users');

  perform pg_temp.rls_ok(
    (select count(*) from pg_attribute a
      where a.attrelid = 'public.users'::regclass
        and a.attname in ('full_name','phone','email')
        and has_column_privilege('authenticated', a.attrelid, a.attname, 'update')) = 3,
    'authenticated may update exactly the self-service columns');

  perform pg_temp.rls_ok(
    (select relrowsecurity from pg_class where oid = 'storage.objects'::regclass),
    'storage.objects has RLS enabled');

  raise notice '===== RLS TENANT ISOLATION PASSED =====';
end $rls$;

rollback;
