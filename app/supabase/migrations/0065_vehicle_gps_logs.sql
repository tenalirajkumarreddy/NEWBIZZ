-- =====================================================================
-- 0065_vehicle_gps_logs.sql  ·  Intangles GPS time-series storage (§7.2)
--
-- The external poller (or Next.js route handler called by cron-job.org)
-- writes Intangles GPS snapshots here every ~60s per vehicle. The front-end
-- reads latest position for live tracking and historical data for trip replay.
-- =====================================================================

create table vehicle_gps_logs (
  id           bigint generated always as identity primary key,
  vehicle_id   uuid not null references vehicles(id) on delete cascade,
  lat          numeric(9,6),
  lng          numeric(9,6),
  speed        numeric(6,2),                              -- km/h
  heading      numeric(5,2),                              -- degrees
  ignition     boolean,
  recorded_at  timestamptz not null,                       -- Intangles device timestamp
  created_at   timestamptz not null default now()
);

create index vgps_vehicle_ts_idx on vehicle_gps_logs (vehicle_id, recorded_at desc);
comment on table vehicle_gps_logs is 'Time-series GPS position snapshots polled from Intangles API.';

-- latest position per vehicle (for live map)
create index vgps_vehicle_latest_idx on vehicle_gps_logs (vehicle_id, recorded_at desc);

-- -----------------------------------------------------------------------
-- RLS: anyone with field.view can read GPS logs; only the poller (or an
-- actor with service_role via the route handler) writes.
-- -----------------------------------------------------------------------
alter table vehicle_gps_logs enable row level security;

create policy read_all_auth on vehicle_gps_logs
  for select to authenticated using (has_permission('field.view'));

-- The route handler uses the anon key + service_role via the Next.js
-- server client; no direct INSERT policy needed for the app user.
