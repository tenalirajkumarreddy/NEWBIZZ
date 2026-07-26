-- =====================================================================
-- 0067_fuel_refill_events.sql  ·  Fuel refill/leak detection + ignition trips (§7.2)
--
-- Adds fuel columns to vehicle_gps_logs, creates fuel_refill_events table
-- for tracking detected refills and leaks, and adds category to trips
-- for ignition vs warehouse trip types.
-- =====================================================================

-- -----------------------------------------------------------------------
-- 1. Add fuel columns to vehicle_gps_logs
-- -----------------------------------------------------------------------
alter table vehicle_gps_logs
  add column if not exists fuel_amount numeric(10,2),
  add column if not exists fuel_pct    numeric(5,2);

comment on column vehicle_gps_logs.fuel_amount is 'Fuel amount from Intangles (likely litres).';
comment on column vehicle_gps_logs.fuel_pct    is 'Fuel percentage from Intangles.';

-- -----------------------------------------------------------------------
-- 2. Fuel refill / leak events
-- -----------------------------------------------------------------------
create table if not exists fuel_refill_events (
  id            uuid primary key default gen_random_uuid(),
  vehicle_id    uuid not null references vehicles(id) on delete cascade,
  detected_at   timestamptz not null default now(),
  event_type    text not null check (event_type in ('refill','leak')),
  prev_amount   numeric(10,2) not null,
  new_amount    numeric(10,2) not null,
  delta_litres  numeric(10,2) not null,
  status        text not null default 'pending'
                check (status in ('pending','confirmed','dismissed')),
  fuel_log_id   uuid references fuel_logs(id) on delete set null,
  admin_amount  numeric(14,2),
  admin_litres  numeric(10,3),
  receipt_url   text,
  fraud_alert   boolean not null default false,
  created_at    timestamptz not null default now()
);

create index if not exists fre_vehicle_idx on fuel_refill_events (vehicle_id, detected_at desc);
create index if not exists fre_status_idx on fuel_refill_events (status) where status = 'pending';

comment on table fuel_refill_events is 'Auto-detected fuel refill or leak events from Intangles telemetry.';
comment on column fuel_refill_events.event_type   is "'refill' = fuel increase, 'leak' = sudden drop with ignition off.";
comment on column fuel_refill_events.fraud_alert   is 'Set when admin-reported litres deviate from estimated by more than fraud_tolerance_pct.';

-- -----------------------------------------------------------------------
-- 3. Category column on trips for ignition vs warehouse
-- -----------------------------------------------------------------------
alter table trips
  add column if not exists category text check (category in ('ignition', 'warehouse'));

comment on column trips.category is "'ignition' = engine on/off trip, 'warehouse' = warehouse departure/return trip.";

-- -----------------------------------------------------------------------
-- 4. RLS
-- -----------------------------------------------------------------------
alter table fuel_refill_events enable row level security;

create policy read_all_auth on fuel_refill_events
  for select to authenticated using (has_permission('field.view'));

create policy manage_all_auth on fuel_refill_events
  for all to authenticated using (has_permission('settings.manage'))
  with check (has_permission('settings.manage'));
