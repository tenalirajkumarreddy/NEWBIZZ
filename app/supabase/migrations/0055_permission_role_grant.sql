-- =====================================================================
-- 0055_permission_role_grant.sql
--
-- Grants the two new permissions (credit.override, orders.approve) to
-- the correct roles. Admin bypasses via has_permission (hardcoded true
-- for r.code='admin'), so only Manager and Accountant need explicit
-- grants here. Also ensures settings.manage is on all admin-adjacent
-- roles for good measure.
-- =====================================================================

-- 1. credit.override → Manager, Accountant
insert into role_permissions (role_id, permission, scope)
select r.id, 'credit.override', 'all'
  from roles r
 where r.code in ('manager', 'accountant')
   and not exists (
     select 1 from role_permissions rp
      where rp.role_id = r.id and rp.permission = 'credit.override'
   );

-- 2. orders.approve → Manager
insert into role_permissions (role_id, permission, scope)
select r.id, 'orders.approve', 'all'
  from roles r
 where r.code = 'manager'
   and not exists (
     select 1 from role_permissions rp
      where rp.role_id = r.id and rp.permission = 'orders.approve'
   );

-- 3. Ensure settings.manage reaches roles that may need to load opening stock
insert into role_permissions (role_id, permission, scope)
select r.id, 'settings.manage', 'all'
  from roles r
 where r.code in ('manager', 'accountant')
   and not exists (
     select 1 from role_permissions rp
      where rp.role_id = r.id and rp.permission = 'settings.manage'
   );
