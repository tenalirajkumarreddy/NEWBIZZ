-- =====================================================================
-- 0109_notify_no_self.sql
--
-- Bugfix: users were receiving notifications for actions THEY performed
-- (e.g. the manager who posts an invoice gets an "Invoice posted" bell).
--
-- Root cause: the permission fan-out helpers notify_perm() /
-- notify_by_permission() resolve recipients via resolve_recipients(),
-- which returns EVERY active holder of the target permission — including
-- current_app_user() — so the actor is notified about their own action.
--
-- Fix: exclude the acting user inside resolve_recipients(). This is the
-- single choke point shared by all *_notify triggers, notify_perm(),
-- notify_by_permission(), reorder_alert_check and notification_daily_scan.
-- When no JWT is present (cron / daily scan / webhook receiver) the actor
-- is NULL, and `is distinct from NULL` keeps every resolver unchanged —
-- system-generated notifications still fan out to all holders.
--
-- Behavioral edge (intended): reorder_alert_check runs in trigger context, so
-- the stock-operating user who crosses below a reorder level is excluded from
-- that alert; and if notification_daily_scan is ever invoked with a live user
-- JWT, that caller is excluded too. Consistent with "no self-notifications".
--
-- Also cleans the few historical self-notifications (created_by = user_id)
-- so the existing corpus matches the new rule. This is a narrow delete on
-- the notifications table (owner context), guarded to the self-rows only;
-- ordinary users can only ever delete their own rows anyway via RLS.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Rewrite resolve_recipients to drop the acting user.
--    SQL, STABLE, SECURITY DEFINER — same signature/volatility as 0033 so
--    the definer-only gating (revoked from anon/authenticated/public) is
--    preserved; re-assert the revoke anyway for zero drift.
-- ---------------------------------------------------------------------
create or replace function public.resolve_recipients(p_code text)
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $function$
  select u.id
    from users u
   where u.status = 'active'
     and p_code = any(public.perms_for_user(u.id))
     and u.id is distinct from public.current_app_user();
$function$;

revoke all on function public.resolve_recipients(text) from anon, authenticated, public;
alter function public.resolve_recipients(text) owner to postgres;
grant execute on function public.resolve_recipients(text) to service_role;

-- ---------------------------------------------------------------------
-- 2. Purge historical self-notifications (the rows already on the bell).
-- ---------------------------------------------------------------------
delete from public.notifications
 where created_by is not null
   and created_by = user_id;