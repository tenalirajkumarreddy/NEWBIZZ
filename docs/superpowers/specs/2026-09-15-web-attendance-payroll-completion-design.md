# Web Attendance & Payroll Completion — Design

Date: 2026-09-15
Status: Approved by product owner (P1 two-lane model, ± payment amounts, pay-source journals)
Scope: WEB ONLY (app/) + one migration. The APK attendance/history port stays in
`2026-09-15-attendance-parity-history-unification-design.md` §4-§5 and happens AFTER this lands.

## 1. Why (verified gaps)

1. The payroll engine exists in SQL (`compute_payroll` 0068, `post_payroll_run`/
   `pay_payroll_line` 0026, journaling Dr 5500/Cr 2130 then Dr 2130/Cr 1110|1120) but
   **no web UI ever calls it** — wages are invisible in the books.
2. Workers-tab Pay modal (`recordPayment`) and unused `recordAdvance` insert ledger rows
   with **no journal** — cash leaving is unaccounted.
3. **Security hole (live, checked)**: `compute_payroll`, `post_payroll_run`,
   `pay_payroll_line`, and raw `post_journal` are SECURITY DEFINER with
   `authenticated=X` and NO internal permission check — any signed-in user (operator,
   agent) can post journals/payroll via the REST API today. Exposing UI without gating
   inside the functions makes it worse.
4. Attendance save has the double-credit-on-resave bug + workers-entity preload bug
   (carried from the 0915 spec; the shared `save_attendance_day` RPC fixes both).
5. Day panel shows hours but not the ₹ the row will credit — user asked for the amount
   to be visible at marking time.

## 2. Migration 0121_payroll_hardening_and_pay.sql
(applied via Supabase MCP by controller to `wmpxwpubfxpexybqnynz`; house style:
security definer + `set search_path = public` + revoke/grant pairs)

### 2a. `save_attendance_day(p_date, p_shift, p_rows)` — EXACTLY per 0915 spec §2
(idempotent day replace, credits only present/half_day via pay_mappings bands,
calendar flip, payroll-posted guard, audit, per-row amounts returned).

### 2b. Security hardening — redefine with internal gates
Recreate (copy live bodies via `pg_get_functiondef` — the LIVE definitions are the
source of truth, not the repo files, which drifted) adding at the top:
- `compute_payroll`, `post_payroll_run`, `pay_payroll_line`:
  `if not has_permission('hr.manage') then raise exception '<name>: not authorized (hr.manage required)'; end if;`
- `pay_payroll_line` additionally gains `p_source text default 'cash'` (cash→1110,
  bank→1120) replacing its hard-coded credit account (keep signature-compatible
  default so nothing else breaks; overload dropped in favour of the new arg).
- `post_journal`: `revoke execute on function post_journal(...) from public, anon, authenticated;`
  (verified: no TS callsite; SQL-internal definer→definer calls run as owner, unaffected).

### 2c. `pay_worker(p_entity_type text, p_entity_id uuid, p_kind text, p_amount numeric, p_method text, p_note text, p_date date default current_date) returns uuid`
SECURITY DEFINER, gated `hr.manage` + `p_kind in ('payment','advance')`, `p_amount > 0`:
1. insert `worker_transactions` (attendance_pay|payment|advance|adjustment ledger):
   `amount = -p_amount` for BOTH payment and advance (money-out reduces what WH owes;
   overpaying a worker flips their balance negative = advance carried — the user's
   "±" semantics fall out of the ledger naturally),
   `transaction_date = p_date`, `reference_id = null`, note.
2. journal the actual cash movement (accrual was never journalled for this lane, so
   CASH-OUT IS the expense event): `perform post_journal(... 'Salaries - Admin' 5500 Dr,
   cash 1110 or bank 1120 Cr, p_date, 'Worker <kind> <name> <date>')` — same helper
   house functions use. Advance journalled to 5500 as well; correct by netting:
   later wage payment journals only the cash actually paid then, so lifetime 5500
   expense == lifetime wages cash out == ledger net zero at settlement.
3. `write_audit('post','worker_transactions', id, ...)`; return the transaction id.
`adjustBalance` (correction, no cash): stays a plain action — NO journal.

## 3. Web UI

### 3.1 `/payroll` tabs → `Attendance Dashboard | Workers | Payroll | Settings`
- `Tabs.tsx` TABS array + `page.tsx` `tab === "payroll" && <PayrollTab canManage={canManage} />`.

### 3.2 Payroll tab (new `PayrollTab.tsx` server loader + `PayrollClient.tsx`)
Loader: `listPayrollRuns()` (exists in data/payroll.ts), selected-month lines via
`getPayrollRunDetail(runId)` (exists). Month picker = the existing unused
`components/payroll/MonthPicker.tsx`.
- **Compute month**: hr.manage only → `computePayrollRun(month)` (action exists) →
  creates draft run (upsert semantics per 0068 — recompute allowed while draft/computed).
- **Run card**: period, status `StatusBadge` (draft neutral/computed amb/posted brand/
  paid grn), head count, totalGross (Money), computed_at.
- **Post** (computed → posted): `postPayrollRun` → single journal Dr 5500 / Cr 2130.
- **Lines table** (userName, days present, OT hrs, gross, state): per unpaid line
  **Pay** → dialog: amount prefilled = net, method Cash|Bank → `payPayrollLine(lineId,
  source)` → Dr 2130 / Cr 1110|1120, marks paid. Posted+all-paid → run 'paid'.
- **Wages summary strip** (three tiles): *Accrued this month* (Σ attendance_pay for
  workers + posted run gross for staff), *Paid out* (Σ |payment+advance| ledger rows +
  paid lines), *Net owed* (Σ get_person_balance over list_payroll_people) — simple
  server queries, hr.view readable.
- hr.view (no manage) sees runs/lines/summary READ-ONLY.

### 3.3 Day panel amount preview (DayRecordPanel.tsx)
`DashboardTab` additionally loads `listPayMappings()` + `listShiftTemplates()` (already)
and passes mappings down. Per row, when present & status in (present,half_day):
`Amount` cell shows client-computed band ₹ (`payForHours` — pure fn added to
`app/src/lib/data/payroll.ts`, mirrored later by mobile helper; band rule =
hours_min ≤ h < hours_max, first match, else 0) with a subtle note "credits on save".
Absent/L/H/W rows show `—`. Save response's returned `lines[].amount` replaces previews
optimistically (server is truth).

### 3.4 Workers tab
- PayModal: method becomes **Cash (1110) / Bank (1120)** select (journaled now);
  amount editable, allowed > outstanding (label: "Paying more creates an advance"),
  plus a secondary **"Advance"** mode toggle in the same dialog → all submits call
  `pay_worker` via new action `payWorker(...)` (replaces `recordPayment` body — keep
  the export name delegating, no other callers).
- WorkerList row: add **Advance** button (same dialog, kind=advance) next to Pay;
  **Adjust** button → tiny dialog → existing `adjustBalance` action (ledger-only).
- Balances already color-negative; add legend: green = WH owes worker, red = worker owes WH (advance).

## 4. Explicit non-goals (this phase)
Mobile (next phase per 0915 spec), payslip PDF, per-worker monthly statements,
advances receivable asset account (1310) — expense-at-cash-out model chosen instead,
attendance check-in/out clock UI, payroll for worker entities inside compute_payroll
(they live in the ledger lane on purpose).

## 5. Verification
- Migration: live redefinitions smoke (rollback scripts): operator JWT calling
  compute_payroll now raises; post_journal execute revoked from authenticated
  (`has_function_privilege('authenticated','post_journal(...)','execute')` = false);
  save_attendance_day idempotency per 0915 §8.
- Web: typecheck + build; manual flow end-to-end on dev: mark day (see ₹ previews) →
  save → Workers balances + summary move → Pay (cash) → trial balance 5500/1110 legs
  appear → Compute month for staff → Post (5500/2130) → Pay line (2130/1120).
- Books sanity: post_trial_balance for the month stays zero-sum (existing helper).
