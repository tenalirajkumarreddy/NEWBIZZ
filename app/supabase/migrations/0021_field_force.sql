-- =====================================================================
-- 0021_field_force.sql  ·  Phase 4 — Routes, Visits, Sessions + Fleet  (§7.1, §7.2)
--
-- Organise field delivery/collection into routes, track agent sessions and
-- per-store visits, and give the delivery fleet a home so fuel/maintenance
-- attribute to a vehicle.
--
-- OFFLINE MODEL (fixes audit 5.3): offline is READ + CAPTURE-INTENT only. A
-- visit (navigate, mark-visited, GPS, notes) may sync last-write-wins; MONEY /
-- STOCK mutations (sale posting, payments) are NEVER offline and NEVER LWW —
-- they stay server-authoritative through the existing RPCs (post_invoice,
-- record_receipt). This migration deliberately holds NO money: routes/visits
-- are operational records that *link back* to financial docs via nullable
-- visit_id (added on those tables in a later app-layer wiring step / kept
-- nullable here). Only post_fuel_log touches the ledger (a vehicle-attributed
-- running expense), mirroring the Phase 2 expense pattern.
-- =====================================================================

-- ---------------------------------------------------------------------
-- routes + assignment history.  customer_stores.route_id already exists
-- (forward-declared in 0006) as the cached CURRENT assignment; the history
-- lives in customer_store_routes.
-- ---------------------------------------------------------------------

-- settings.manage already exists in the permissions catalog but is held only by
-- admin implicitly; grant it to manager so route/vehicle masters are editable
-- without admin. Idempotent.
insert into role_permissions (role_id, permission, scope)
select r.id, 'settings.manage', 'all' from roles r where r.code = 'manager'
on conflict (role_id, permission) do nothing;

create table routes (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  is_default  boolean not null default false,
  status      text not null default 'active',
  created_by  uuid references users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz
);
create unique index routes_one_default on routes (is_default) where is_default;
comment on table routes is 'Named delivery/collection routes; customer_stores.route_id caches the current assignment.';

create table customer_store_routes (
  id                uuid primary key default gen_random_uuid(),
  customer_store_id uuid not null references customer_stores(id) on delete cascade,
  route_id          uuid not null references routes(id),
  assigned_at       timestamptz not null default now(),
  unassigned_at     timestamptz,                       -- null = current
  created_by        uuid references users(id)
);
create index csr_store_idx on customer_store_routes (customer_store_id, assigned_at);
create index csr_route_idx on customer_store_routes (route_id) where unassigned_at is null;
comment on table customer_store_routes is 'Store↔route assignment history; open row (unassigned_at null) is authoritative.';

-- now that routes exists, wire the cached FK on customer_stores
alter table customer_stores
  add constraint customer_stores_route_fk
  foreign key (route_id) references routes(id);

-- ---------------------------------------------------------------------
-- route_sessions — an agent working a route on a day.
-- ---------------------------------------------------------------------
create type route_session_status as enum ('pending','active','paused','completed','cancelled');

create table route_sessions (
  id                uuid primary key default gen_random_uuid(),
  route_id          uuid not null references routes(id),
  agent_id          uuid not null references users(id),
  status            route_session_status not null default 'pending',
  started_at        timestamptz,
  paused_at         timestamptz,
  resumed_at        timestamptz,
  ended_at          timestamptz,
  stores_planned    int not null default 0,
  stores_completed  int not null default 0,
  total_distance_km numeric(10,2) not null default 0,
  total_duration_min int not null default 0,
  created_by        uuid references users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz
);
create index route_sessions_agent_idx on route_sessions (agent_id, started_at);
create index route_sessions_route_idx on route_sessions (route_id, started_at);

-- ---------------------------------------------------------------------
-- visits — one store touch inside a session. AUTH record, but no money:
-- financial docs reference the visit, not the other way round.
-- ---------------------------------------------------------------------
create type visit_type as enum ('fulfill_order','collect_payment','record_sale','mark_visited');

create table visits (
  id                uuid primary key default gen_random_uuid(),
  route_session_id  uuid not null references route_sessions(id) on delete cascade,
  customer_store_id uuid not null references customer_stores(id),
  agent_id          uuid not null references users(id),
  visited_at        timestamptz not null default now(),
  visit_type        visit_type not null default 'mark_visited',
  no_business_reason text,                              -- if nothing transacted
  no_business_note  text,
  lat               numeric(9,6),
  lng               numeric(9,6),
  duration_min      int not null default 0,
  created_at        timestamptz not null default now()
);
create index visits_session_idx on visits (route_session_id);
create index visits_store_idx   on visits (customer_store_id, visited_at);
comment on table visits is 'Per-store field visit (capture-intent-safe). Orders/receipts link here via nullable visit_id; money never posts here.';

-- ---------------------------------------------------------------------
-- Fleet (§7.2): vehicles the routes run on. Vehicle can later be linked to a
-- fixed asset (§6.6, not built) via linked_asset_id — kept nullable, no FK yet.
-- ---------------------------------------------------------------------
create type vehicle_ownership as enum ('owned','hired');

create table vehicles (
  id             uuid primary key default gen_random_uuid(),
  reg_no         text not null unique,
  type           text,                                 -- van / truck / bike
  capacity       text,                                 -- free-text (cases / litres)
  owned_or_hired vehicle_ownership not null default 'owned',
  status         text not null default 'active',
  linked_asset_id uuid,                                -- → fixed_assets(id) when §6.6 lands
  created_by     uuid references users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz
);
comment on column vehicles.linked_asset_id is 'Reserved for §6.6 fixed_assets link (module not built yet); no FK until then.';

create table trips (
  id               uuid primary key default gen_random_uuid(),
  vehicle_id       uuid not null references vehicles(id),
  driver_user_id   uuid references users(id),
  route_session_id uuid references route_sessions(id),
  trip_date        date not null default current_date,
  start_km         numeric(10,1),
  end_km           numeric(10,1),
  notes            text,
  created_by       uuid references users(id),
  created_at       timestamptz not null default now(),
  check (end_km is null or start_km is null or end_km >= start_km)
);
create index trips_vehicle_idx on trips (vehicle_id, trip_date);

-- fuel_logs: a fuel purchase attributed to a vehicle. Its ledger side is the
-- journal posted by post_fuel_log (Dr 5540 Vehicle Running / Cr cash|bank).
-- expense_id is reserved for the §5.6 expenses module (not built); we store
-- the journal_entry_id we actually post so the link is real today.
create table fuel_logs (
  id               uuid primary key default gen_random_uuid(),
  vehicle_id       uuid not null references vehicles(id),
  trip_id          uuid references trips(id),
  log_date         date not null default current_date,
  litres           numeric(10,3) not null check (litres > 0),
  amount           numeric(14,2) not null check (amount > 0),
  odometer         numeric(10,1),
  journal_entry_id uuid references journal_entries(id),
  expense_id       uuid,                                -- reserved for §5.6 expenses
  created_by       uuid references users(id),
  created_at       timestamptz not null default now()
);
create index fuel_logs_vehicle_idx on fuel_logs (vehicle_id, log_date);
comment on column fuel_logs.expense_id is 'Reserved for §5.6 expenses module; journal_entry_id is the live ledger link.';

create trigger routes_touch         before update on routes         for each row execute function touch_updated_at();
create trigger route_sessions_touch before update on route_sessions for each row execute function touch_updated_at();
create trigger vehicles_touch       before update on vehicles       for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------
-- post_fuel_log(p_header) -> fuel_log id
--   header: { vehicle_id, litres, amount, log_date?, trip_id?, odometer?,
--             pay_from? ('cash'|'bank', default 'cash'), notes? }
-- Books a vehicle-attributed running expense in ONE transaction:
--   Dr 5540 Vehicle Running     amount
--      Cr 1110 Cash | 1120 Bank amount
-- Money leaves through the ledger only (Invariants 1,3,4). No stock.
-- ---------------------------------------------------------------------
create or replace function post_fuel_log(p_header jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vehicle uuid := (p_header->>'vehicle_id')::uuid;
  v_litres  numeric := (p_header->>'litres')::numeric;
  v_amount  numeric := (p_header->>'amount')::numeric;
  v_date    date    := coalesce((p_header->>'log_date')::date, current_date);
  v_pay     text    := coalesce(p_header->>'pay_from','cash');
  v_credit  text;
  v_je      uuid;
  v_log     uuid;
  v_actor   uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
begin
  if v_vehicle is null then raise exception 'post_fuel_log: vehicle_id required'; end if;
  if v_amount is null or v_amount <= 0 then raise exception 'post_fuel_log: amount must be > 0'; end if;
  if not exists (select 1 from vehicles where id = v_vehicle) then
    raise exception 'post_fuel_log: unknown vehicle %', v_vehicle;
  end if;
  v_credit := case v_pay when 'bank' then '1120' when 'cash' then '1110'
              else null end;
  if v_credit is null then raise exception 'post_fuel_log: pay_from must be cash or bank'; end if;

  v_je := post_journal(
    jsonb_build_object('entry_date', v_date, 'doc_type','voucher',
                       'source','fuel', 'narration',
                       format('Fuel: vehicle %s, %s L', v_vehicle, v_litres)),
    jsonb_build_array(
      jsonb_build_object('account_code','5540','debit', v_amount, 'credit', 0),
      jsonb_build_object('account_code', v_credit,'debit', 0, 'credit', v_amount)));

  insert into fuel_logs (vehicle_id, trip_id, log_date, litres, amount, odometer,
                         journal_entry_id, created_by)
  values (v_vehicle, nullif(p_header->>'trip_id','')::uuid, v_date, v_litres, v_amount,
          nullif(p_header->>'odometer','')::numeric, v_je, v_actor)
  returning id into v_log;

  update journal_entries set source_id = v_log where id = v_je;

  perform write_audit('post','fuel_logs', v_log::text,
            format('Fuel %s L / %s for vehicle %s', v_litres, v_amount, v_vehicle),
            jsonb_build_object('amount', v_amount, 'vehicle_id', v_vehicle), v_actor);
  return v_log;
end $$;
comment on function post_fuel_log is 'Books fuel as a vehicle-attributed running expense (Dr 5540 / Cr cash|bank), one txn. §7.2.';

-- ---------------------------------------------------------------------
-- vehicle_running_cost(vehicle, from, to) -> numeric  (fuel total per vehicle)
-- Reporting helper: cost attributable to a vehicle over a window.
-- ---------------------------------------------------------------------
create or replace function vehicle_running_cost(
  p_vehicle uuid, p_from date default null, p_to date default current_date)
returns numeric
language sql stable
set search_path = public
as $$
  select coalesce(sum(amount),0) from fuel_logs
   where vehicle_id = p_vehicle
     and (p_from is null or log_date >= p_from)
     and log_date <= p_to;
$$;

-- ---------------------------------------------------------------------
-- RLS. Routes/vehicles are operational masters readable by any authenticated
-- user; field agents create sessions/visits/trips/fuel. Money still only moves
-- through the definer RPC. Manage gate = order.create (the field/sales cap).
-- ---------------------------------------------------------------------
alter table routes               enable row level security;
alter table customer_store_routes enable row level security;
alter table route_sessions       enable row level security;
alter table visits               enable row level security;
alter table vehicles             enable row level security;
alter table trips                enable row level security;
alter table fuel_logs            enable row level security;

create policy read_all_auth on routes               for select to authenticated using (true);
create policy read_all_auth on customer_store_routes for select to authenticated using (true);
create policy read_all_auth on route_sessions       for select to authenticated using (true);
create policy read_all_auth on visits               for select to authenticated using (true);
create policy read_all_auth on vehicles             for select to authenticated using (true);
create policy read_all_auth on trips                for select to authenticated using (true);
create policy read_all_auth on fuel_logs            for select to authenticated using (true);

-- route/vehicle master upkeep: settings custodian
create policy manage_routes    on routes               for all to authenticated
  using (has_permission('settings.manage')) with check (has_permission('settings.manage'));
create policy manage_csr       on customer_store_routes for all to authenticated
  using (has_permission('settings.manage')) with check (has_permission('settings.manage'));
create policy manage_vehicles  on vehicles             for all to authenticated
  using (has_permission('settings.manage')) with check (has_permission('settings.manage'));

-- field activity: anyone who can create orders can run routes & log trips
create policy manage_sessions  on route_sessions       for all to authenticated
  using (has_permission('order.create')) with check (has_permission('order.create'));
create policy manage_visits    on visits               for all to authenticated
  using (has_permission('order.create')) with check (has_permission('order.create'));
create policy manage_trips     on trips                for all to authenticated
  using (has_permission('order.create')) with check (has_permission('order.create'));
-- fuel_logs writes go through post_fuel_log (definer); no direct-write policy.
