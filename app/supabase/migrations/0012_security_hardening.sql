-- =====================================================================
-- 0012_security_hardening.sql
-- Closes the Supabase security-advisor findings raised after the Phase 0+1
-- build. Three classes of fix:
--
--   1. security_definer_view (ERROR): the stock_value_reconcile view ran with
--      the creator's rights, ignoring the querying user's RLS. Recreate it
--      with security_invoker=on so it respects the caller's policies.
--
--   2. function_search_path_mutable (WARN, x14): functions with no pinned
--      search_path are exposed to search-path injection. Pin every public
--      function to `public` (definer RPCs already set it in-body; this also
--      covers the trigger + stable-SQL helpers that did not).
--
--   3. anon can execute SECURITY DEFINER RPCs (WARN): the unauthenticated
--      `anon` role could call post_journal / post_invoice / record_receipt /
--      … directly via /rest/v1/rpc. Revoke EXECUTE from anon and PUBLIC on
--      every public function; the app calls these as `authenticated`, which
--      keeps working. (Invariant 3: RPCs remain the only value gateway, but
--      only for signed-in users now.)
--
-- Idempotent: safe to re-run.
-- =====================================================================

-- 1) -------------------------------------------------------------- view
-- Recreate the reconcile view so it enforces the querying user's RLS.
alter view stock_value_reconcile set (security_invoker = on);

-- 2) ------------------------------------------------- pin search_path
-- Set search_path = public on every function in the public schema that
-- doesn't already have a search_path config. Covers the 14 flagged
-- functions (triggers + stable helpers) without needing each signature.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and not exists (
         select 1 from unnest(coalesce(p.proconfig, '{}')) c
          where c like 'search_path=%'
       )
  loop
    execute format('alter function %s set search_path = public', r.sig);
  end loop;
end $$;

-- 3) ------------------------------------------------ revoke anon access
-- Take EXECUTE away from PUBLIC and anon on every public function so the
-- money/stock RPCs cannot be invoked without signing in. authenticated
-- retains EXECUTE (the app's server calls run as authenticated users).
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
  loop
    execute format('revoke execute on function %s from public', r.sig);
    execute format('revoke execute on function %s from anon',   r.sig);
  end loop;
end $$;

-- Belt-and-braces: ensure the two RLS helper functions stay callable by
-- authenticated users (RLS policies reference them).
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('has_permission','current_app_user')
  loop
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end $$;
