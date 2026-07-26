# Fuel Refill Detection, Fraud Monitoring & Dual Trip Detection

**Date**: 2026-07-24
**Status**: Draft

## Overview

Extend the NEWBIZZ fleet module with:
1. Intelligent fuel refill detection from Intangles telemetry data
2. Fuel leak/theft alerts from sudden unexplained drops
3. Dual auto-trip detection (ignition-based + warehouse proximity-based)
4. A review workflow for admins to confirm refills, link expenses, and surface fraud
5. All configurable thresholds centralized in Fleet Settings

---

## 1. Settings (Fleet Settings Page)

All tunable thresholds stored in `company_settings.feature_flags` (existing jsonb column).
Displayed and editable on `/fleet/settings` alongside warehouse location forms.

| JSON Key | Default | Description |
|----------|---------|-------------|
| `fuel_refill_threshold_pct` | 2 | Min percentage increase in `fuel.amount` between polls to trigger a refill event |
| `fuel_leak_threshold_pct` | 5 | Min percentage decrease (ignition OFF) to trigger a leak/theft alert |
| `fraud_tolerance_pct` | 5 | Max allowed deviation between estimated litres and admin-reported litres before `fraud_alert = true` |
| `warehouse_departure_km` | 1 | Haversine distance from warehouse beyond which a warehouse trip is created |
| `warehouse_arrival_km` | 1 | Haversine distance to warehouse within which an active warehouse trip is ended |

---

## 2. Database Changes (Migration 0067)

### 2.1 `vehicle_gps_logs` — add fuel columns

```sql
alter table vehicle_gps_logs
  add column fuel_amount numeric(10,2),
  add column fuel_pct    numeric(5,2);
```

### 2.2 `fuel_refill_events` — new table

```sql
create table fuel_refill_events (
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

create index fre_vehicle_idx on fuel_refill_events (vehicle_id, detected_at desc);
create index fre_status_idx on fuel_refill_events (status) where status = 'pending';
```

### 2.3 `trips` — add category column

```sql
alter table trips
  add column category text check (category in ('ignition', 'warehouse'));
```

---

## 3. Detection Logic (runs in `cron-poller.ts` every 60s)

After inserting GPS rows into `vehicle_gps_logs` (including fuel columns), run these in order:

### 3.1 Ignition Trip Detection

For each vehicle with a GPS row inserted:
- Query the previous GPS log for that vehicle (ordered by `recorded_at` desc, skip the just-inserted row)
- If ignition changed from `false` → `true`:
  - End any active ignition trip (if one somehow exists)
  - Create a new trip with `type='auto'`, `category='ignition'`, `status='active'`, `started_at=now`
- If ignition changed from `true` → `false`:
  - Find the active ignition trip for this vehicle
  - Update it: `ended_at=now`, `status='completed'`, `distance_km` (haversine sum of GPS points during trip), `max_speed`, `avg_speed`

### 3.2 Warehouse Trip Detection

Existing logic (from `trip-detector.ts`), unchanged:
- Compare vehicle position vs warehouse location using haversine
- If > `warehouse_departure_km` and no active warehouse trip → create one (`category='warehouse'`)
- If < `warehouse_arrival_km` and active warehouse trip exists → close it

### 3.3 Fuel Refill & Leak Detection

For each vehicle with a GPS row inserted:
- Query the previous GPS log (to get previous fuel amount)
- If previous fuel_amount is null, skip (first reading)
- Calculate % change: `(new - prev) / prev * 100`
- **Refill**: if % change > `fuel_refill_threshold_pct` → create `fuel_refill_event` with `event_type='refill'`
- **Leak**: if % change < `-fuel_leak_threshold_pct` AND ignition is OFF → create `fuel_refill_event` with `event_type='leak'`
- Dedup: check if the last event for this vehicle is the same `event_type` and was created within the last 30 minutes. If so, skip (prevents re-triggering on subsequent polls).

---

## 4. Fleet Dashboard Updates (`/fleet`)

### 4.1 Vehicle List Navigation

- Single-click on a vehicle row → selects it (shows stats + map on right, current behavior)
- Click on the vehicle's `regNo` text (rendered as `<Link>`) → navigates to `/fleet/{id}`
- Keep selection state independent of navigation

### 4.2 Vehicle Activity Panel (below map)

When a vehicle is selected, show a collapsible panel below the map:

**Active Trips** (if any):
- Ignition trip: duration so far
- Warehouse trip: duration so far, distance from warehouse

**Recent Trips** (last 5):
| Type | Date | Duration | Distance | Status |
|------|------|----------|----------|--------|
| Badge (Ignition/Warehouse) | date | 2h 15m | 45.2 km | Active/Completed |

**Recent Fuel Logs** (last 5):
| Date | Litres | Amount | Rate/L |
|------|--------|--------|--------|

**Pending Refills** (count badge + first 3):
| Time | Est. Litres | Type | Action |
|------|-------------|------|--------|
| 10:30 AM | +48.2 L | Refill | Confirm | Dismiss |

---

## 5. Vehicle Detail Page Updates (`/fleet/{id}`)

### 5.1 Pending Refills Section (between Trips and Fuel Logs)

Table with columns: Detected At, Type (Refill/Leak badge), Prev Amount, New Amount, Est. Litres, Status, Actions.

Actions for `pending` rows:
- **Confirm**: opens inline form → enter ₹ paid, litres (pre-filled with estimated), receipt upload → calls `post_fuel_log` RPC → links `fuel_log_id` → sets `status='confirmed'`
- **Link Expense**: dropdown to search/select an existing `fuel_log` for this vehicle → links it → sets `status='confirmed'`
- **Dismiss**: sets `status='dismissed'`

Fraud-flagged rows (`fraud_alert = true`) rendered with red background and warning icon.

### 5.2 Trips Table (already updated)

Shows both ignition and warehouse trips with type badge, duration, distance, max/avg speed.

### 5.3 Fuel Logs Table (already exists)

Unchanged.

---

## 6. Fleet Settings Page Updates (`/fleet/settings`)

Two cards:

**Card 1: Warehouse Locations** (existing)
- List of warehouses with lat/lng inputs + "Use Current Location" button

**Card 2: Detection Thresholds** (new)
- Labeled number inputs for each of the 5 settings
- "Save Thresholds" button
- Reads/writes `company_settings.feature_flags`

---

## 7. Data Flow Summary

```
Intangles API (poll every 60s)
  │
  ▼
cron-poller.ts
  ├─ Fetch vehicles + GPS + fuel data
  ├─ Insert vehicle_gps_logs rows (incl. fuel_amount, fuel_pct)
  ├─ Run Ignition Trip Detection
  ├─ Run Warehouse Trip Detection
  └─ Run Fuel Refill/Leak Detection
       │
       ▼
    fuel_refill_events (pending)
       │
       ▼ (admin reviews on dashboard or vehicle detail page)
    Confirm → post_fuel_log() + link fuel_log_id
    or
    Link Expense → search existing fuel_log
    or
    Dismiss
```

---

## 8. RLS

- `fuel_refill_events`: readable by authenticated users with `field.view`, writable by service_role only (cron). Admin actions (confirm/dismiss) go through server actions using the authenticated user's context.
- `trips.category`: existing RLS applies.

---

## 9. Files to Create/Modify

| Action | File |
|--------|------|
| Create | `app/supabase/migrations/0067_fuel_refill_events.sql` |
| Modify | `app/src/lib/intangles/cron-poller.ts` — add fuel columns to insert, add detection calls |
| Create | `app/src/lib/intangles/fuel-detector.ts` — fuel refill/leak detection logic |
| Modify | `app/src/lib/intangles/trip-detector.ts` — add ignition trip detection |
| Modify | `app/src/app/(app)/fleet/FleetDashboard.tsx` — add vehicle activity panel below map, fix nav |
| Modify | `app/src/app/(app)/fleet/VehicleListPanel.tsx` — make regNo a link to detail page |
| Create | `app/src/app/(app)/fleet/VehicleActivityPanel.tsx` — trips + fuel logs + pending refills summary |
| Modify | `app/src/app/(app)/fleet/[id]/page.tsx` — add pending refills section |
| Create | `app/src/app/(app)/fleet/[id]/PendingRefillsSection.tsx` — review workflow UI |
| Modify | `app/src/app/(app)/fleet/settings/page.tsx` — add thresholds card |
| Create | `app/src/app/(app)/fleet/settings/ThresholdsForm.tsx` — thresholds editor |
| Create | `app/src/lib/actions/settings.ts` — server action for reading/writing feature_flags |
| Create | `app/src/lib/data/settings.ts` — data reader for feature_flags |
| Modify | `app/src/app/(app)/fleet/FleetDashboard.tsx` — pass pending refill counts, recent trips, fuel logs |
