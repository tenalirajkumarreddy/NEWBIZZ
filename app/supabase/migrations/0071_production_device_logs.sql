-- =====================================================================
-- 0071_production_device_logs.sql  ·  Device config + real-time logs
--
-- 1. production_device_config — maps (device_id, device_index) to items
-- 2. production_logs — timestamped detection events from ESP32 devices
-- =====================================================================

-- ---------------------------------------------------------------------
-- production_device_config
-- ---------------------------------------------------------------------
create table production_device_config (
  id            uuid primary key default gen_random_uuid(),
  device_id     text not null,
  device_index  int  not null,
  item_id       uuid not null references items(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz,
  unique (device_id, device_index)
);

comment on table production_device_config is
  'Maps each ESP32 device slot (device_index) to an item SKU.';

-- ---------------------------------------------------------------------
-- production_logs
-- ---------------------------------------------------------------------
create table production_logs (
  id            uuid primary key default gen_random_uuid(),
  device_id     text not null,
  device_index  int  not null,
  quantity      int  not null default 1,
  logged_at     timestamptz not null,
  synced_at     timestamptz not null default now()
);

create index production_logs_device_idx on production_logs (device_id, logged_at);
create index production_logs_time_idx   on production_logs (logged_at);

comment on table production_logs is
  'Raw detection events from ESP32 production counters.';

-- ---------------------------------------------------------------------
-- RLS — production_device_config (dashboard users only)
-- ---------------------------------------------------------------------
alter table production_device_config enable row level security;

create policy read_device_config on production_device_config
  for select to authenticated using (true);

create policy manage_device_config on production_device_config
  for all to authenticated
  using (has_permission('settings.manage'))
  with check (has_permission('settings.manage'));

-- ---------------------------------------------------------------------
-- RLS — production_logs (anon device inserts, authenticated reads)
-- ---------------------------------------------------------------------
alter table production_logs enable row level security;

create policy insert_log_device on production_logs
  for insert to anon
  with check (true);

create policy read_logs_auth on production_logs
  for select to authenticated using (true);

-- Also allow authenticated users to insert (manual override / testing)
create policy insert_log_auth on production_logs
  for insert to authenticated
  with check (true);

-- ---------------------------------------------------------------------
-- Realtime: publish production_logs for live dashboard updates
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table production_logs;

-- ---------------------------------------------------------------------
-- Helper: get next available device_index for a given device_id
-- ---------------------------------------------------------------------
create or replace function next_device_index(p_device_id text)
returns int
language sql stable as $$
  select coalesce(max(device_index), 0) + 1
    from production_device_config
   where device_id = p_device_id;
$$;

comment on function next_device_index is
  'Returns the next unused device_index for a given device_id.';
