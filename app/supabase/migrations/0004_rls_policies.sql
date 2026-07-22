-- =====================================================================
-- 0004_rls_policies.sql  ·  Row-Level Security + permission helper
-- Invariant 3: the app NEVER writes money/stock tables directly. RLS makes
-- that structural — journal_entries / journal_lines / account_balances are
-- read-only to end users; only security-definer RPCs (running as owner) write.
-- Reference/config tables are readable by any authenticated user and
-- writable only with the matching permission via has_permission().
-- =====================================================================

-- ---------------------------------------------------------------------
-- current_app_user() -> uuid   (the authenticated user's id, or null)
-- ---------------------------------------------------------------------
create or replace function current_app_user()
returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

-- ---------------------------------------------------------------------
-- has_permission(code)  — true if the current user holds it via any role.
-- 'admin' role short-circuits to true. Scope column reserved for row-level
-- 'own' checks layered on by individual policies later.
-- ---------------------------------------------------------------------
create or replace function has_permission(p_code text)
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from user_roles ur
      join roles r on r.id = ur.role_id
     where ur.user_id = current_app_user()
       and (r.code = 'admin'
            or exists (select 1 from role_permissions rp
                        where rp.role_id = r.id
                          and rp.permission = p_code
                          and rp.scope <> 'none'))
  );
$$;
comment on function has_permission is 'Union of permissions across the user''s roles; admin role is all-access.';

-- ---------------------------------------------------------------------
-- Enable RLS everywhere. Default-deny; we add explicit policies below.
-- ---------------------------------------------------------------------
alter table company_settings   enable row level security;
alter table branches           enable row level security;
alter table financial_years    enable row level security;
alter table users              enable row level security;
alter table roles              enable row level security;
alter table permissions        enable row level security;
alter table role_permissions   enable row level security;
alter table user_roles         enable row level security;
alter table user_pay_config    enable row level security;
alter table audit_log          enable row level security;
alter table number_series      enable row level security;
alter table chart_of_accounts  enable row level security;
alter table cost_centers       enable row level security;
alter table journal_entries    enable row level security;
alter table journal_lines      enable row level security;
alter table account_balances   enable row level security;

-- ---------------------------------------------------------------------
-- Read access: any authenticated user may SELECT reference/config data.
-- (Fine-grained masking of pay/salary handled by a dedicated policy.)
-- ---------------------------------------------------------------------
create policy read_all_auth on company_settings for select to authenticated using (true);
create policy read_all_auth on branches         for select to authenticated using (true);
create policy read_all_auth on financial_years  for select to authenticated using (true);
create policy read_all_auth on roles            for select to authenticated using (true);
create policy read_all_auth on permissions      for select to authenticated using (true);
create policy read_all_auth on role_permissions for select to authenticated using (true);
create policy read_all_auth on user_roles       for select to authenticated using (true);
create policy read_all_auth on chart_of_accounts for select to authenticated using (true);
create policy read_all_auth on cost_centers     for select to authenticated using (true);
create policy read_all_auth on number_series    for select to authenticated using (true);

-- users: everyone authenticated can read profiles (names shown across UI).
create policy read_users on users for select to authenticated using (true);
-- a user may update only their own profile's soft fields (via app, not money).
create policy self_update on users for update to authenticated
  using (id = current_app_user()) with check (id = current_app_user());

-- pay config: only the owner or someone with hr.view may read it.
create policy read_own_pay on user_pay_config for select to authenticated
  using (user_id = current_app_user() or has_permission('hr.view'));

-- ---------------------------------------------------------------------
-- Ledger tables — READ-ONLY to end users; writes happen only inside
-- security-definer RPCs (post_journal, etc.) which run as the table owner
-- and therefore bypass RLS. No INSERT/UPDATE/DELETE policy = denied. (Inv 3)
-- ---------------------------------------------------------------------
create policy read_ledger on journal_entries  for select to authenticated using (true);
create policy read_ledger on journal_lines    for select to authenticated using (true);
create policy read_ledger on account_balances for select to authenticated using (true);

-- audit_log: readable with permission; never writable via the API (Inv 7).
create policy read_audit on audit_log for select to authenticated
  using (has_permission('audit.view'));

-- ---------------------------------------------------------------------
-- Config writes — gated by permission. These are plain tables (not money),
-- so the app may write them directly when the user is authorised.
-- ---------------------------------------------------------------------
create policy manage_company on company_settings for all to authenticated
  using (has_permission('settings.manage')) with check (has_permission('settings.manage'));
create policy manage_branches on branches for all to authenticated
  using (has_permission('settings.manage')) with check (has_permission('settings.manage'));
create policy manage_fy on financial_years for all to authenticated
  using (has_permission('settings.manage')) with check (has_permission('settings.manage'));
create policy manage_coa on chart_of_accounts for all to authenticated
  using (has_permission('accounting.manage')) with check (has_permission('accounting.manage'));
create policy manage_cc on cost_centers for all to authenticated
  using (has_permission('accounting.manage')) with check (has_permission('accounting.manage'));
create policy manage_roles on roles for all to authenticated
  using (has_permission('roles.manage')) with check (has_permission('roles.manage'));
create policy manage_role_perms on role_permissions for all to authenticated
  using (has_permission('roles.manage')) with check (has_permission('roles.manage'));
create policy manage_user_roles on user_roles for all to authenticated
  using (has_permission('roles.manage')) with check (has_permission('roles.manage'));
create policy manage_pay on user_pay_config for all to authenticated
  using (has_permission('hr.manage')) with check (has_permission('hr.manage'));

-- number_series is bumped only inside next_number() (definer). No write policy.
