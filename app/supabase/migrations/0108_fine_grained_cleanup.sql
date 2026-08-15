-- =====================================================================
-- 0108_fine_grained_cleanup.sql
--
-- Retire unreferenced coarse permission code: purchase.manage.
--
-- Task 10 planner assumed all seven legacy coarse codes
-- (invoice.view / purchase.manage / accounting.manage / report.view_all /
--  field.view / orders.approve / cash.transfer) reached zero references after
-- Tasks 1-7 and could be dropped. That premise did NOT hold on live:
--
--   • invoice.view        — still granted AND used (read_invoices RLS,
--                           /invoices + /sales guards). KEPT.
--   • accounting.manage   — still a live notification-recipient filter
--                           (10x notify_perm) + gate in
--                           rebuild_user_cash_holdings. KEPT.
--   • report.view_all     — live notification filter (3x notify_perm). KEPT.
--   • field.view          — still used by /fleet + /routes route-guard. KEPT.
--   • orders.approve      — live notification filter (sales_orders_notify). KEPT.
--   • cash.transfer       — live fine code (0101 expansion + transfer-trio
--                           gates). KEPT.
--   • purchase.manage     — NO function/policy/override references anywhere.
--                           Controller + USER DECISION: delete only this one.
--
-- The supplier/bom master RLS uses purchase.create / bom.manage (since 0103);
-- the "has_permission('purchase.manage')" comments in the old server actions
-- are stale. purchase.manage granted to accountant (scope none) + manager
-- (scope all) only, in role_permissions. Zero user_permission_overrides,
-- zero policy predicates, zero RPC bodies reference it.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Drop the role grants.
-- ---------------------------------------------------------------------
delete from public.role_permissions
 where permission = 'purchase.manage';

-- ---------------------------------------------------------------------
-- 2. Drop the catalog row (nonexistent overrides are a no-op guard).
-- ---------------------------------------------------------------------
delete from public.permissions
 where code = 'purchase.manage'
   and not exists (select 1 from public.role_permissions where permission = 'purchase.manage')
   and not exists (select 1 from public.user_permission_overrides where permission = 'purchase.manage');