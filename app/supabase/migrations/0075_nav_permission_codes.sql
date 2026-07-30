-- =====================================================================
-- 0075_nav_permission_codes.sql
--
-- Adds the missing permission codes referenced by the sidebar nav model
-- (nav.ts) and grants them to the appropriate roles so the sidebar
-- actually shows/hides items based on who is logged in.
--
-- This does NOT change any RPC or RLS behavior — it only makes the nav
-- gates work. Existing "action" perms (order.create, payment.record,
-- production.record, etc.) remain the actual capability gate.
-- =====================================================================

-- 1. Register missing permission codes
insert into permissions (code, description) values
  ('invoice.view',     'View sales invoices and cash memos'),
  ('order.view',       'View orders and delivery challans'),
  ('receipt.record',   'Record customer collections / receipts'),
  ('creditnote.view',  'View credit notes & schemes'),
  ('supplier.view',    'View supplier list'),
  ('purchase.view',    'View purchase orders & GRNs'),
  ('item.view',        'View item master'),
  ('stock.view',       'View warehouse stock levels'),
  ('pricing.manage',   'Manage rate master'),
  ('bom.view',         'View BOM / recipes'),
  ('production.run',   'Record production runs'),
  ('bank.reconcile',   'Bank reconciliation'),
  ('field.view',       'Field operations (routes, fleet)'),
  ('crm.view',         'CRM & complaints'),
  ('commission.view',  'Targets & commissions'),
  ('license.view',     'License register')
on conflict (code) do nothing;

-- 2. Grant nav permissions to roles
-- Helper: insert if not exists
do $$
declare
  v_role_id uuid;
  v_perms   text[];
  v_perm    text;
begin
  -- === Agent (delivery/field fulfilment) ===
  select id into v_role_id from roles where code = 'agent';
  if v_role_id is not null then
    v_perms := array['order.view', 'receipt.record', 'stock.view', 'field.view', 'crm.view'];
    foreach v_perm in array v_perms loop
      insert into role_permissions (role_id, permission, scope)
      values (v_role_id, v_perm, 'all')
      on conflict on constraint role_permissions_pkey do nothing;
    end loop;
  end if;

  -- === Sales / Field ===
  select id into v_role_id from roles where code = 'sales';
  if v_role_id is not null then
    v_perms := array['invoice.view', 'order.view', 'receipt.record', 'creditnote.view', 'stock.view', 'pricing.manage', 'field.view', 'crm.view', 'commission.view'];
    foreach v_perm in array v_perms loop
      insert into role_permissions (role_id, permission, scope)
      values (v_role_id, v_perm, 'all')
      on conflict on constraint role_permissions_pkey do nothing;
    end loop;
  end if;

  -- === Accountant ===
  select id into v_role_id from roles where code = 'accountant';
  if v_role_id is not null then
    v_perms := array['invoice.view', 'order.view', 'receipt.record', 'creditnote.view', 'supplier.view', 'purchase.view', 'item.view', 'stock.view', 'pricing.manage', 'bom.view', 'bank.reconcile', 'commission.view', 'license.view'];
    foreach v_perm in array v_perms loop
      insert into role_permissions (role_id, permission, scope)
      values (v_role_id, v_perm, 'all')
      on conflict on constraint role_permissions_pkey do nothing;
    end loop;
  end if;

  -- === Manager ===
  select id into v_role_id from roles where code = 'manager';
  if v_role_id is not null then
    v_perms := array['invoice.view', 'order.view', 'receipt.record', 'creditnote.view', 'supplier.view', 'purchase.view', 'item.view', 'stock.view', 'pricing.manage', 'bom.view', 'production.run', 'bank.reconcile', 'field.view', 'crm.view', 'commission.view', 'license.view'];
    foreach v_perm in array v_perms loop
      insert into role_permissions (role_id, permission, scope)
      values (v_role_id, v_perm, 'all')
      on conflict on constraint role_permissions_pkey do nothing;
    end loop;
  end if;

  -- === Plant Operator ===
  select id into v_role_id from roles where code = 'operator';
  if v_role_id is not null then
    v_perms := array['item.view', 'stock.view', 'bom.view', 'production.run', 'license.view'];
    foreach v_perm in array v_perms loop
      insert into role_permissions (role_id, permission, scope)
      values (v_role_id, v_perm, 'all')
      on conflict on constraint role_permissions_pkey do nothing;
    end loop;
  end if;

  -- === Viewer (read-only dashboards) ===
  select id into v_role_id from roles where code = 'viewer';
  if v_role_id is not null then
    v_perms := array['item.view', 'stock.view'];
    foreach v_perm in array v_perms loop
      insert into role_permissions (role_id, permission, scope)
      values (v_role_id, v_perm, 'all')
      on conflict on constraint role_permissions_pkey do nothing;
    end loop;
  end if;
end;
$$;
