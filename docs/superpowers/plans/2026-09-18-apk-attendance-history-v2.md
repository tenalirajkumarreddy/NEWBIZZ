# APK Attendance/History v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) Single history screen for all roles (agent page verbatim + capability gates). (2) Worker cards show signed RED/GREEN balances and open a detail sheet (profile + 30-day attendance + ledger). (3) Attendance segment Operate-grade restyle, behavior unchanged.

**Architecture:** No new RPCs. New read hooks only (`hr.view`-covered tables + `get_person_balance` RPC — verify its EXECUTE grant includes `authenticated`, else task reports BLOCKED with evidence).

**Tech Stack:** Expo SDK 57, RN 0.86, react-query v5, supabase-js typed client, jest-expo.

**Spec:** `2026-09-18-apk-attendance-history-v2-design.md` (binding, incl. the inverted-vs-web red/green rule).

## Global Constraints

- Sign/color rule on the Workers surface: positive = WH owes = RED; negative = owes WH = GREEN; zero neutral. Legend line mandatory under the segment header.
- No mutation UI added anywhere in this plan (sheets are read-only).
- Agents' history behavior byte-identical; operators lose nothing they have today (runs merge, stock sheet, custody actions).
- Mobile gates per task (workdir `mobile`): `npx tsc --noEmit` exit 0, `npm test` green (was 55/55 +14→ check count at runtime and state it). TDD for new pure helpers (running-balance computation); no new deps; no emojis; mono tabular money; ≥44px primaries.
- Branch `feat/mobile-phase2`; one commit per task; controller releases.

## File Structure

| File | Action |
|---|---|
| `mobile/src/data/payroll.ts` | Modify: `useWorkerBalances`, `useAttendanceHistory`, `useWorkerLedger` (+ qk) |
| `mobile/src/data/keys.ts` | Modify: qk.workerBalances/workerAttendance/entityLedger |
| `mobile/src/lib/opBuilders.ts` (+tests) | Modify: `runningBalances(amounts: number[]): number[]` |
| `mobile/src/features/workers/WorkerSheet.tsx` | Create (profile + attendance + ledger) |
| `mobile/app/(tabs)/workers.tsx` | Modify: balance pills + legend + sheet wiring (Workers segment only) |
| `mobile/app/(tabs)/history.tsx` | Modify: v2 gates (Expenses always rendered, capability content) |
| `mobile/app/(tabs)/workers.tsx` | Modify: Attendance restyle (Task 3, presentation only) |
| `mobile/src/components/MonthSheet.tsx` | Modify only if Task 3 needs it |

---

### Task 1: Balances + worker history/ledger reads (+ tests)

**Files:** keys.ts, data/payroll.ts, opBuilders.ts + tests.

**Interfaces:** Produces `useWorkerBalances(): Record<string, number>` (get_person_balance per entityId, 20-batches, enabled with user); `useAttendanceHistory(entityType, entityId, limit=30)` → `{dateISO,status,hours,otHours,shift,note}[]` desc; `useWorkerLedger(entityId)` → `{id,dateISO,type,amount,note,running}[]` asc with running balance; `runningBalances(amounts:number[]):number[]` pure (test: [100,-40,0] → [100,60,60]).

- [ ] Step 1: test first (RED), implement (GREEN); full suite green.
- [ ] Step 2: verify `get_person_balance` EXECUTE grant includes authenticated — read 0087:91,103 migration lines; if missing → report BLOCKED (do not invent grants; controller handles via migration).
- [ ] Step 3: verify `worker_transactions` select allowed for operator (0069 read policy hr.view — cite); tsc clean.
- [ ] Step 4: Commit `feat(mobile): worker balance + attendance/ledger history hooks`

---

### Task 2: Workers cards + WorkerSheet

**Files:** features/workers/WorkerSheet.tsx (new), (tabs)/workers.tsx (Workers segment only).

**Interfaces:** Consumes Task 1. Card = existing row + signed pill (RED `WH owes ₹X` if >0, GREEN `owes ₹X` if <0, neutral `Settled`); header legend line; tap (whole card Pressable, accessibilityRole button) → WorkerSheet with entity props. Sheet: profile block, Attendance section (status chip + hours + shift per row, EmptyState "No attendance in the last 30 days"), Ledger section (date, type label, signed amount colored by rule, running balance mono; EmptyState "No transactions yet"). Loading → SkeletonRows in each section; read-only.

- [ ] Step 1: Implement; tsc; tests green; expo export smoke for the two files' sake isn't needed (tsc covers) — skip export here (Task 3 runs it).
- [ ] Step 2: Commit `feat(mobile): worker balance pills + detail sheet`

---

### Task 3: History v2 (single page for all)

**Files:** (tabs)/history.tsx.

**Interfaces:** Diff today's agent history.tsx against pre-merge state where needed — implementer: the file was unified in commit 2c7b443; `git show <agent-version>` — find last agent-only version via `git log --oneline -- mobile/app/\(tabs\)/history.tsx` and use it as the visual baseline. Rules (spec §1): Expenses segment ALWAYS rendered (list own + gates on create); cash sheets iff can("cash.transfer"); stock sheet iff can("stock.transfer"); BalanceOverview iff cash-holder else stock stat; Activity merge iff can("production.run"); tab id/badge untouched.

- [ ] Step 1: Implement; agent-behavior parity argued in report with before/after file references.
- [ ] Step 2: tsc; tests; `expo export -p android` smoke → delete dir.
- [ ] Step 3: Commit `feat(mobile): history v2 - one page for all roles`

---

### Task 4: Attendance segment restyle (Operate, presentation only)

**Files:** (tabs)/workers.tsx (Attendance segment), MonthSheet.tsx if needed.

**Interfaces:** Zero behavior/query/mutation changes — same hooks, same save, same gates; DOM/styles restructure only. Follow operate.md: sticky header card (date+arrows, shift select, info-strip banner for past dates); roster rows (name/kind line; segmented status control; labelled ± steppers; right-aligned mono ₹ pill green-when-creditable; collapsed OFF rows); footer summary strip + sticky full-width Save with loading/disabled-explains-itself; skeletons/empties kept.

- [ ] Step 1: Restyle; tsc; tests green.
- [ ] Step 2: Commit `style(mobile): operate-grade attendance segment restyle`

---

### Task 5 (controller-only): release 1.1.1 + install + device pass

- [ ] app.json 1.1.1 / versionCode 5; assembleRelease; adb install; checklist: worker balances colors + sheet sections, history identical agent-vs-operator shells, attendance restyle states, past-date read-only intact.
