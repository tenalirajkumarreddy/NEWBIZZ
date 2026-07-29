# Attendance & Payroll Page — Design Spec

**Date:** 2026-07-26
**Module:** §7.7 — Attendance & Payroll
**Status:** Draft

---

## 1. Purpose

Build the frontend for the Attendance & Payroll module. The backend
(tables, RPCs, RLS) partially exists in migration `0026_payroll.sql` — the
`user_pay_config` table needs extending and `compute_payroll` needs rewriting
to support both Monthly and Daily pay types.

The nav entry at `/payroll` exists with permission `hr.view`.

---

## 2. Pay Model Design (backend changes)

Two pay types, stored on `user_pay_config`:

### Monthly
- `monthly_salary` — full monthly amount
- `paid_leaves` — configurable buffer (default 2). If actual leaves ≤ this,
  full salary paid. If leaves exceed, deduction per excess day:
  `salary / days_in_month × excess_leaves`
- `ot_hourly_rate` — OT paid above `standard_shift_hrs`
- Leaves counted: `absent + leave + (half_day × 0.5)`. Holiday/week_off excluded.

### Daily
- `daily_rate` — per-day amount
- `ot_hourly_rate` — OT paid above `standard_shift_hrs`
- Gross = `present_days × daily_rate + OT hours × ot_hourly_rate`

### Migration: alter user_pay_config

```sql
alter table user_pay_config add column pay_type text not null default 'monthly';
alter table user_pay_config add column daily_rate numeric(14,2) not null default 0;
alter table user_pay_config add column paid_leaves numeric(4,1) not null default 2;
```

### Migration: rewrite compute_payroll

The RPC branches on `pay_type`:

- **Daily**: `v_gross := v_present * v.daily_rate + v_ot * v.ot_rate`
- **Monthly**: 
  ```
  v_leaves := v_days_total - v_present - v_offdays
  if v_leaves <= v.paid_leaves: v_gross := v.salary + v_ot * v.ot_rate
  else: v_gross := v.salary - (v.salary / v_days_total) * (v_leaves - v.paid_leaves) + v_ot * v.ot_rate
  ```

---

## 3. Route & Structure

```
/payroll  — single hub page (no sub-routes)
```

All CRUD in drawers/modals. Same pattern as Target Editor and Rule Drawer
from the commissions module.

---

## 4. Page Layout (top → bottom)

### 4.1 Page Header

```
<h1> Attendance & Payroll </h1>
<p> {month} · {n} active employees · ₹{totalGross} gross </p>
```

### 4.2 KPI Strip

Four `Kpi` cards in a horizontal row:

| Label | Value | Source |
|---|---|---|
| Total Gross | ₹{latest run total_gross} | `payroll_runs` where status = computed/posted/paid |
| Headcount | {n} | `payroll_lines` count in latest run |
| Days Tracked | {n} days | `SELECT COUNT(DISTINCT work_date) FROM attendance` for current month |
| Pending Payroll | {n} runs | runs where status ≠ paid |

### 4.3 Pay Config Section

**Title:** "Employee Pay Settings" with collapsible toggle + **Save All** button
(visible with `hr.manage`).

**Table:**

| User | Pay Type | Salary / Daily Rate | OT Rate (/hr) | Std Shift (hrs) | Paid Leaves |
|---|---|---|---|---|---|

- **Pay Type** column shows a `Badge` ("Monthly" or "Daily").
- **Salary / Daily Rate** — inline `Input` (editable only with `hr.manage`).
- **OT Rate** — inline `Input`.
- **Std Shift** — inline `Input`.
- **Paid Leaves** — inline `Input` (only for Monthly type).

When pay type is changed via a dropdown in a drawer or inline toggle:
- Monthly shows: Salary + Paid Leaves fields
- Daily shows: Daily Rate field

**Save All** button calls `savePayConfig(entries[])` which upserts each row.

### 4.4 Attendance Section

**Title:** "Attendance · {month}" with month selector (same pattern as
AchievementSection).

Two view modes via a toggle:

**Summary view (default):**
Table per user:

| User | Present | Half-Day | Absent | Leave | Week-off | Holiday | OT hrs | % |
|---|---|---|---|---|---|---|---|---|

With a **View/Edit** button that opens a drawer.

**Daily grid drawer:**
Opens for a specific user + month. Shows one row per calendar day:

| Date | Day | Shift | Check-in | Hours | OT | Status | Note |
|---|---|---|---|---|---|---|---|
| 01 Jul | Wed | Single | 7:55 AM | 8 | 0 | Present | |
| 02 Jul | Thu | — | — | — | — | Leave | Sick |
| ... | | | | | | | |

- Status column uses a `<select>` with options matching `attendance_status` enum
- Check-in, Hours, OT are manual input fields
- Note field for remarks
- **Save** button commits all rows for this user-month via `saveAttendance`
- Holiday/Week-off rows are auto-marked but editable
- Empty days for future dates shown as "—"

### 4.5 Payroll Runs Section

**Title:** "Payroll Runs" with collapsible toggle.

**Table:**

| Month | Status | Gross Amount | Computed | Actions |
|---|---|---|---|---|

- **Status** — `StatusBadge` mapping: draft→slate, computed→brand, posted→grn, paid→blue.
- **Actions column** (with `hr.manage`):
  - **Compute** → calls `compute_payroll(p_month)` (creates/rebuilds draft run)
  - **Post** → calls `post_payroll_run(p_run)` (posts journal entry)
  - **View** → opens drawer with per-user lines
- If a run has status = posted, show per-line **Pay** buttons in the view drawer.

**Pay lines drawer:**
Table:

| User | Days | OT hrs | Gross | Paid | Actions |
|---|---|---|---|---|---|
| Kumar | 24 | 8 | ₹30,000 | ₹0 | Pay from Bank \| Pay from Cash |

- **Pay from Bank** → calls `pay_payroll_line(lineId, 'bank')`
- **Pay from Cash** → calls `pay_payroll_line(lineId, 'cash')`
- Status badge: Unpaid / Paid

---

## 5. Data Layer

New file: `app/src/lib/data/payroll.ts`

```typescript
export interface PayConfigRow {
  userId: string;
  userName: string;
  payType: "monthly" | "daily";
  monthlySalary: number;
  dailyRate: number;
  otHourlyRate: number;
  standardShiftHrs: number;
  paidLeaves: number;
}

export interface AttendanceRow {
  id: string | null;
  userId: string;
  userName: string;
  workDate: string;
  shift: string | null;
  checkIn: string | null;
  hours: number;
  otHours: number;
  status: string;
  note: string | null;
}

export interface AttendanceSummary {
  userId: string;
  userName: string;
  present: number;
  halfDay: number;
  absent: number;
  leave: number;
  weekOff: number;
  holiday: number;
  otHours: number;
  pct: number;
}

export interface PayrollRunRow {
  id: string;
  periodMonth: string;
  status: string;
  totalGross: number;
  computedAt: string | null;
  journalEntryId: string | null;
}

export interface PayrollLineRow {
  id: string;
  userId: string;
  userName: string;
  daysPresent: number;
  otHours: number;
  gross: number;
  net: number;
  paidAmount: number;
  paidJournalId: string | null;
}
```

**Functions:**
- `listPayConfigs()` → `PayConfigRow[]`
- `getAttendanceForMonth(month)` → `AttendanceRow[]`
- `getAttendanceSummary(month)` → `AttendanceSummary[]`
- `getAttendanceForUserMonth(userId, month)` → `AttendanceRow[]`
- `listPayrollRuns()` → `PayrollRunRow[]`
- `getPayrollRunDetail(runId)` → `{ run, lines }`

### 6. Server Actions

New file: `app/src/lib/actions/payroll.ts`

```
savePayConfig(configs[])    → upsert user_pay_config per user
saveAttendance(records[])   → upsert attendance (ON CONFLICT user_id, work_date)
computePayrollRun(month)    → calls compute_payroll RPC
postPayrollRun(runId)       → calls post_payroll_run RPC
payPayrollLine(lineId, payFrom) → calls pay_payroll_line RPC
```

---

## 7. Permission Gating

| Action | Permission |
|---|---|
| View page, read all data | `hr.view` |
| Edit pay config | `hr.manage` |
| Edit attendance | `hr.manage` (or own for self-check-in) |
| Compute / post / pay payroll | `hr.manage` |

UI gating: action buttons rendered only when `can("hr.manage")`.

---

## 8. Components

New components in `components/payroll/`:
- `PayConfigSection` — editable table + Save All
- `AttendanceSection` — month selector + summary table + daily grid drawer
- `DailyGridDrawer` — per-user daily attendance editor
- `PayrollRunsSection` — runs list + compute/post/view/pay
- `PayLinesDrawer` — per-line payment drawer

New UI primitive:
- None needed — reuses everything from commissions (ProgressBar, etc.)

---

## 9. States & Edge Cases

### Empty
- **No pay configs:** "No pay configs set. Configure employee pay settings below."
- **No attendance:** "No attendance recorded for {month}. Mark attendance to compute payroll."
- **No runs:** "No payroll runs yet. Compute the first run from the Payroll Runs section."

### Edge Cases
- **User with no pay config:** skipped by `compute_payroll` — UI shows warning in pay config section.
- **Future dates in attendance:** not shown (work_date filter).
- **Month with zero working days:** N/A (every month has ≥28 days).
- **Unpaid lines after run posted:** Pay button remains enabled until all lines paid.
- **Re-compute after posting:** RPC deletes only draft runs — requires re-posting flow.

---

## 10. Implementation Order

1. Migration: alter `user_pay_config`, rewrite `compute_payroll`
2. Data layer (`lib/data/payroll.ts`)
3. Server actions (`lib/actions/payroll.ts`)
4. Page components (PayConfigSection, AttendanceSection, DailyGridDrawer, PayrollRunsSection, PayLinesDrawer)
5. Main page (`app/(app)/payroll/page.tsx`)
6. Loading state (`app/(app)/payroll/loading.tsx`)

---

## 11. Migration SQL

Moved to appendix — will be created as
`app/supabase/migrations/0095_payroll_paytype_support.sql`.
