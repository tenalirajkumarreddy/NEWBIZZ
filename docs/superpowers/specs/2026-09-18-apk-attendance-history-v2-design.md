# APK Attendance/History v2 — Design

Date: 2026-09-18
Status: Approved by product owner
Scope: mobile only. 0122 (IST day fix) already live — no migration in this round unless a
grant check fails (see §4).

## 1. History: one page for all roles (replaces the task-3 adaptive variant)

The single screen IS today's agent `history.tsx`, rendered for every role with three
segments — Activity | Handovers | Expenses — and capability-gated content inside:

- **Activity**: own sales/collections for everyone; production-run rows merged in ONLY
  when `can("production.run")` (existing tested `mergeOperatorActivity`, unchanged).
- **Handovers**: same custody list + respond/cancel for whoever is party to the transfer.
  "Hand over cash"/"Deposit" sheets only when `can("cash.transfer")`;
  "Stock handover" sheet only when `can("stock.transfer")`. BalanceOverview (cash)
  only for cash-transfer holders; otherwise the compact stock-custody stat.
- **Expenses**: segment ALWAYS rendered. List = own expenses (read is open). Create/
  approve actions only behind their permission gates (`expense.submit` etc.);
  without them the segment shows its list + "No expenses" empty state — no dead buttons.
- Agent output must be byte-identical in behavior to today: no restructuring of agent
  blocks, only the gates. The stock handover sheet file stays where it is.
- Tab id `history` unchanged for both roles; badge wiring unchanged.
- Copy honesty: "Cash in hand" card never shows for operators; no cash vocabulary on
  operator-visible empty states.

## 2. Workers: balances on cards + worker detail sheet

Sign/color rule (user directive — NOTE: web uses the opposite legend; mobile shows its
own legend line so nobody crosses wires):
balance > 0 → WH owes the person → **RED pill** `WH owes ₹X`
balance < 0 → person owes WH → **GREEN pill** `owes ₹X`
== 0 → neutral `Settled`.

- New hook `useWorkerBalances()` in `data/payroll.ts`: `get_person_balance` per person
  in 20-batches (web pattern), returns `Record<entityId, number>`; invalidate alongside
  attendance/payroll keys. Verify `get_person_balance` EXECUTE grant includes
  `authenticated` (0087:91,103 suggest yes — task must confirm or the cards break).
- Workers segment header adds legend: `Red: warehouse owes them · Green: they owe the warehouse`.
- Tap card → **WorkerSheet** (shared `Sheet`): profile block (name, kind tag, phone,
  Aadhaar, address from `usePayrollPeople` row), section **Attendance (last 30 days)**
  via new `useAttendanceHistory(entityType, entityId)` (attendance rows for the entity,
  desc, limit 30: date, status chip, hours/OT, shift), section **Ledger** via new
  `useWorkerLedger(entityId)` (worker_transactions for the entity asc + running
  balance computed client-side exactly like web's getWorkerLedger; amounts colored
  with the same red/green rule per SIGNED row amount sign: positive (WH owes) red).
- Signed-money display rule everywhere in this surface: positive = red, negative = green.
- Read-only, no mutations in the sheet.

## 3. Attendance segment restyle (Operate mode — presentation only)

No data/query/mutation changes. Restructure per operate.md (earned familiarity,
restrained color, every control with default/active/disabled states, skeleton not
spinners, empty states that teach):
- Sticky header card: date button (full date + "· Today" marker) + month arrows in one
  row; shift DropdownSelect below with its timings visible; past-date banner becomes a
  proper info strip ("View only — …"), not small caption text.
- Roster rows: two-line hierarchy — name + kind/status line, then a control row:
  status chips as a true segmented control (single selected fill), hours/OT as
  labelled steppers with ±44px targets, note affordance kept; **₹ pill right-aligned,
  tabular mono, green when creditable**; OFF rows collapsed to name + toggle.
- Footer: one summary strip (Present n · Half n · ₹total) + full-width sticky Save
  button with loading state; disabled state explains itself (no one marked / not today).
- Keep: MonthSheet, empty states, skeleton rows, toast copy, invalidation matrix —
  restyle only.
