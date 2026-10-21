-- =====================================================================
-- 0086c_get_person_balance.sql
--
-- BACKFILLED 2026-10-20. 0087 revokes execution on get_person_balance(uuid),
-- but the migration that created the function was never committed to the repo
-- (the function exists in production). Definition read back from production.
--
-- "Person" spans two ledgers: a worker's wage account (worker_id) and a staff
-- member's expense/advance account (user_id). Both live in worker_transactions.
-- =====================================================================

create or replace function public.get_person_balance(p_entity_id uuid)
returns numeric
language sql
security definer
set search_path to 'public'
as $function$
  select coalesce(sum(amount), 0)
    from worker_transactions
   where user_id = p_entity_id or worker_id = p_entity_id;
$function$;

revoke all on function public.get_person_balance(uuid) from public, anon;
grant execute on function public.get_person_balance(uuid) to authenticated, service_role;
