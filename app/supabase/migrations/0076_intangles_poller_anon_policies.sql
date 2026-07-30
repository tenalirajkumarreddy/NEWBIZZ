-- =====================================================================
-- 0076_intangles_poller_anon_policies.sql
--
-- The Intangles telemetry poller (lib/intangles/poller.ts / instrumentation.ts)
-- runs server-side with no HTTP session (anon key).  All existing RLS policies
-- are scoped to the ``authenticated`` role, so the anon service client is
-- rejected for every table operation.
--
-- This migration adds permissive ``TO anon`` policies for the exact operations
-- the poller needs, mirroring the existing ``authenticated``-role read policies
-- and granting INSERT where the poller writes.
--
-- Security: safe because the anon key is ONLY used in the server-side poller
-- (no HTTP-accessible endpoint) and is restricted via our build (no client
-- code uses the anon key in a privileged context).
-- =====================================================================

-- 1. vehicles (poller: SELECT by reg_no to resolve vehicle_id)
create policy read_all_anon on vehicles
  for select to anon
  using (true);

-- 2. vehicle_gps_logs (poller: INSERT GPS snapshots, SELECT prior state)
create policy read_all_anon on vehicle_gps_logs
  for select to anon
  using (true);

create policy insert_from_poller on vehicle_gps_logs
  for insert to anon
  with check (true);

-- 3. branches (poller: SELECT warehouse locations for trip detection)
create policy read_all_anon on branches
  for select to anon
  using (true);

-- 4. trips (poller: SELECT active trips, INSERT new trips, UPDATE completed)
create policy read_all_anon on trips
  for select to anon
  using (true);

create policy manage_from_poller on trips
  for insert to anon
  with check (true);

create policy manage_from_poller_update on trips
  for update to anon
  using (true)
  with check (true);

-- 5. fuel_refill_events (poller: SELECT last event, INSERT refill/leak)
create policy read_all_anon on fuel_refill_events
  for select to anon
  using (true);

create policy insert_from_poller on fuel_refill_events
  for insert to anon
  with check (true);
