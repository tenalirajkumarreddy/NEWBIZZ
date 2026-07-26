-- =====================================================================
-- 0066_fleet_trip_auto.sql  ·  Warehouse location + auto-trip detection (§7.2)
--
-- Adds lat/lng to branches (for warehouse proximity detection) and
-- extends the trips table to support auto-detected trips based on
-- vehicle departure/return to warehouse.
-- =====================================================================

-- -----------------------------------------------------------------------
-- 1. Add location columns to branches
-- -----------------------------------------------------------------------
alter table branches
  add column if not exists lat numeric(9,6),
  add column if not exists lng numeric(9,6);

comment on column branches.lat is 'Latitude for warehouse/plant proximity detection.';
comment on column branches.lng is 'Longitude for warehouse/plant proximity detection.';

-- -----------------------------------------------------------------------
-- 2. Extend trips table for auto-detection
-- -----------------------------------------------------------------------
alter table trips
  add column if not exists started_at    timestamptz,
  add column if not exists ended_at      timestamptz,
  add column if not exists start_lat     numeric(9,6),
  add column if not exists start_lng     numeric(9,6),
  add column if not exists end_lat       numeric(9,6),
  add column if not exists end_lng       numeric(9,6),
  add column if not exists type          text not null default 'manual'
                    check (type in ('manual','auto')),
  add column if not exists status        text not null default 'active'
                    check (status in ('active','completed')),
  add column if not exists distance_km   numeric(10,2),
  add column if not exists max_speed     numeric(6,2),
  add column if not exists avg_speed     numeric(6,2);

comment on column trips.started_at   is 'Trip start timestamp (from GPS departure from warehouse).';
comment on column trips.ended_at     is 'Trip end timestamp (from GPS return to warehouse).';
comment on column trips.start_lat    is 'GPS latitude at trip start.';
comment on column trips.start_lng    is 'GPS longitude at trip start.';
comment on column trips.end_lat      is 'GPS latitude at trip end.';
comment on column trips.end_lng      is 'GPS longitude at trip end.';
comment on column trips.type         is "'manual' = user-created, 'auto' = system-detected from warehouse proximity.";
comment on column trips.status       is "'active' = vehicle is out, 'completed' = vehicle returned.";
comment on column trips.distance_km  is 'Estimated trip distance from GPS logs.';
comment on column trips.max_speed    is 'Maximum speed recorded during trip.';
comment on column trips.avg_speed    is 'Average speed during trip.';

-- Index for finding active auto-trips per vehicle
create index if not exists trips_auto_active_idx
  on trips (vehicle_id) where type = 'auto' and status = 'active';

-- -----------------------------------------------------------------------
-- 3. RLS — trips policy already exists; auto-trips read/write follow same rules.
--    The cron poller uses service_role key, bypassing RLS.
-- -----------------------------------------------------------------------
