# Web Attendance & Payroll Completion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make wages real: idempotent attendance-day save with live ₹ band previews, a wired Payroll tab (compute → post → pay with automatic journals), worker Pay/Advance flows that post Dr 5500 / Cr 1110|1120, and internal permission gates closing the "any user can post journals" hole.

**Architecture:** One SQL migration owns all money truth (3 new/gated definer functions + one revoke); web keeps its thin-action pattern (`'use server'` → RPC, UI never computes pay). Two pay lanes: staff = monthly `payroll_runs` (accrual), daily-wage workers = `worker_transactions` ledger (cash-out = expense).

**Tech Stack:** Next.js 14.2 app router, Supabase (typed-ish, `(supabase.rpc as any)` precedent for new functions), plpgsql, Tailwind UI kit in `components/ui`.

**Specs:** `2026-09-15-web-attendance-payroll-completion-design.md` (this plan) and `2026-09-15-attendance-parity-history-unification-design.md` §2 (save_attendance_day contract, §3 web refactor).

## Global Constraints

- Live project `wmpxwpubfxpexybqnynz`; migrations applied ONLY by the controller via Supabase MCP. Next sequence number **0121**.
- Ledger sign convention (never invert): `attendance_pay` **positive** = wage accrued (WH owes); `payment`/`advance` **negative** = cash out. `get_person_balance` = SUM(amount); green = owed, red = worker owes (advance carried).
- Accounts (exist live): 5500 Salaries - Admin (expense), 2130 Wages Payable, 1110 Cash in Hand, 1120 Bank. NO advances-receivable account — advances journal to 5500 too (expense at cash-out; totals net correctly).
- Journal helper: `post_journal(p_header jsonb, p_lines jsonb)` — lines need `account_code`, `debit`, `credit`, optional `party_type/party_id`; must balance; NEVER call it from TS (revoke lands in 0121) — only from SQL definer functions.
- Attendance edit rule everywhere: non-`hr.manage` actors may save **only `current_date`**; past dates view-only.
- Payroll RPC status flow `draft → computed → posted → paid` (0026 enum); posting is once (journal id set), pay line requires run posted.
- Web UI: reuse `components/ui` primitives (Panel/Card/Button/Table/Field/Input/Dialog/Drawer/Money/StatusBadge/useToast, `MonthPicker` from `components/payroll`). No emojis; `en-IN` number formats via `lib/format`.
- Gates per task (workdir `app`): `npm run typecheck` exit 0. Repo has NO web test runner and lint has no config — do not attempt either. Do not touch `mobile/`. Do not run `npm run build` until Task 6.
- Branch `feat/mobile-phase2`; one commit per task; controller pushes `main` at the end.

### Live function definitions (VERIFIED 2026-09-15 — copy these, they differ from repo files!)

`pay_payroll_line(p_line uuid, p_pay_from text default 'bank')` already takes cash|bank → 1110|1120, flips run to paid when all lines settle. `post_payroll_run(p_run uuid)` posts Dr 5500 / Cr 2130 per-line party. `compute_payroll(p_month date)` deletes same-period drafts, iterates `users` (NOT workers), pay_type daily|monthly logic (quoted below). None of the three has a permission gate. Bodies to copy into the redefinitions = the exact `pg_get_functiondef` outputs stored in this plan's Task 1 Step 0 file `0121-live-refs.md` (controller-provided) — insert ONLY the listed deltas.

---

### Task 1: Migration 0121 file (save_attendance_day + gates + pay_worker + revoke)

**Files:**
- Create: `app/supabase/migrations/0121_payroll_hardening_and_pay.sql`

**Interfaces:**
- Produces (live after Task 6 applies it): `save_attendance_day(p_date date, p_shift text, p_rows jsonb) returns jsonb` → `{date, rows, credited_total, lines:[{entity,id,status,hours,ot_hours,amount}]}`; `pay_worker(p_entity_type text, p_entity_id uuid, p_kind text, p_amount numeric, p_method text, p_note text, p_date date) returns uuid`; gated `compute_payroll`/`post_payroll_run`/`pay_payroll_line`; `post_journal` revoked from `authenticated, anon`. Consumed by Tasks 2-5 TS calls.
- Verify-then-compile checklist before writing (cite each in the report): `worker_transactions` columns (`type` enum values, `transaction_date`, `reference_id`, `note`, `user_id`, `worker_id`, `created_by?`, `journal_entry_id?`) from mobile `db-types.ts` AND web `database.types.ts`; `calendar_days` PK/conflict target (`date`) + `holiday_name` default NULL update semantics; `attendance` insert columns incl. `created_by`; `pay_mappings` columns.

- [ ] **Step 0 (controller, already done):** live function bodies for compute/post/pay are captured (see plan section above; exact SQL also in the task-1 brief file under the plan's SDD workspace `0121-live-refs.md`).

- [ ] **Step 1: Write the migration** — three sections:

**(1) save_attendance_day** — full body (already spec'd; hard requirements):
- actor + permission ladder: `hr.manage` ⇒ any date; else need `attendance.mark` + `hr.view` + `p_date = current_date` (exact raise strings `save_attendance_day: not authorized (attendance.mark + hr.view required)` / `save_attendance_day: only today can be marked`).
- payroll-lock guard: EXISTS( posted|paid run for month(p_date) whose lines.user_id ∈ submitted user rows ) → raise `payroll for this period is already posted - ask the office to reconcile`.
- `insert into calendar_days (date, is_working) values (p_date, true) on conflict (date) do update set is_working = true;`
- FOR each element of p_rows (fields `entity,id,status,hours,ot_hours,note`): per-entity replace — delete that entity's day `attendance_pay` txns (match on `transaction_date = p_date` + user_id/worker_id) and the attendance row, then insert attendance (`shift = p_shift`), then band credit ONLY for status in ('present','half_day'): `select amount into v_amount from pay_mappings where v_hours >= hours_min and v_hours < hours_max order by hours_min limit 1;` insert positive `attendance_pay` txn (`reference_id` = new attendance id, note `Attendance <date> - <h>h (+<ot>h OT)`), accumulate `lines` jsonb + `credited_total`.
- `write_audit('post','attendance', p_date::text, ...)`; return the jsonb object.
- Rows with empty array ⇒ nothing written except audit? No: also validate `jsonb_typeof(p_rows)='array'`; empty array is a legitimate "clear day" — but clearing ALL marks means deleting every entity's row; entities to clear = those returned by a SELECT of that day's attendance for non-hr.manage actors only (never bulk-wipe others' data). Simplify (spec-faithful): p_rows semantics = replace-per-listed-entity ONLY; full-day wipe requires the client to list every previously-marked entity (the web panel already sends the whole roster as before). Document in header comment.

**(2) Gate redefinitions** — re-emit `compute_payroll`, `post_payroll_run`, `pay_payroll_line` from the LIVE bodies with one inserted block after `begin`:
```sql
  if not has_permission('hr.manage') then
    raise exception '<name>: not authorized (hr.manage required)';
  end if;
```
plus `revoke ... grant execute ... to authenticated;` pair each. For `pay_payroll_line` keep signature incl. `default 'bank'`. In post/pay, `party_type` stays `'user'`-only (no worker party in ledger lane via these paths).

**(3) pay_worker + revoke:**
```sql
create or replace function pay_worker(p_entity_type text, p_entity_id uuid, p_kind text,
  p_amount numeric, p_method text default 'cash', p_note text default null,
  p_date date default current_date)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := current_app_user();
  v_name  text; v_txn uuid; v_je uuid;
  v_credit text := case p_method when 'cash' then '1110' when 'bank' then '1120' end;
begin
  if v_actor is null then raise exception 'pay_worker: not authenticated'; end if;
  if not has_permission('hr.manage') then raise exception 'pay_worker: not authorized (hr.manage required)'; end if;
  if p_entity_type not in ('user','worker') then raise exception 'pay_worker: entity must be user or worker'; end if;
  if p_kind not in ('payment','advance') then raise exception 'pay_worker: kind must be payment or advance'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'pay_worker: amount must be positive'; end if;
  if v_credit is null then raise exception 'pay_worker: method must be cash or bank'; end if;

  select full_name into v_name from users  where id = p_entity_id and p_entity_type = 'user';
  if v_name is null then
    select full_name into v_name from workers where id = p_entity_id and p_entity_type = 'worker';
  end if;
  if v_name is null then raise exception 'pay_worker: unknown % %', p_entity_type, p_entity_id; end if;

  insert into worker_transactions (user_id, worker_id, type, amount, transaction_date, note)
  values (case when p_entity_type='user'   then p_entity_id end,
          case when p_entity_type='worker' then p_entity_id end,
          p_kind, -p_amount, p_date,
          coalesce(nullif(trim(coalesce(p_note,'')),''),
                   'Capital ' || p_kind || ' - ' || v_name))
  returning id into v_txn;

  v_je := post_journal(
    jsonb_build_object('entry_date', p_date, 'doc_type','voucher','source','worker_pay',
                       'source_id', v_txn::text,
                       'narration', format('Worker %s: %s %s %s', p_kind, v_name,
                                           to_char(p_amount,'FM999999990.00'),
                                           case when p_entity_type='user' then '' else '(worker)' end)),
    jsonb_build_array(
      jsonb_build_object('account_code','5500','debit', p_amount, 'credit', 0,
                         'party_type', case when p_entity_type='user' then 'user' else null end,
                         'party_id',   case when p_entity_type='user' then p_entity_id::text else null end),
      jsonb_build_object('account_code', v_credit, 'debit', 0, 'credit', p_amount)));

  perform write_audit('post','worker_transactions', v_txn::text,
    format('Worker %s: %s %s (%s)', p_kind, v_name, p_amount, p_method),
    jsonb_build_object('amount', p_amount, 'method', p_method, 'journal_entry_id', v_je,
                       'entity', p_entity_type), v_actor);
  return v_txn;
end $$;
revoke all on function pay_worker(text, uuid, text, numeric, text, text, date) from public, anon;
grant  execute on function pay_worker(text, uuid, text, numeric, text, text, date) to authenticated;

revoke execute on function post_journal(jsonb, jsonb) from authenticated, anon;
```
(post_journal is SECURITY DEFINER owned by postgres; definer→definer SQL calls keep working — verified zero TS callers. Keep `postgres=X/service_role=X`.)
NOTE: `journal_lines.party_type` null handling — post_journal already nulls empty `party_type`; pass `null` keys safely (verify jsonb_build_object skips: `jsonb_build_object` INCLUDES nulls as json null → `nullif(v_line->>'party_type','')` yields NULL fine; `->>'party_type'` on json null returns SQL NULL → ok).

- [ ] **Step 2: Cross-verify every identifier** against repo type defs (web `database.types.ts` authoritative; note any live-vs-types drift in report; mobile db-types as secondary).
- [ ] **Step 3: Commit** `git add app/supabase/migrations/0121_payroll_hardening_and_pay.sql` → `feat(db): payroll security gates, save_attendance_day, pay_worker (0121)`

---

### Task 2: Web layer — band helper, day-save delegation, worker preload fix, pay actions

**Files:**
- Modify: `app/src/lib/data/payroll.ts` (add `payForHours`; fix `getDayAttendanceDetail`)
- Modify: `app/src/lib/actions/payroll.ts` (`saveDailyAttendance` → RPC; add `payWorker`; adjust `payPayrollLine` pass-through if needed)

**Interfaces:**
- Consumes: RPC names/shapes from Task 1. Produces (used by T3-T5): `payForHours(mappings: PayMapping[], hours: number): number`; `saveDailyAttendance(date: string, shiftTemplateId: string | null, rows: DailyAttendanceRow[]): Promise<ActionResult<{creditedTotal:number; lines:{entity:string;id:string;amount:number}[]}>>` (keep `DailyAttendanceRow` shape; add `entityType` if absent — READ the file); `payWorker(input: {entityType:'user'|'worker', entityId:string, kind:'payment'|'advance', amount:number, method:'cash'|'bank', note?:string, date?:string}): Promise<ActionResult<{id:string}>>`.

- [ ] **Step 1:** read both files fully; confirm `DailyAttendanceRow` fields (does it carry entityType/userId/workerId?), `PayMapping` type (hoursMin/hoursMax/amount), `unwrap` usage pattern, ActionResult shape (`{ok:true,...}|{ok:false,error}`).
- [ ] **Step 2:** add to `data/payroll.ts`:
```typescript
/** First pay_mappings band with hoursMin <= h < hoursMax, else 0. Pure, UI-preview only — the RPC owns money truth. */
export function payForHours(mappings: PayMapping[], hours: number): number {
  const h = Number(hours);
  if (!Number.isFinite(h) || h <= 0) return 0;
  const sorted = [...mappings].sort((a, b) => a.hoursMin - b.hoursMin);
  for (const m of sorted) if (h >= m.hoursMin && h < m.hoursMax) return Number(m.amount);
  return 0;
}
```
and fix `getDayAttendanceDetail` (~:437): select `id, user_id, worker_id, status, hours, ot_hours, note, shift`, join `w:workers!attendance_worker_id_fkey(full_name)`; return rows keyed so the panel can match BOTH `userId` and worker `entityId` (inspect panel consumer before choosing return shape — minimal edit).
- [ ] **Step 3:** rewrite `saveDailyAttendance` body: keep validation lines; build `p_rows`:
```typescript
    const rows = (input?.rows ?? []).filter(r => r.present); // adapt to real param list!
    const pRows = rows.map(r => ({
      entity: r.entityType ?? "user",           // use ACTUAL field name from DailyAttendanceRow
      id: r.entityId ?? r.userId,
      status: r.status, hours: Number(r.hours || 0), ot_hours: Number(r.otHours || 0),
      note: r.note?.trim() ? r.note.trim() : null,
    }));
```
shift NAME resolution: read live code — it looks up the template by id; keep the same lookup, pass `shiftName` (or null) as `p_shift`; call
```typescript
    const { data, error } = await supabase.rpc("save_attendance_day" as any, {
      p_date: date, p_shift: shiftName, p_rows: pRows,
    });
```
map to ActionResult `{ creditedTotal: Number(data?.credited_total ?? 0), lines: data?.lines ?? [] }`; `markCalendarDay` internal call may be removed (RPC does it) but KEEP the exported action (panel still calls it — harmless).
- [ ] **Step 4:** add `payWorker` action (thin wrapper over `(supabase.rpc as any)("pay_worker", {...})`, ActionResult pattern, PATHS revalidate like siblings). Verify existing `payPayrollLine(lineId)` accepts a source arg — if not, extend signature `payPayrollLine(lineId: string, payFrom: "cash" | "bank" = "bank")` → rpc args `{ p_line, p_pay_from }`.
- [ ] **Step 5:** `npm run typecheck` exit 0.
- [ ] **Step 6:** Commit `feat(web): attendance day RPC + worker preload fix + pay_worker action`

---

### Task 3: Day panel — live ₹ preview column

**Files:**
- Modify: `app/src/app/(app)/payroll/DashboardTab.tsx` (load mappings; pass down)
- Modify: `app/src/components/payroll/DayRecordPanel.tsx`

**Interfaces:** Consumes `payForHours` + `PayMapping` (T2). Produces: panel receives `payMappings: PayMapping[]`; Save handler now consumes T2's ActionResult data to toast `₹{creditedTotal} credited` and refresh.

- [ ] **Step 1:** DashboardTab: add `listPayMappings()` to its `Promise.all`, pass `payMappings` prop into DashboardClient → DayRecordPanel (thread through; DashboardClient is the middle client component — READ it first).
- [ ] **Step 2:** DayRecordPanel: new `Amount` TH + TD per row: when row `present` && status in `present|half_day` → `<Money value={payForHours(payMappings, hours)} />`, else `—`. Tiny footer under table: `≈ {Money sum}` with caption `credited on save`.
- [ ] **Step 3:** Save handler: on success toast `Day saved — ₹X credited` using ActionResult data; keep existing refresh().
- [ ] **Step 4:** typecheck; commit `feat(web): live pay-band preview in attendance day panel`

---

### Task 4: Payroll tab — runs UI + journals flow + summary strip

**Files:**
- Modify: `app/src/components/payroll/Tabs.tsx` (add `payroll` tab between workers and settings)
- Modify: `app/src/app/(app)/payroll/page.tsx` (case `"payroll"` → new server tab)
- Create: `app/src/app/(app)/payroll/PayrollTab.tsx` (server component)
- Create: `app/src/app/(app)/payroll/PayrollClient.tsx`

**Interfaces:**
- Consumes (all EXIST — verify by reading, report any mismatch): `listPayrollRuns()` (data/payroll.ts), `computePayrollRun`, `postPayrollRun`, `payPayrollLine` (+source), `getPayrollRunDetail` (actions/payroll.ts), `MonthPicker` (components/payroll — unused until now; reuse or copy its pattern), `listPayrollPeople` + `get_person_balance` via existing data fns (`getWorkersWithBalances` reuses it).
- Produces: tab `?tab=payroll` with compute/post/pay controls (hr.manage) and summary tiles for hr.view.

- [ ] **Step 1:** Read actions/payroll.ts + data/payroll.ts payroll-run pieces + MonthPicker; note exact signatures before writing.
- [ ] **Step 2:** `PayrollTab.tsx` server: month from searchParams (`?payroll=YYYY-MM-01`), `listPayrollRuns()` + per-run nothing else; compute summary tiles server-side: accrued (Σ attendance_pay amounts + Σ posted/paid runs' total_gross for month), paidOut (Σ |payment|+|advance| ledger amounts for month), netOwed (Σ balances via getWorkersWithBalances). Pass into client.
- [ ] **Step 3:** `PayrollClient.tsx`: month nav (reuse MonthPicker pattern), 3 summary tiles (Panel + Money), **Compute for {month}** button → `computePayrollRun` → refresh; runs cards (period, StatusBadge draft neutral/computed amb/posted brand/paid grn, lines count, total Gross Money); **Post** button on computed runs → `postPayrollRun`; expand run → lines table via `getPayrollRunDetail` (name, days, OT, gross, paid Money + StatusBadge); **Pay** per unpaid line → small inline Dialog: amount prefilled (net), Cash|Bank select → `payPayrollLine(lineId, source)` → toast `Paid — journal posted`. All controls `disabled` unless `canManage` (view-only otherwise, mirrors DayRecordPanel idiom).
- [ ] **Step 4:** page.tsx: `{tab === "payroll" && <PayrollTab canManage={canManage} monthParam={monthParam} />}`; Tabs.tsx TABS entry `{ id: "payroll", label: "Payroll" }` after workers.
- [ ] **Step 5:** typecheck; commit `feat(web): payroll tab - compute, post, pay with auto journals + wages summary`

---

### Task 5: Workers tab — Pay/Advance via pay_worker (± semantics, cash/bank) + legend

**Files:**
- Modify: `app/src/components/payroll/PayModal.tsx`
- Modify: `app/src/components/payroll/WorkerList.tsx`

**Interfaces:** Consumes `payWorker` action (T2). Worker entities now pay through the SAME ledger+RPC as user-entities (ledger lane).

- [ ] **Step 1:** PayModal props add `entityType: "user" | "worker"`; dialog: kind toggle (Payment|Advance), amount input prefilled `max(balance, 0)` but free (helper text when amount > balance: "Paying more than owed carries the excess as advance — balance goes negative (red)"), method select Cash (1110) / Bank (1120), optional note; submit → `payWorker(...)` → toast `Payment recorded — journal posted` / `Advance recorded`; `router.refresh()`.
- [ ] **Step 2:** WorkerList: replace recordPayment wiring with PayModal's new action; add **Advance** ghost button per row (same modal, default kind=advance — or single dialog with the toggle is enough, then just relabel the button `Pay / Advance`); keep Edit drawer untouched; legend line under stat cards: `Green: warehouse owes the worker · Red: worker owes the warehouse (advance)`.
- [ ] **Step 3:** Adjust button (ledger-only correction): small dialog amount (signed) + reason → existing `adjustBalance` action (READ its current signature first; if it needs a ledger row type 'adjustment', it exists). No journal. canManage only.
- [ ] **Step 4:** typecheck; commit `feat(web): worker pay & advance with cash/bank journals + balance legend`

---

### Task 6 (controller-only): apply, smoke, build, ship

- [ ] Apply `0121` via MCP `apply_migration` after Task 1 review.
- [ ] Smokes (rollback scripts + privilege probes):
  - `select has_function_privilege('authenticated','post_journal(jsonb,jsonb)','execute')` → **false**
  - `select has_function_privilege('authenticated','pay_worker(text,uuid,text,numeric,text,text,date)','execute')` → true
  - Idempotency: begin → set jwt claim to a real hr.manage user → save_attendance_day(today, one worker 9h) → count attendance_pay rows ==1 → run again → still ==1, credited_total stable → rollback.
  - Today-only: same script with an OPERATOR claim uuid + `current_date - 1` → expect raise 'only today'.
- [ ] `cd app; npm run build` clean; push `main` (+ feature branch) — deployment via Git (user confirmed site back up).
- [ ] Manual web pass (user): mark day with previews → save; Payroll tab compute/post/pay on a scratch month (rollback? no — real flow, user verifies trial balance stays zero-sum at /trial-balance).

## Self-Review Notes

- Spec §2a/2b/2c→T1, §3.1/3.2→T4, §3.3→T2+T3, §3.4→T2+T5, §5→T6. No spec item untasked.
- Type/field names the plan could not pre-verify (DailyAttendanceRow internals, adjustBalance signature, getPayrollRunDetail return) are explicitly READ-FIRST steps in their tasks — deliberate, with fallback described.
- Mobile intentionally absent from this plan (next phase).
