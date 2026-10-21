-- =====================================================================
-- 0028_reharden_phase4.sql
--
-- BACKFILLED 2026-10-20. Production's migration history recorded this
-- migration (version 20260718133538) but the file was never committed, so a
-- fresh database could not be built from the repository.
--
-- Phase 4 (0024 targets/commissions, 0025 bank reconciliation, 0026 payroll,
-- 0027 notifications/documents) added a batch of new RPCs and tables. This is
-- the same hardening pass 0012 ran, re-applied afterwards, so the new
-- SECURITY DEFINER entry points are not reachable by `anon` and cannot be
-- hijacked through a mutable search_path.
--
-- What was read back from the production catalog to confirm the end state:
--   * all 231 public functions carry a pinned `search_path` (0 unpinned);
--   * only 8 functions hold EXECUTE for `anon` — the WhatsApp webhook, the
--     Intangles poller and their helpers, granted deliberately by 0076 /
--     `whatsapp_webhook_anon_grants` / `0087b_arms_invoice_voider_anon`, so
--     this sweep must not touch grants made after it.
--
-- The original file scoped the sweep to the phase-4 objects. Reconstructing
-- that exact list is not possible from the catalog, so this re-runs the sweep
-- over every public function: it is idempotent and produces the same end
-- state, and 0087/0097 repeat it later anyway. `authenticated` grants are
-- left exactly as each migration wrote them — this pass only takes privilege
-- away from `public` and `anon`.
-- =====================================================================

-- 1) ------------------------------------------------ pin search_path
-- Definer RPCs set it in-body; this covers trigger + stable helpers that did
-- not, which is where search-path injection lives.
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

-- 2) -------------------------------------------- revoke anon access
-- `anon` keeps no EXECUTE on any public function; the app's server calls run
-- as `authenticated`.
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

-- 3) ------------------------------------- keep the RLS helpers callable
-- Policies reference these two, so a policy check must not fail on a
-- permission error for signed-in users.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('has_permission', 'current_app_user')
  loop
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end $$;
