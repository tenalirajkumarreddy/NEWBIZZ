# Attendance & Payroll Redesign — Design Spec

**Date:** 2026-07-26
**Module:** §7.7 — Attendance & Payroll
**Status:** Draft

---

## 1. Purpose

Replace the monthly-cycle-only payroll with a real-time attendance-and-pay system for a warehouse. Every worker has a running ledger balance (positive = warehouse owes them, negative = they owe warehouse as advance). Attendance is recorded daily by selecting warehouse shift timings, ticking who's present, and auto-computing pay from hours-to-amount mappings configured in Settings. Payments happen at any time (not just month-end) via a Pay button per worker.

---

## 2. Architecture

Single page at `/payroll` with three tabs (client-side tab switcher using URL search params):

| Tab | Route Suffix | Contents |
|-----|-------------|----------|
| **Attendance Dashboard** | `?tab=dashboard` | Calendar + day recording panel |
| **Workers** | `?tab=workers` | Worker list with balances, Pay/Edit per-row, click → profile + ledger |
| **Settings** | `?tab=settings` | Pay mappings, shift templates, pay config |

All sections respect `hr.view` (read) / `hr.manage` (write) permissions.

---

## 3. Data Model — New Tables

### 3.1 `employee_profiles`
Per-worker personal details (photo, aadhar, phone, address).

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| user_id | uuid FK → users (unique) | 1:1 with users |
| photo_url | text | |
| aadhar_number | text | |
| phone | text | |
| address | text | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### 3.2 `shift_templates`
Predefined warehouse shift schedules used as defaults when recording daily attendance.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| name | text | e.g., "Warehouse Day", "Warehouse Night" |
| start_time | time | e.g., 09:00 |
| end_time | time | e.g., 18:00 |
| total_hours | numeric(4,1) | computed or manual, e.g., 9.0 |
| created_at | timestamptz | |

### 3.3 `pay_mappings`
Hours-range → amount rules for daily-wage computation. Applied in min ≤ hours < max order.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| hours_min | numeric(4,1) | inclusive lower bound |
| hours_max | numeric(4,1) | exclusive upper bound |
| amount | numeric(10,2) | pay for this bracket |
| created_at | timestamptz | |

Example rows:
- 0–4 hrs → ₹300
- 4–8 hrs → ₹600
- 8–10 hrs → ₹750
- 10–12 hrs → ₹900
- 12+ hrs → ₹1100

### 3.4 `worker_transactions`
Single unified ledger. Positive = WH owes worker (attendance credit). Negative = worker owes WH (payment made, advance given, adjustment).

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| user_id | uuid FK → users | |
| transaction_date | date | |
| type | text | `attendance_pay` / `payment` / `advance` / `adjustment` |
| amount | numeric(12,2) | positive = WH owes worker; negative = worker owes WH |
| reference_id | uuid | nullable, links to `attendance.id` or `payments.id` |
| note | text | nullable |
| created_by | uuid FK → users | nullable |
| created_at | timestamptz | |

### 3.5 `calendar_days`
Explicitly tracks working/non-working status per calendar day.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| date | date (unique) | |
| is_working | boolean | true = working day |
| holiday_name | text | nullable, e.g., "Diwali", "Sunday" |
| notes | text | |
| created_at | timestamptz | |

---

## 4. Existing Tables — No Changes

- `users` — used as-is (full_name, status, etc.)
- `attendance` — records daily attendance (user_id, work_date, shift, hours, ot_hours, status, note, check_in, check_out) — no schema changes
- `user_pay_config` — already has pay_type, monthly_salary, daily_rate, ot_hourly_rate, standard_shift_hrs, paid_leaves — no schema changes
- `payroll_runs` / `payroll_lines` — kept for monthly-employee payroll processing (existing `compute_payroll` RPC still works for monthly salary staff)

---

## 5. Page Design

### 5.1 Tab Bar

```
[ Attendance Dashboard ] [ Workers ] [ Settings ]
```

Controlled via `?tab=` search param. Default is `dashboard`. State preserved on navigation.

---

### 5.2 Tab: Attendance Dashboard

**Top:** Month picker (MonthPicker component, existing).

**Calendar Grid:**
- Navigation: prev/next month buttons
- 7-column grid (Sun–Sat)
- Each day cell shows: date number, status dot (green = is_working with attendance records, red = not a working day, amber = working day but no attendance yet)
- Click a day → opens Day Panel below

**Day Panel** (appears below calendar when a day is selected):

- **Header**: date, quick stats (total workers, present, absent)
- **Shift Selector**: dropdown of shift_templates (selecting one auto-fills start/end time and total_hours)
- **Employee Table**: one row per active user
  | Checkbox (present) | Name | Shift Timings (editable) | Hours (editable) | Computed Pay (auto) | OT (editable) |
  - Checked = present. Unchecked = absent.
  - Default timings from shift template; admin can override per-user.
  - Pay computed from hours using pay_mappings (first matching bracket).
  - Admin can also mark as half-day, leave, holiday, week-off.
- **Save Button**: saves `attendance` records for checked users + creates `worker_transactions` entries (+amount). If day was not a working day, sets `calendar_days.is_working = true`.

**Day Detail View** (existing attendance for that day):
- If the day already has attendance saved, shows the same table in read-only mode with an "Edit" button to switch to edit mode.

---

### 5.3 Tab: Workers

**Header stats:** Total active workers, total outstanding (positive balance sum), total advances (negative balance sum)

**Worker Table:**
| Photo (thumb) | Name | Current Balance | Pay | Edit |
- Balance shown in colour: green (positive = WH owes), red (negative = worker owes)
- **Pay button** → opens PayModal: amount, method (cash/bank), note. Creates `worker_transactions` entry (-amount).
- **Edit button** → opens EditProfileDrawer: photo, aadhar, phone, address fields. Saves to `employee_profiles`.

**Worker Drawer** (click a row):
- **Left panel**: Photo, name, aadhar, phone, address
- **Right panel**: Ledger table
  | Date | Type | Hours (if attendance) | Amount | Running Balance |
  - Click any attendance row → opens that day's Attendance Dashboard view
  - Running balance computed by cumulative SUM of previous entries

---

### 5.4 Tab: Settings

Three sub-sections stacked vertically:

**A) Pay Mappings** (hours → amount)
- Table with CRUD: hours_min, hours_max, amount
- Add row / edit inline / delete
- Gap alert if hours ranges overlap or have gaps

**B) Shift Templates**
- Table with CRUD: name, start_time, end_time, total_hours
- Add row / edit inline / delete

**C) User Pay Config**
- Existing PayConfigSection component
- Per-user: pay_type (monthly/daily), monthly_salary, daily_rate, ot_hourly_rate, standard_shift_hrs, paid_leaves

---

## 6. RLS / Permissions

| Table | Read (hr.view) | Write (hr.manage) |
|-------|---------------|-------------------|
| employee_profiles | ✓ | ✓ |
| shift_templates | ✓ | ✓ |
| pay_mappings | ✓ | ✓ |
| worker_transactions | ✓ | ✓ |
| calendar_days | ✓ | ✓ |

Existing `attendance`, `user_pay_config`, `payroll_runs`, `payroll_lines` — unchanged (already have RLS).

---

## 7. New Backend Functions

None. All logic is in server actions:

- **saveDailyAttendance**(date, shiftTemplateId, workers[]): upserts attendance rows + inserts worker_transactions
- **saveWorkerProfile**(userId, photo, aadhar, phone, address): upserts employee_profiles
- **recordPayment**(userId, amount, method, note): inserts worker_transactions with negative amount
- **adjustBalance**(userId, amount, note): inserts worker_transactions with type "adjustment"
- **savePayMapping**(id, hours_min, hours_max, amount): upsert
- **deletePayMapping**(id): delete
- **saveShiftTemplate**(id, name, start, end, hours): upsert
- **deleteShiftTemplate**(id): delete
- **markCalendarDay**(date, isWorking, holidayName): upsert calendar_days
- **getWorkerBalance**(userId): sum of worker_transactions.amount
- **getWorkerLedger**(userId): all transactions with running balance

---

## 8. Query Patterns

### Worker balance (for list page)
```sql
select u.id, u.full_name, coalesce(sum(wt.amount),0) as balance
from users u
left join worker_transactions wt on wt.user_id = u.id
where u.status = 'active'
group by u.id, u.full_name
order by u.full_name;
```

### Worker ledger with running balance
```sql
select wt.*,
       sum(wt.amount) over (partition by wt.user_id order by wt.transaction_date, wt.created_at rows unbounded preceding) as running_balance
from worker_transactions wt
where wt.user_id = $1
order by wt.transaction_date, wt.created_at;
```

### Day detail (attendance + pay)
```sql
select a.*, ep.photo_url, u.full_name,
       wt.amount as pay_amount
from attendance a
join users u on u.id = a.user_id
left join employee_profiles ep on ep.user_id = a.user_id
left join worker_transactions wt on wt.reference_id = a.id and wt.type = 'attendance_pay'
where a.work_date = $1
order by u.full_name;
```

---

## 9. Migration Plan

Single migration `0069_payroll_redesign.sql`:

1. Create `employee_profiles` table
2. Create `shift_templates` table
3. Create `pay_mappings` table
4. Create `worker_transactions` table
5. Create `calendar_days` table
6. Add foreign key constraints
7. Enable RLS on all new tables
8. Add RLS policies for `hr.view` and `hr.manage`
9. Seed default shift template ("Warehouse Day": 09:00–18:00, 9hrs)
10. Seed default pay mappings (0–4→300, 4–8→600, 8–10→750, 10–12→900, 12+→1100)
11. Add audit trigger for worker_transactions

---

## 10. Directory Structure (new/changed files)

```
app/src/
  lib/data/payroll.ts                     ← add readers for new tables
  lib/actions/payroll.ts                  ← add server actions
  components/payroll/
    Tabs.tsx                              ← tab bar with URL search-param state
    AttendanceCalendar.tsx                ← month calendar grid with green/red dots
    DayRecordPanel.tsx                    ← shift selector + employee table + save
    WorkerList.tsx                        ← worker table with balances, Pay, Edit
    WorkerDrawer.tsx                      ← profile + ledger drawer
    PayModal.tsx                          ← record payment modal
    EditProfileDrawer.tsx                 ← edit profile drawer
    SettingsPanel.tsx                     ← pay mappings + shift templates + pay config
    PayMappingsSection.tsx                ← CRUD table for hours→amount
    ShiftTemplatesSection.tsx             ← CRUD table for shift templates
  app/(app)/payroll/
    page.tsx                              ← tab container, renders active tab
    loading.tsx                           ← skeleton
```

Existing files to remove from the page (replaced by new design):
- ~~AttendanceSection.tsx~~
- ~~PayrollRunsSection.tsx~~
- ~~PayConfigSection.tsx~~ (moved to Settings tab)

DailyGridDrawer.tsx — kept but possibly simplified (the DayRecordPanel replaces it).

---

## 11. Edge Cases

- **Worker with zero balance**: Shows ₹0 in green — no action needed.
- **Negative balance**: Red colour, indicates advance given.
- **Overlapping pay mappings**: Warn on save; use first-match-wins at runtime.
- **Worker not found in employee_profiles**: Creates on first edit; empty fields shown.
- **Non-working day with attendance**: Recording attendance auto-marks day as working.
- **Delete pay mapping that's the only match for a bracket**: Allow; workers with those hours get ₹0 until a new mapping covers it.
- **Concurrent attendance save**: Single-attendance per day per user enforcement via DB unique constraint (existing).

---

## 12. Future Scope (not implementing now)

- PDF payslip generation
- Bulk CSV import of attendance
- WhatsApp/SMS notification to workers when payment is recorded
- Worker self-service portal (mobile app to view ledger)
