-- =====================================================================
-- seed/0100_seed_foundation.sql
-- Bootstraps the entity: company row, financial year, roles, the
-- permission catalogue, and the role→permission matrix.
-- Idempotent (safe to re-run) via ON CONFLICT.
-- =====================================================================

-- --- company (single row) -------------------------------------------
insert into company_settings (legal_name, trade_name, state_code, fy_start_month, invoice_footer)
select 'NEWBIZZ Beverages', 'NEWBIZZ', '33', 4, 'Thank you for your business.'
where not exists (select 1 from company_settings);

-- --- financial year 2026-27 (Apr–Mar) -------------------------------
insert into financial_years (code, start_date, end_date, status)
values ('FY26-27', date '2026-04-01', date '2027-03-31', 'open')
on conflict (code) do nothing;

-- --- default plant / warehouse branch --------------------------------
insert into branches (code, name, state_code, is_plant, is_warehouse)
values ('HO', 'Head Office & Plant', '33', true, true)
on conflict (code) do nothing;

-- --- roles -----------------------------------------------------------
insert into roles (code, name, description, is_system) values
  ('admin',    'Administrator',   'Full access to everything',                 true),
  ('manager',  'Manager',         'Operations + accounting oversight',         true),
  ('accountant','Accountant',     'Ledger, purchases, payments',               true),
  ('sales',    'Sales / Field',   'Orders, collections, customers',            true),
  ('operator', 'Plant Operator',  'Production entries, stock moves',           true),
  ('viewer',   'Viewer',          'Read-only dashboards',                      true)
on conflict (code) do nothing;

-- --- permission catalogue -------------------------------------------
insert into permissions (code, description) values
  ('settings.manage',   'Edit company settings, branches, financial years'),
  ('roles.manage',      'Manage roles, permissions, user-role assignment'),
  ('accounting.manage', 'Manage chart of accounts & cost centers'),
  ('journal.post',      'Post journal entries (via RPC)'),
  ('journal.view',      'View the ledger & trial balance'),
  ('audit.view',        'View the audit log'),
  ('hr.view',           'View pay configuration'),
  ('hr.manage',         'Edit pay configuration & payroll'),
  ('order.create',      'Create sales orders'),
  ('payment.record',    'Record customer collections'),
  ('customer.manage',   'Create / edit customers & stores'),
  ('purchase.manage',   'Create purchases, GRNs, supplier payments'),
  ('production.record', 'Record production runs & stock moves'),
  ('inventory.view',    'View stock levels & valuation')
on conflict (code) do nothing;

-- --- role → permission matrix ---------------------------------------
-- admin needs no rows (has_permission short-circuits on role 'admin').

-- manager: broad oversight, everything except role/settings hard-admin
insert into role_permissions (role_id, permission, scope)
select r.id, p.code, 'all'
  from roles r cross join permissions p
 where r.code = 'manager'
   and p.code in ('accounting.manage','journal.post','journal.view','audit.view',
                  'hr.view','order.create','payment.record','customer.manage',
                  'purchase.manage','production.record','inventory.view')
on conflict do nothing;

-- accountant: the ledger + purchasing
insert into role_permissions (role_id, permission, scope)
select r.id, p.code, 'all'
  from roles r cross join permissions p
 where r.code = 'accountant'
   and p.code in ('accounting.manage','journal.post','journal.view','audit.view',
                  'payment.record','purchase.manage','inventory.view')
on conflict do nothing;

-- sales / field
insert into role_permissions (role_id, permission, scope)
select r.id, p.code, 'all'
  from roles r cross join permissions p
 where r.code = 'sales'
   and p.code in ('order.create','payment.record','customer.manage','inventory.view')
on conflict do nothing;

-- plant operator
insert into role_permissions (role_id, permission, scope)
select r.id, p.code, 'all'
  from roles r cross join permissions p
 where r.code = 'operator'
   and p.code in ('production.record','inventory.view')
on conflict do nothing;

-- viewer: read-only surfaces
insert into role_permissions (role_id, permission, scope)
select r.id, p.code, 'all'
  from roles r cross join permissions p
 where r.code = 'viewer'
   and p.code in ('journal.view','inventory.view')
on conflict do nothing;
