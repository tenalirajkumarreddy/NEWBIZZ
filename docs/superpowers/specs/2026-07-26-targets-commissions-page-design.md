# Targets & Commissions Page — Design Spec

**Date:** 2026-07-26
**Module:** §7.4 — Sales Targets & Commissions
**Status:** Approved

---

## 1. Purpose

Build the frontend for the Sales Targets & Commissions module. The backend
(tables, RPCs, RLS) already exists in migration `0024_targets_commissions.sql`.
The nav entry at `/commissions` exists but has no page — this spec fills that gap.

The page serves as a single hub for field managers and accountants to:

- View current-month target achievement per user
- Compute and post monthly commission runs
- Manage commission rules (per role or per user)
- Set monthly sales targets

---

## 2. Route & Structure

```
/commissions              — single hub page (no sub-routes)
```

No sub-pages. All CRUD operations (set targets, add rules, view run lines)
open in **slide‑in drawers** — consistent with the existing `Drawer` component.

---

## 3. Page Layout (top → bottom)

### 3.1 Page Header

```
<h1> Targets & Commissions </h1>
<p> {period} · {n} users with targets · ₹{totalCommission} pending </p>
```

No primary action button (actions are contextual within each section).

### 3.2 KPI Strip

Four `Kpi` cards in a horizontal row:

| Label | Value | Source |
|---|---|---|
| Total Target | ₹{sum of target_amount for current month} | `sales_targets` |
| Achievement | ₹{sum of actual revenue for current month} | `_user_commission_base('revenue')` |
| Achievement % | {pct}% | computed |
| Pending Commission | ₹{latest computed run total — 0 if none} | `commission_runs` where status=computed, ordered by period_month desc, limit 1 |

### 3.3 Achievement Table (primary section)

**Title:** "Target Achievement · {month}" with a **month selector** (defaults to
current month).

**Columns:**

| User | Target (₹) | Achieved (₹) | % | Target (cases) | Achieved (cases) | Status |
|---|---|---|---|---|---|---|

- **User** column shows name + role badge.
- **%** column shows a mini progress bar + percentage.
- **Status** — inline badge: `On Track` (≥80%), `At Risk` (50–80%), `Behind` (<50%).
- If no targets exist for the selected month, show `EmptyState`.
- The month selector uses a simple `<select>` of the last 12 months.

**Data source:** A direct batch query: join `sales_targets` with computed
`_user_commission_base()` per user for the month. No per-user RPC calls.

### 3.4 Collapsible: Commission Runs

Title: "Commission Runs" with expand/collapse toggle.

**Content when expanded:**

Table:

| Month | Status | Total Amount | Computed At | Actions |
|---|---|---|---|---|

- **Status** — `StatusBadge` mapping: draft→slate, computed→brand, posted→grn, paid→blue.
- **Actions column** (only visible with `accounting.manage`):
  - If no run exists for a month: **Compute** button → calls `compute_commissions(p_month)`
  - If status = `draft` or `computed`: **Post** button → calls `post_commission_run(p_run)`
  - If status = `draft`/`computed`/`posted`: **View lines** → opens drawer with lines table
- Each row shows a month that has a run OR the current month if no run exists.

### 3.5 Collapsible: Commission Rules

Title: "Commission Rules" with expand/collapse toggle and an **Add Rule** button
(visible with `accounting.manage`).

**Content when expanded:**

Table:

| Type | Entity | Basis | Rate | Threshold | Tiers | Status | Actions |
|---|---|---|---|---|---|---|---|

- **Type:** "Role" or "User" badge
- **Entity:** role code or user name
- **Basis:** `revenue` / `cases` / `collection`
- **Rate:** percentage
- **Threshold:** minimum base before commission kicks in
- **Tiers:** count of tiers or "—" (from `tier_json`)
- **Status:** active / inactive badge
- **Actions:** Edit (drawer), Deactivate

**Add/Edit Rule Drawer:**

Form fields:
- Rule type: radio (Role / User)
  - If Role: select from roles list
  - If User: select from active users list
- Basis: select (revenue / cases / collection)
- Rate: numeric input (%)
- Threshold: numeric input (₹)
- Tiers: optional — add row button, each row has min (₹) + rate (%)
- Status: toggle active/inactive

### 3.6 Collapsible: Set Targets

Title: "Set Monthly Targets" with expand/collapse toggle.

**Content when expanded:**

- Month selector (defaults to next month for forward planning)
- Table of active users with editable columns:

| User | Target Amount (₹) | Target Cases |
|---|---|---|

- Input fields are numeric, pre-filled with existing targets for that month
- **Save All** button at the bottom → server action upserts each row
  (`INSERT ... ON CONFLICT (user_id, period_month) DO UPDATE` via a single
  `upsert` call or loop)
- `EmptyState` if no active users found

---

## 4. Data Layer

New file: `app/src/lib/data/commissions.ts`

```typescript
export interface CommissionSummary {
  totalTarget: number;
  totalAchieved: number;
  achievementPct: number | null;
  pendingCommission: number;
}

export interface TargetAchievementRow {
  userId: string;
  userName: string;
  role: string;
  targetAmount: number;
  achievedAmount: number;
  pct: number | null;
  targetCases: number;
  achievedCases: number;
}

export interface CommissionRunRow {
  id: string;
  periodMonth: string;
  status: string;
  totalAmount: number;
  computedAt: string | null;
}

export interface CommissionLineRow {
  userId: string;
  userName: string;
  basis: string;
  baseAmount: number;
  rate: number;
  commissionAmount: number;
}

export interface CommissionRuleRow {
  id: string;
  roleCode: string | null;
  userId: string | null;
  userName: string | null;
  basis: string;
  rate: number;
  threshold: number;
  tierJson: any;
  status: string;
}

export interface SalesTargetRow {
  userId: string;
  userName: string;
  targetAmount: number;
  targetCases: number;
}
```

**Functions:**
- `getCommissionSummary(month: string)` → `CommissionSummary`
- `getTargetAchievement(month: string)` → `TargetAchievementRow[]`
- `listCommissionRuns()` → `CommissionRunRow[]`
- `getCommissionRunDetail(runId: string)` → `{ run: CommissionRunRow, lines: CommissionLineRow[] }`
- `listCommissionRules()` → `CommissionRuleRow[]`
- `getTargetsForMonth(month: string)` → `SalesTargetRow[]`
- `listActiveUsers()` → `{ id, name, roleCode }[]`
- `listRoles()` → `{ code, name }[]`

Each function uses `createClient()` + Supabase RPC or table query, wrapped with
`unwrap(res, fallback, label)`.

---

## 5. Server Actions

New file: `app/src/lib/actions/commissions.ts`

```typescript
"use server";

export async function computeCommissionRun(month: string): Promise<ActionResult<{ runId: string }>>;
export async function postCommissionRun(runId: string): Promise<ActionResult<{ journalEntryId: string }>>;
export async function saveTargets(month: string, targets: { userId: string; targetAmount: number; targetCases: number }[]): Promise<ActionResult<void>>;
export async function saveRule(data: CommissionRuleInput): Promise<ActionResult<{ id: string }>>;
export async function deactivateRule(id: string): Promise<ActionResult<void>>;
```

All actions:
- Call `revalidatePath("/commissions")` on success
- Return `ActionResult<T>` — either `{ ok: true, ... }` or `{ ok: false, error: string }`
- Use `accounting.manage` permission check before mutating

---

## 6. Permission Gating

| Action | Permission |
|---|---|
| View page, read all data | `commission.view` |
| Compute / post commission runs | `accounting.manage` |
| Create / edit / delete targets | `accounting.manage` |
| Create / edit / delete rules | `accounting.manage` |

UI gating: action buttons rendered only when `can("accounting.manage")`.

---

## 7. Components

No new UI primitives needed. The page composes from:

- `Panel` / `Card` / `SectionHeading` (from `components/ui/Card.tsx`)
- `Kpi` (from `components/ui/Kpi.tsx`)
- `Badge` / `StatusBadge` (from `components/ui/Badge.tsx`)
- `Table`, `THead`, `TBody`, `TR`, `TH`, `TD` (from `components/ui/Table.tsx`)
- `Button` (from `components/ui/Button.tsx`)
- `EmptyState` (from `components/ui/EmptyState.tsx`)
- `Drawer` (from `components/ui/Drawer.tsx`)
- `Field`, `Input`, `Select` (from `components/ui/Field.tsx`)
- `Money` / `Rupee` (from `components/ui/Money.tsx`)
- `MoneyInput` — a new wrapper component for numeric money entry
- `ProgressBar` — a new mini component for the % column

New page-specific components (in `components/commissions/`):
- `AchievementTable` — client component with month selector + table
- `CommissionRunActions` — client component for compute/post/view buttons
- `RuleDrawer` — client component form for add/edit rule
- `TargetEditor` — client component for bulk target entry

---

## 8. States & Edge Cases

### Loading
- The page is a Server Component; data fetching is async.
- Loading.tsx file renders `Skeleton` components in the page layout.

### Empty
- **No targets set:** EmptyState in Achievement table: "No targets set for {month}. Set targets in the section below."
- **No runs:** "No commission runs yet. Compute the first run from the Runs section."
- **No rules:** "No commission rules defined. Add a rule to enable commission computation."
- **No active users:** "No active users found."

### Error
- Each data reader returns fallback (empty array / zeros) via `unwrap()`.
- Server actions return `{ ok: false, error }` — toast shown by caller.
- No page crash from DB errors.

### Edge Cases
- **Month with no invoices:** achievement = 0, % = 0% (not null).
- **User with target but no rule:** shown in achievement table but skipped in runs.
- **Rule with tier_json:** rate resolved by `compute_commissions` RPC — UI shows tier count.
- **Compute when draft exists:** RPC deletes prior draft and recomputes.
- **Post when already posted:** RPC raises error — UI disables button.
- **Concurrent month change:** each section reads independently.

---

## 9. Implementation Order

1. Data layer (`lib/data/commissions.ts`) — readers
2. Server actions (`lib/actions/commissions.ts`) — mutations
3. New components (`ProgressBar`, `MoneyInput`)
4. Page-level components (`AchievementTable`, `CommissionRunActions`, `RuleDrawer`, `TargetEditor`)
5. Main page (`app/(app)/commissions/page.tsx`)
6. Loading state (`app/(app)/commissions/loading.tsx`)

---

## 10. Future Considerations (out of scope)

- Per-user commission statement view
- Export to PDF/Excel
- Notification when commission run is computed
- Mark commission run as "paid" (links to expense/payroll flow)
- Historical target vs achievement charts
