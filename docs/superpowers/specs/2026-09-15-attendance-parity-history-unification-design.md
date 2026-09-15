# Attendance Day Parity + Unified History — Design

Date: 2026-09-15
Status: Approved by product owner
Scope: one new SQL migration (0121), web payroll action/reader fixes, Expo app Workers-tab
Attendance rebuild, History screen unification. No new native modules, no app.json changes.

## 1. Problems & decisions

| # | Problem | Decision |
|---|---|---|
| 1 | Operator attendance on mobile writes rows only — the ₹ credit (hours band → `worker_transactions.attendance_pay`) that web performs never happens for mobile-marked days | New SECURITY DEFINER RPC `save_attendance_day` owns the whole save (rows + calendar + credits); BOTH web and mobile call it (single source of truth) |
| 2 | Web re-save of the same day double-credits pay (`saveDailyAttendance` upserts rows, then blindly INSERTs transactions; no delete/dedupe) | RPC uses replace-day semantics: delete that day's `attendance_pay` rows (by reference to the day's attendance rows) then re-insert per surviving rows — idempotent by construction |
| 3 | Web day-panel preload matches only `user_id` → `workers` show absent on reopen (feeds bug 2) | Reader `getDayAttendanceDetail` selects + matches `worker_id` too |
| 4 | Operators must SEE past attendance (not edit) — today mobile shows only the current day, no date navigation | Date header (stepper + month-grid sheet) in the Attendance segment; any date browsable; editable only when `date == today` (operator) — mirrors RLS `attendance_mark_today` (0119:22-28) |
| 5 | Amount per marked worker is invisible until payroll time | Live `₹` preview per row from `pay_mappings` bands (client pure helper), day totals footer; committed by the RPC on save |
| 6 | Operator History looks different from agent's | ONE History screen for every mobile role except manager/admin; segments permission-adaptive (operator reuses agent page; `history-op.tsx` deleted) |

## 2. Migration 0121_save_attendance_day.sql

`save_attendance_day(p_date date, p_shift text, p_rows jsonb) returns jsonb`
language plpgsql, `security definer`, `set search_path = public`;
`revoke ... from public, anon; grant execute ... to authenticated;` (house pattern).

`p_rows` = JSON array of
`{ "entity": "user"|"worker", "id": uuid, "status": attendance_status, "hours": numeric, "ot_hours": numeric, "note": text|null }`
(rows the operator toggled ON; absent people are simply omitted — same convention as web).

Behavior, in order, all inside one transaction:

1. Actor: `v_actor := current_app_user()`; `if v_actor is null then raise`.
2. Permission: `has_permission('hr.manage')` → any date. Else require
   `has_permission('attendance.mark') and has_permission('hr.view') and p_date = current_date`
   — else raise (`attendance day save: not authorized` / `only today can be marked`).
3. Payroll lock guard: if any attendance row of `p_date` belongs to a `payroll_lines` row
   whose run status in ('posted','paid') → raise
   `'payroll for this period is already posted - ask the office to reconcile'`
   (prevents silent ledger rewrite after accounting closed; managers then handle via office flow).
4. Calendar flip: `insert into calendar_days(date, is_working) values (p_date, true)
   on conflict (date) do update set is_working = true` — but for the today-only actor path
   enforce `p_date = current_date` (already true from step 2); hr.manage any.
5. Delete-then-insert for exactly the entities present in p_rows ∪ existing day rows:
   a. `delete from worker_transactions where type='attendance_pay' and work_date = p_date
       and (user_id, worker_id) belongs to an entity listed in p_rows`
       — scoped per-entity so other people's manual adjustments untouched. (Ledger rows
       reference attendance via reference_id; delete keyed on work_date + entity + type.)
   b. `delete from attendance where work_date = p_date and (user_id|worker_id) in p_rows entities`
   c. For each p_row (skip none — all submitted rows were toggled ON): upsert
      `attendance` (xor user_id/worker_id, work_date, status, hours, ot_hours,
      shift = p_shift, note, created_by = v_actor) selecting the new id;
      then ONLY for status in ('present','half_day') insert
      `worker_transactions(user_id|worker_id, type='attendance_pay', work_date=p_date,
      amount = band, reference_id = attendance_id,
      note = 'Attendance '||p_date||' — '||hours||'h (+'||ot||'h OT)')`
      where band = first `pay_mappings` row (order by hours_min) with
      `hours_min <= h < hours_max` (h = hours; NO h → 0; leave/holiday/week_off rows are
      recorded but NOT credited — matches `compute_payroll` semantics, 0068:69-77, and
      fixes the latent ₹300-on-zero-hours band gift).
      Track per-row amount in a `v_out jsonb` array.
6. `write_audit('post','attendance', p_date::text, format('Attendance saved for %s (%s rows, ₹%s credited)', ...), jsonb_build_object('date',p_date,'shift',p_shift,'rows',v_count,'credited',v_total), v_actor)`.
7. Return `jsonb_build_object('date', p_date, 'rows', v_count, 'credited_total', v_total, 'lines', v_out)` where each `lines` element = `{entity,id,status,hours,ot_hours,amount}`.

Readers used by clients already exist under `hr.view`: `shift_templates`, `pay_mappings`,
`attendance` (`read_attendance` 0026:265), `calendar_days` (0069), `list_payroll_people()`
(0070:100, SECURITY DEFINER, mobile db-types ✓).

Apply to live `wmpxwpubfxpexybqnynz` via MCP (controller), same as 0120.

## 3. Web changes (fix bugs 2 & 3, adopt RPC)

- `app/src/lib/actions/payroll.ts`: `saveDailyAttendance` keeps its signature/UX but its
  body becomes: build `p_rows` from `present` entries (map to entity/id/status/hours/ot/note)
  → `supabase.rpc("save_attendance_day", {...})` → return `res.error` as before. Delete the
  old inline upsert+ledger insert code (single implementation lives in SQL now).
  `markCalendarDay` call at the UI site stays (harmless; RPC also flips).
- `app/src/lib/data/payroll.ts` `getDayAttendanceDetail` (:437-471): select `user_id,
  worker_id` + workers join for names; match rows by BOTH id spaces so worker entities
  preload correctly.
- Gates: `npm run typecheck`, `npm run build`.

## 4. Mobile Workers tab — Attendance segment rebuild (`(tabs)/workers.tsx`)

Layout, top → bottom:

1. **Date header**: `‹` `›` day steppers + centered button (opens **MonthSheet**) — defaults
   today, never auto-jumps while editing. MonthSheet = custom 7×6 grid (no new deps):
   weekday row, prev/next month arrows, today ring, selected fill, small dot under days that
   have calendar-days entries (green working / grey off from `useCalendarDays(y,m)`).
   Choosing a date closes the sheet. Date shown `dateIST`.
2. **Shift dropdown** (`useShiftTemplates()`): label `Warehouse Day (09:00–18:00, 9h)`;
   picking sets `selectedShift` and bulk-fills `hours` for every currently-toggled row
   (client-side; value stored as template NAME in rows, per web convention).
3. **Roster** from `usePayrollPeople()` (`list_payroll_people` RPC — excludes
   `exclude_from_payroll`, includes users+workers). Each row: avatar-ish dot, name, kind tag.
   Toggle → editor expands (web-like inline editing, mobile sheet per row is fine ONLY if
   space forces it; preferred: row shows compact controls directly):
   - status chips P · ½ · L · H · W (present, half_day, leave, holiday, week_off) — chips
     only after toggling ON (matching DayRecordPanel behavior); toggling OFF = remove mark;
   - Hours stepper (`- 9.0 h +`, 0.5 steps) prefilled from shift; OT stepper same;
   - Note input (single line, optional);
   - **Live amount pill**: `payForHours(payMappings, hours)` → `₹500`; hidden when status is
     L/H/W (not credited) or OFF; small `ℹ bands from office settings` caption.
   - Reuse pure `checkCountPost`-style purity: new helper `payForHours` in
     `src/lib/opBuilders.ts` (bands sorted client-side; half_day uses its own hours).
4. **Footer**: `Present {n} · Half {n} · Credited ₹{total}` + **Save day** button
   (minHeight 48; disabled unless today-mode + ≥1 row + not busy). Save =
   `saveAttendanceDay(date, shiftName, rows)` → success toast with returned credited_total,
   invalidate attendance/payroll keys, banner flips to Recorded.
5. **Past dates (or future)**: everything renders READ-ONLY — marks, hours, amounts, day
   totals visible; inputs disabled; caption at top:
   "View only — attendance can be changed on the day itself (or by the office)."
   Same rule client-side as RPC step 2 (server is the boundary).
6. Data hooks (new, `src/data/payroll.ts` split from operator.ts to keep files focused):
   `useShiftTemplates`, `usePayMappings`, `usePayrollPeople`, `useAttendanceForDate(date)`
   (rows incl. entityId/entityType/status/hours/ot/note for prefill),
   `useCalendarDays(year, month)`, `saveAttendanceDay(...)` → RPC. qk factories for each.
7. Workers segment: Add-worker sheet gains **Address** field (4 fields like web;
   `workers.address` confirmed in mobile db-types Insert). `list_payroll_people()` is
   `Args: never` in mobile db-types — call as `supabase.rpc("list_payroll_people")`.
8. Payroll segment unchanged (read-only runs + lines sheet).

Invalidations after save: opAttendanceToday/attendance-for-date, opStaff, payroll runs
(balances), opTodayProduction not needed; add `qk.attendanceDay(date)` family.

## 5. Mobile History unification (B1)

Single `(tabs)/history.tsx`; delete `(tabs)/history-op.tsx` and its OPERATOR_SCREENS entry
(tab id `history` stays for operators — layout maps it to the unified screen).

Adaptive parts (everything else = today's agent page, byte-for-byte behavior for agents):
- **Activity**: base rows = own sales/collections (`useMyActivity`); if
  `can("production.run")` merge `useMyRuns` via existing tested `mergeOperatorActivity`
  (run icon/row rendering moves from history-op). Agent output unchanged.
- **Handovers**: custody list + respond/cancel unchanged; action buttons:
  "Hand over cash" / "Deposit" sheet only when `can("cash.transfer")` (operator lacks →
  hidden, no dead buttons); "Stock handover" sheet when `can("stock.transfer")` (operator ✓,
  agent ✗ hidden). BalanceOverview (cash-in-hand) only for cash-transfer holders; operators
  get a compact "My stock custody" stat instead (count from custody rows) — small, honest.
- **Expenses** segment: rendered only when `can("expense.submit")` (0110 grants it to
  agent/sales only — operators and managers do not hold it; segment hidden).
- Badges/layout: layout's history pending-handover badge already uses custody — works
  for both roles; OPERATOR_SCREENS + AGENT_SCREENS both map `history` → same component.
- Regression bar: agent flow (activity groups, handover cash sheet, expenses, images) must
  not change behavior; all conditionals additive on permissions that agents already pass.

## 6. Permission truth table (who does what where)

| Action | Operator (APK) | Agent (APK) | hr.manage (web) |
|---|---|---|---|
| Browse any date attendance | read-only | — | full edit |
| Mark/save TODAY (+credits) | ✅ RPC | — | ✅ any date |
| Cash handover sheets | ✗ hidden | ✅ | n/a |
| Stock handover sheet | ✅ | ✗ hidden | n/a |
| Expenses segment | ✗ hidden | ✅ | n/a |
| Activity with runs | ✅ | sales/payments only | n/a |

## 7. Out of scope
check_in/check_out clock UI (columns unused by web too), worker edit/profile drawers,
payroll compute/post/pay in mobile, offline attendance queue, multi-day batch entry,
dark-mode-specific calendar styling beyond token reuse.

## 8. Verification
- Pure helpers jest-tested: `payForHours` (band boundaries min-inclusive/max-exclusive,
  no-band→0, hours 0 → 0 ₹ for credited statuses), `mergeOperatorActivity` (exists).
- Migration smoke via MCP on live (single script, `begin; … rollback;`): impersonate with
  `select set_config('request.jwt.claim.sub','<uuid>', true)` — (1) as an hr.manage user,
  call `save_attendance_day` for TODAY with one worker row (hours 9), assert returned
  credited_total = its band amount and exactly one `attendance_pay` row; call again,
  assert still exactly one (idempotency). (2) as an OPERATOR user, same call with
  `p_date = current_date - 1` → assert it raises "only today". All rolled back.
- Web: typecheck + build; manual: web day panel save → same-day re-save no longer doubles.
- Mobile: tsc 0, jest green, `expo export -p android` smoke; device: mark all workers with
  9h shift → see ₹500 pills → save → reopen day → rows prefilled → Workers→Payroll balances
  reflect credits; browse yesterday → read-only; operator History looks like agent's.
- Release bump 1.1.0 / versionCode 4 (new feature set), rebuild APK, install.
