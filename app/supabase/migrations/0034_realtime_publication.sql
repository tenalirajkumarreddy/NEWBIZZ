-- =====================================================================
-- 0034_realtime_publication.sql   (Platform layer — Realtime)
--
-- Deliberately publishes the §5.2 tables to the supabase_realtime publication.
-- Never blanket-publish: RLS still governs realtime (a client only receives
-- change events for rows its SELECT policy allows), but least surface is safer
-- and cheaper. High-churn value tables (journal_lines, account_balances) are
-- intentionally NOT published — dashboards read those via RPC/read-models.
--
-- Published (with why):
--   notifications   -> live bell / toasts        (user_id = auth.uid())
--   users           -> token_version bump refresh (id = auth.uid())
--   route_sessions  -> live field tracking        (branch/route policy)
--   visits          -> live field tracking        (branch/route policy)
--   sales_orders    -> live pipeline              (branch policy)
--   invoices        -> live pipeline              (branch policy)
--   complaints      -> live care queue            (status/open policy)
--
-- Each target was verified to have RLS enabled + a SELECT policy before adding.
-- REPLICA IDENTITY FULL so UPDATE/DELETE events carry old-row column values
-- (needed for RLS filtering of deltas and for client-side row diffing).
-- Idempotent. Append-only. No transaction rows touched.
-- =====================================================================

-- 1) Ensure the publication exists (Supabase creates it, but be safe).
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

-- 2) Add each table only if not already a member (ALTER PUBLICATION ADD errors
--    on duplicates, so guard each one).
do $$
declare
  t text;
  tables text[] := array[
    'notifications','users','route_sessions','visits',
    'sales_orders','invoices','complaints'
  ];
begin
  foreach t in array tables loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname='supabase_realtime' and schemaname='public' and tablename=t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
    -- Full row image on UPDATE/DELETE so RLS + client diffing see old values.
    execute format('alter table public.%I replica identity full', t);
  end loop;
end $$;
