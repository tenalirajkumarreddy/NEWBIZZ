-- =====================================================================
-- 0074_agent_role.sql
--
-- Adds the missing "Agent" role for delivery/field fulfilment personnel
-- as documented in the master build plan ($2.1) and role-specific
-- holdings & handovers design doc.
--
-- Agent characteristics (from docs):
--   - Carries delivery stock (has stock holdings)
--   - Fulfils orders, collects payments on delivery
--   - Runs route sessions, manages store visits
--   - Transfers stock from self→user (delivery) and self→warehouse (returns)
--   - Hands over cash collections to manager/bank
-- =====================================================================

-- 1. Insert the role itself (idempotent via on conflict do nothing)
insert into roles (code, name, description, is_system) values
  ('agent', 'Delivery Agent', 'Fulfil orders, collect payments, route sessions', true)
on conflict (code) do nothing;

-- 2. Grant permissions with appropriate scopes
--    stock.transfer scope = 'anyone' signals self↔user/self↔warehouse transfers
--    (vs 'all' for WH↔user operators / admin/manager)
insert into role_permissions (role_id, permission, scope)
select r.id, v.code, v.scope
  from roles r
  join (values
    ('agent', 'order.create',      'all'),
    ('agent', 'payment.record',    'all'),
    ('agent', 'customer.manage',   'all'),
    ('agent', 'inventory.view',    'all'),
    ('agent', 'stock.transfer',    'anyone'),
    ('agent', 'cash.transfer',     'all'),
    ('agent', 'production.record', 'all')
  ) as v(role_code, code, scope)
    on v.role_code = r.code
on conflict on constraint role_permissions_pkey do nothing;
