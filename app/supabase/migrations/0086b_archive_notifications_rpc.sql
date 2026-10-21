-- =====================================================================
-- 0086b_archive_notifications_rpc.sql
--
-- BACKFILLED 2026-10-20. Applied to the NEWBIZZ project on 2026-07-31
-- (supabase_migrations: archive_notifications_rpc) but never committed. 0087
-- revokes and grants on this function, so without it a fresh database aborts
-- at 0087. Definition read back from production.
--
-- Archiving is a soft state change on the caller's own rows; the RPC takes no
-- user argument, so a caller can never archive somebody else's inbox.
-- =====================================================================

create or replace function public.archive_notifications(p_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_me uuid := current_app_user();
  v_n  int;
begin
  update notifications
     set status = 'archived', read_at = coalesce(read_at, now())
   where user_id = v_me and status <> 'archived'
     and (p_ids is null or id = any(p_ids));
  get diagnostics v_n = row_count;
  return v_n;
end $function$;

revoke all on function public.archive_notifications(uuid[]) from public, anon;
grant execute on function public.archive_notifications(uuid[]) to authenticated, service_role;
