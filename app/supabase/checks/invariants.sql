-- =====================================================================
-- app/supabase/checks/invariants.sql
--
-- Read-only reconciliation check for CI and any scheduled job. Exits
-- non-zero (psql -v ON_ERROR_STOP=1) when two books of the same money
-- disagree, so drift fails a build or pages someone instead of waiting
-- for the next audit.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f app/supabase/checks/invariants.sql
--
-- Safe to run against production: every statement is a SELECT.
-- =====================================================================

\echo '── Reconciliation invariants ────────────────────────────────────────'

select check_name,
       expected,
       actual,
       difference,
       status
  from public.reconciliation_checks();

do $$
declare
  r      record;
  v_bad  int := 0;
begin
  for r in select * from public.reconciliation_checks() where status <> 'ok' loop
    raise warning 'DRIFT: % — expected %, actual %, difference %',
      r.check_name, r.expected, r.actual, r.difference;
    v_bad := v_bad + 1;
  end loop;

  if v_bad > 0 then
    raise exception '% reconciliation check(s) drifting — see the warnings above', v_bad;
  end if;

  raise notice 'All reconciliation checks balanced';
end $$;

\echo '── Customers whose AR does not tie ─────────────────────────────────'
select customer, gl_balance, subledger, difference
  from public.ar_drift_by_customer(50);
