# APK Attendance Rebuild + History Unification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Operator's Workers-tab Attendance becomes web-parity (date browsing with read-only past days, shift picker, roster from payroll RPC, per-row status/hours/OT/note editing with live ₹ preview, save through the idempotent RPC), and one unified History screen serves agents and operators with permission-adaptive segments.

**Architecture:** Mobile mirrors the already-live web logic: same RPC, same band rule (`hours_min <= h < hours_max`), same user daily formula (`round(salary/30,2) × factor + round(ot×rate,2)`), same permission truth (operator = today-only save, no cash/expenses/pay). Pure logic extracted into `opBuilders.ts` and unit-tested; screens verified by `tsc` + `expo export` + device pass.

**Tech Stack:** Expo SDK 57, React Native 0.86, react-query v5, supabase-js typed client, jest-expo.

**Specs:** `2026-09-15-attendance-parity-history-unification-design.md` §4–§5 (this plan) and its §2 (RPC contract — query input/output shapes below are copied from the LIVE migration).

## Global Constraints

- Live RPC (already applied, verified by controller): `save_attendance_day(p_date date, p_shift text, p_rows jsonb) returns jsonb` → `{date, rows, credited_total, lines:[{entity,id,status,hours,ot_hours,amount}]}`. Row elements `{entity:"user"|"worker", id, status, hours, ot_hours, note|null}`. Permission: hr.manage any date, else attendance.mark+hr.view TODAY only. `markAttendance` records and credits never coexist for the same day (RPC replaces).
- Band math (verified): `hours_min <= h < hours_max`, first match, else 0; hours <= 0 → 0. User daily = `round(monthly_salary/30,2)` × (present 1.0 / half_day 0.5 / else 0) + `round(ot_rate × ot_hours,2)`; leave = full daily iff within allowance else 0 (`previewDailyWage` is display-only approximation returning 0 for leave); holiday/week_off → 0.
- Attendance edit rule: non-hr.manage edits only when `dateStr === todayIST()`; all other dates strictly read-only (inputs disabled).
- Ledger signs: positive = WH owes; Save = attendance + credits only. NO payment UI on mobile (manager/web only).
- Operators never get cash/expenses/history segments they lack perms for: Expenses behind `can("expense.submit")`, cash handover behind `can("cash.transfer")`, stock handover behind `can("stock.transfer")`, runs merge behind `can("production.run")`. Permission gating via `useSession().can(code)` (exists — used by scan.tsx; do not rebuild claims).
- Mobile gates per task (workdir `mobile`): `npx tsc --noEmit` exit 0, `npm test` green (was 50/50). New pure helpers require jest tests FIRST (TDD). No new deps. No emojis; mono+tabular numbers; `moneyINR` for ₹; dates via `dateIST`/`todayIST` from `lib/format`. Touch targets ≥ 44px for primaries.
- Branch `feat/mobile-phase2`; one commit per task; controller does release (1.1.0 / versionCode 4) + install.

## File Structure

| File | Action |
|---|---|
| `mobile/src/lib/opBuilders.ts` (+ tests) | Modify: `payForHours`, `previewDailyWage`, `buildMonthGrid`, `bandLabel` if needed |
| `mobile/src/data/keys.ts` | Modify: qk.payrollShiftTemplates/payMappings/payrollPeople/dailyRates/attendanceDay/calendarMonth |
| `mobile/src/data/payroll.ts` | Create (all hooks + saveAttendanceDay wrapper) |
| `mobile/src/data/operator.ts` | Modify: addWorker gains address; useStaff kept (history names) — see note |
| `mobile/src/components/MonthSheet.tsx` | Create (custom month grid sheet) |
| `mobile/app/(tabs)/workers.tsx` | Modify: Attendance segment rebuild; Add-worker +address |
| `mobile/app/(tabs)/history.tsx` | Modify: merge operator adaptivity |
| `mobile/app/(tabs)/history-op.tsx` | Delete |
| `mobile/app/(tabs)/_layout.tsx` | Modify: OPERATOR_SCREENS history → unified screen |

**useStaff note:** `useStaff` (operator.ts) is queried from `users`+`workers` directly and misses payroll exclusions; the Attendance roster MUST come from `usePayrollPeople()` (RPC honors `exclude_from_payroll`). History names may keep `useStaff`. Task 1's implementer: grep ALL `useStaff()` callers and confirm none outside history names before deciding to leave it.

---

### Task 1: Data layer + pure helpers (TDD)

**Files:**
- Modify: `mobile/src/lib/opBuilders.ts`, `mobile/src/lib/__tests__/opBuilders.test.ts`
- Modify: `mobile/src/data/keys.ts`
- Create: `mobile/src/data/payroll.ts`
- Modify: `mobile/src/data/operator.ts` — `addWorker(input)` gains `address: string | null` (verify `workers.address` in mobile db-types Insert first; web inserts full_name/phone/aadhar_number/address)

**Interfaces:**
- Consumes: live RPC shapes (below). Produces (Tasks 2-3):
  - `payForHours(mappings: PayMapping[], hours: number): number`
  - `previewDailyWage(person: {monthlySalary: number|null; otRate: number|null}, hours: number, otHours: number, status: string): number`
  - `buildMonthGrid(year: number, month0: number): (string|null)[][]` — 6×7 ISO date strings (YYYY-MM-DD) or null pads, Monday-first, month0 0-indexed
  - `useShiftTemplates() → {id,name,startTime,endTime,totalHours}[]`
  - `usePayMappings() → {id,hoursMin,hoursMax,amount}[]`
  - `usePayrollPeople(enabled=true) → {entityType:"user"|"worker"; entityId; fullName; photoUrl; phone; aadharNumber; address}[]` via `supabase.rpc("list_payroll_people")` (db-types: `Args: never`)
  - `useUserDailyRates() → Record<userId, {monthlySalary, otRate}>` from `user_pay_config` (columns: user_id, monthly_salary, ot_hourly_rate — verify in mobile db-types before writing; if the table/type is missing there, read via `(supabase.from as any)` with tsc-safe cast like `getPayrollPeople` precedent — check how mobile handles typed RPC there first)
  - `useAttendanceForDate(dateISO: string|null) → AttendanceDayRow[]` — attendance rows for that work_date **joined with names**: attendance table has no name; join must go through two FKs the way `useAttendanceToday` does (`u:users!attendance_user_id_fkey(full_name)`, `w:workers!attendance_worker_id_fkey(full_name)` — reuse EXACTLY those embeds; returns include entityId = user_id ?? worker_id)
  - `useCalendarDays(year: number, month0: number) → Record<dateISO, boolean>` from `calendar_days` (columns date, is_working — verify in db-types)
  - `saveAttendanceDay(input: {dateISO: string; shiftName: string|null; rows: SaveRow[]}): Promise<{creditedTotal: number; lines: ...[]}>` via `(supabase.rpc as any)("save_attendance_day", { p_date, p_shift, p_rows })`; `SaveRow = {entityType, entityId, status, hours, otHours, note: string|null}`; map return `credited_total/lines` straight through
  - qk additions: `payrollShifts: () => ["opShifts"]`, `payMappings: () => ["opPayMappings"]`, `payrollPeople: () => ["opPayrollPeople"]`, `dailyRates: () => ["opDailyRates"]`, `attendanceDay: (d: string) => ["opAttendanceDay", d]`, `calendarMonth: (y: number, m: number) => ["opCalendar", y, m]`

- [ ] **Step 1: Write the failing tests** — append to opBuilders.test.ts:

```typescript
describe("payForHours", () => {
  const bands = [
    { id: "a", hoursMin: 0, hoursMax: 4, amount: 300 },
    { id: "b", hoursMin: 4, hoursMax: 8, amount: 600 },
    { id: "c", hoursMin: 8, hoursMax: 10, amount: 750 },
  ];
  it("matches min-inclusive/max-exclusive first band", () => {
    expect(payForHours(bands, 9)).toBe(750);
    expect(payForHours(bands, 8)).toBe(750);
    expect(payForHours(bands, 7.99)).toBe(600);
    expect(payForHours(bands, 0)).toBe(0);
    expect(payForHours(bands, -1)).toBe(0);
    expect(payForHours([], 9)).toBe(0);
  });
  it("ignores input order", () => {
    expect(payForHours([...bands].reverse(), 3)).toBe(300);
  });
});

describe("previewDailyWage", () => {
  const p = { monthlySalary: 18000, otRate: 75 };
  it("salary/30 factor + ot term", () => {
    expect(previewDailyWage(p, 9, 0, "present")).toBe(600);
    expect(previewDailyWage(p, 9, 2, "present")).toBe(750);
    expect(previewDailyWage(p, 9, 0, "half_day")).toBe(300);
    expect(previewDailyWage(p, 9, 0, "leave")).toBe(0);
    expect(previewDailyWage(p, 0, 2, "holiday")).toBe(150);
    expect(previewDailyWage({ monthlySalary: null, otRate: null }, 9, 0, "present")).toBe(0);
  });
});

describe("buildMonthGrid", () => {
  it("pads Monday-first with nulls and covers every day once", () => {
    const g = buildMonthGrid(2026, 8); // September 2026
    expect(g).toHaveLength(6);
    expect(g.every((r) => r.length === 7)).toBe(true);
    const days = g.flat().filter(Boolean) as string[];
    expect(days).toHaveLength(30);
    expect(new Set(days).size).toBe(30);
    expect(days[0]).toBe("2026-09-01");
    expect(days[29]).toBe("2026-09-30");
  });
  it("starts Monday: 2026-02-01 was a Sunday, so first cell is null", () => {
    const g = buildMonthGrid(2026, 1);
    expect(g[0][6]).toBe("2026-02-01");
    expect(g[0][0]).toBe(null);
  });
});
```

- [ ] **Step 2: Run to RED** — `npx jest src/lib/__tests__/opBuilders.test.ts` must fail on missing exports.
- [ ] **Step 3: Implement** — opBuilders additions:

```typescript
export interface PayMapping { id: string; hoursMin: number; hoursMax: number; amount: number }

/** First band with hoursMin <= h < hoursMax, else 0. Pure display helper — the RPC owns money. */
export function payForHours(mappings: PayMapping[], hours: number): number {
  const h = Number(hours);
  if (!Number.isFinite(h) || h <= 0) return 0;
  const sorted = [...mappings].sort((a, b) => a.hoursMin - b.hoursMin);
  for (const m of sorted) if (h >= m.hoursMin && h < m.hoursMax) return Number(m.amount);
  return 0;
}

/** User daily wage preview. Mirrors the SQL user branch exactly
 * (round(salary/30,2)×factor + round(ot×otHours,2)); leave is display-0
 * (server's paid-leave branch needs month context). */
export function previewDailyWage(
  person: { monthlySalary: number | null; otRate: number | null },
  hours: number, otHours: number, status: string,
): number {
  const salary = Number(person.monthlySalary ?? 0) || 0;
  const otRate = Number(person.otRate ?? 0) || 0;
  const h = Number.isFinite(Number(hours)) ? Number(hours) : 0;
  const otH = Number.isFinite(Number(otHours)) ? Number(otHours) : 0;
  const daily = Math.round((salary / 30.0) * 100) / 100;
  const factor = status === "present" ? 1.0 : status === "half_day" ? 0.5 : 0.0;
  return Math.round((daily * factor + Math.round(otRate * otH * 100) / 100) * 100) / 100;
}

/** 6×7 Monday-first grid of ISO date strings for year/month0, null = pad. */
export function buildMonthGrid(year: number, month0: number): (string | null)[][] {
  const daysInMonth = new Date(year, month0 + 1, 0).getDate();
  const firstDow = (new Date(year, month0, 1).getDay() + 6) % 7; // 0 = Monday
  const cells: (string | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const mm = String(month0 + 1).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    cells.push(`${year}-${mm}-${dd}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  while (cells.length < 42) cells.push(null);
  const rows: (string | null)[][] = [];
  for (let r = 0; r < 6; r++) rows.push(cells.slice(r * 7, r * 7 + 7));
  return rows;
}
```

- [ ] **Step 4: GREEN** — 50 existing + 6 new = **56/56** expected. Then write `src/data/payroll.ts` + keys + addWorker address (verify `workers.address` in mobile db-types first; if absent, keep 3 fields and report).
- [ ] **Step 5: `npx tsc --noEmit`** clean; **`npm test`** green.
- [ ] **Step 6: Commit** — `feat(mobile): payroll data layer - shifts, bands, roster, day save RPC + pure helpers`

---

### Task 2: Workers tab — Attendance rebuild + add-worker address

**Files:**
- Create: `mobile/src/components/MonthSheet.tsx`
- Modify: `mobile/app/(tabs)/workers.tsx` (Attendance segment; Add-worker sheet; keep Workers/Payroll segments)

**Interfaces:**
- Consumes Task 1 hooks + `DropdownSelect`, `Sheet`, `moneyINR`, `dateIST`, `todayIST`, `gotoTab` unchanged. Produces: full attendance UX. `markAttendance` in operator.ts must be REMOVED if no other caller (grep first; expect only workers.tsx).

**Rules (binding):**
- Default selected date = `todayIST()`; `isToday = sel === todayIST()`.
- Shift dropdown: options from `useShiftTemplates()` as `{ value: name, label: \`${name} (${start}–${end}, ${total}h)\` }`; selecting sets hours for every ON row to totalHours (client state only).
- Roster = `usePayrollPeople()`; row open state local `draft: Record<"user:id"|"worker:id", {on, status, hours, ot, note}>`; prefill from `useAttendanceForDate(sel)` (amounts from its rows echoed via the day's saved `amount`? **no** — day rows have no amount field; recompute preview client-side from mappings/rates like web).
- ATTENDANCE_SEGMENT_ACTIVE = when roster empty → EmptyState.
- Live ₹ pill: worker → `payForHours`; user → `previewDailyWage(rates[id], hours, ot, status)`; hidden for L/H/W and OFF rows.
- Footer: `Present {n} · Half {n} · ₹{sum} today` + Save (minHeight 48).
- Save disabled unless isToday && ≥1 ON row && !busy; submit `saveAttendanceDay({dateISO: sel, shiftName: shift ?? null, rows: [...]})` → toast `Day saved — {moneyINR(creditedTotal)} credited` → invalidate `qk.attendanceDay(sel)`, `qk.opAttendanceToday()`, `qk.calendarMonth(y,m)` maybe not needed; keep calendar dots static per load.
- Past/future: caption `"View only — attendance can be changed on the day itself (or by the office)."`; all inputs disabled.
- MonthSheet: props `{visible, year, month0, selected, dots: Record<string, boolean>, onPick(iso), onClose, onMonth(y, m)}`; weekday header M T W T F S S; today ring; selected fill; dot color green/grey per `dots`; arrows change month via `onMonth`; closes on pick. minHeight 44 targets for day cells where feasible (day cells ~40px tall × flex — acceptable; document in report).
- Add-worker: 4th input Address; `addWorker({fullName, phone, aadhar, address})` with null-for-blank convention kept.

- [ ] **Step 1:** MonthSheet.tsx new + workers.tsx rewrite of Attendance segment only; delete `markAttendance` import/usage; grep+remove the operator.ts export if orphaned.
- [ ] **Step 2:** `npx tsc --noEmit` clean; `npm test` green.
- [ ] **Step 3:** Commit — `feat(mobile): operator attendance parity - date picker, shift, live pay preview`

---

### Task 3: History unification

**Files:**
- Modify: `mobile/app/(tabs)/history.tsx` (adaptive segments)
- Delete: `mobile/app/(tabs)/history-op.tsx`
- Modify: `mobile/app/(tabs)/_layout.tsx` (OPERATOR_SCREENS `history` → same component)

**Interfaces:**
- Consumes: `useMyActivity`, `useMyRuns` + `mergeOperatorActivity` (existing), `useMyCustody`, `respondTransfer`/`cancelTransfer`, `createStockTransfer` (move the helper + StockHandoverSheet import path from history-op into history.tsx — decide inline: relocate `StockHandoverSheet.tsx` usage unchanged, keep file where it is), existing `HandoverSheet`/`ExpenseSheet`/`BalanceOverview` (agent current).
- Rules: Activity rows = agent's own sales/payments ALWAYS + runs merged ONLY if `can("production.run")`; Handover actions = "Hand over cash"/"Deposit" only if `can("cash.transfer")`, "Stock handover" only if `can("stock.transfer")`; `BalanceOverview` only for cash-transfer holders, compact "My stock custody" stat (count myCustody rows where type stock) else; **Expenses segment only if `can("expense.submit")`**; tab id stays `history` for both roles; agent output byte-identical behavior.
- Layout history badge stays on custody (works both roles).

- [ ] **Step 1:** Read history.tsx + history-op.tsx fully; plan the merge inline (agent parts untouched, adaptive gates explicit).
- [ ] **Step 2:** Implement; delete history-op.tsx (`git rm`); layout edit; grep for any other `history-op` importers first.
- [ ] **Step 3:** `npx tsc --noEmit` clean; `npm test` green; `npx expo export --platform android --output-dir "$env:TEMP/exp-check"` success → delete dir.
- [ ] **Step 4:** Commit — `feat(mobile): unified history for agent and operator (permission-adaptive)`

---

### Task 4 (controller-only): release 1.1.0 + install + device pass

- [ ] `app.json` 1.1.0 / versionCode 4 (+ android/app/build.gradle same).
- [ ] `gradlew assembleRelease`, `adb install -r`.
- [ ] Device checklist (operator account): Workers→Attendance mark-all with ₹ pills match charges; reopen same day prefilled; browse yesterday read-only; MonthSheet dots; History looks agent-identical for agent account too; staff add with address; badges/navigation unchanged.

## Self-Review Notes

- Design §4 (1-8) → T1 (data+helpers), T2 (screen+sheet); §5 → T3; §6 table enforced at each UI gate; §7 respected (no clock UI, no pay UI, no offline queue); 0915 Task-3 note on `markAttendance` resolved: RPC replaces it, remove if orphaned.
- `buildMonthGrid` picks Monday-first (Indian week convention); JS `getDay()` Sunday-shift applied via `(d+6)%7`.
