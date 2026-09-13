# Operator Role — Full Mobile Parity (APK) — Design

Date: 2026-09-13
Status: Approved by product owner
Scope: `mobile/` Expo app only. No web or Supabase schema changes; every operator
action maps to existing RPCs/tables whose RLS already permits the operator role
(verified policy-by-policy — see §6).

## 1. Goal

The plant operator's mobile role is partially wired (Jobs, Stock, post-run,
Profile work; dash-op / inv-op / stores-orders / staff screens are broken stubs
that do not compile). Give the operator a first-class 7-tab experience covering
everything the web app lets an operator do:

- See & manage inventory (read-only stock view incl. production output)
- Record sales (cash memos) and collections at the plant
- Workers: attendance marking (today only) + payroll (read-only)
- Production: job-card board, post runs, run history
- History & handovers (like the agent role, operator-flavored)
- Scan: same screen as the agent today; will become universal document scan
  (invoices, challans, …) in a later phase

Approved tab bar (7 slots, center FAB):

```
Dashboard · Orders · Inventory · [Scan] · Production · Workers · History
```

## 2. Navigation shell — `mobile/app/(tabs)/_layout.tsx`

- `OPERATOR_TABS`: 7 entries; ids `dash-op`, `orders`, `inventory`, `scan`
  (`center: true`), `production`, `workers`, `history`. Icons:
  LayoutDashboard, Store, Boxes, ScanLine (FAB), Factory, Users, History.
  (No more duplicate Factory icon; Profile/Menu icons drop out with the tab.)
- `OPERATOR_SCREENS` maps the 6 non-FAB ids to screen components (§3–§9).
- `onChange`: delete the operator `run` FAB interception (Run becomes an in-tab
  action). Keep the manager `sell` interception. Scan is a normal switching tab
  for the operator (identical to the agent flow) — no push.
- `homeTab` for operators: `dash-op` (Dashboard is the landing tab).
- `mobile/app/index.tsx`: operator redirect currently targets
  `/(tabs)/jobs`; it must target `/(tabs)/dash-op` (new landing), and after the
  §7 rename the old `jobs` segment no longer exists either way.
- tabBus: nothing calls operator ids today; wire `gotoTab("history")` from the
  new-sale/new-collection success toasts is NOT done (out of scope). The bus
  stays available for screen deep-links used below.
- Badges (new): layout passes `badgeCounts` to `BottomNav` for operator role:
  `orders` = approved-but-not-fulfilled orders count, `production` = pending +
  in-progress job cards, `history` = pending transfers addressed to me.
  Counts come from queries the tabs already run (no extra polling).
- Profile: tab removed for operators; reachable via the existing header
  `UserRound` button (`HeaderRight`) present on every operator screen.
- BottomNav: add optional `compact?: boolean` prop → when 7 tabs, icon size 19
  and label font size 9. No other layout changes (slots are already `flex: 1`).
- Deletes: `mobile/app/more-op.tsx` (orphan stub, never routed),
  `mobile/app/(tabs)/_layout.tsx.bak`, `mobile/app/(tabs)/stock.tsx`
  (superseded by Inventory, §5).

## 3. Dashboard — `mobile/app/(tabs)/dash-op.tsx` (fix + extend)

Fix existing breakage first: import `useTodayProduction`/`useAttendanceToday`
from `@/data/operator` (currently wrong `@/data/production`), import
`useTheme`, instantiate `useRouter`, replace nonexistent `Cart` icon.

Sections (top → bottom), reusing existing components (`StatTile`,
`PressCard`, `SectionHeading` patterns already in the file):

1. GradientHeader "Operations" + `HeaderRight` (sync / bell / profile).
2. Production vs target progress bars per stage (blowing, filling) —
   from fixed `useTodayProduction` (§10).
3. KPI tiles: Today's Sales ₹ (cash memos), Collected ₹, Open jobs, Low stock.
4. Last 3 runs (today) with item, qty, time.
5. Attendance strip: present/absent/half-day counts; expandable name list.
6. Quick actions: Post run → push `/post-run`; Record sale → push
   `/record?mode=sale`; Record collection → push `/record?mode=collect`;
   Workers / Inventory / History → switch tabs via `gotoTab` (no routes to
   push — the tabs own those screens).

## 4. Orders — `mobile/app/stores-orders.tsx` (rewrite)

Fix imports; rebuild around two segments:

- **Orders**: `useOrders()` (exists in `@/data/sales`) — cards show order no,
  store, date, status chip, total. Actions per card only when
  `status === "approved"` (operator cannot create/approve/cancel orders):
  - Print challan → `create_challan` RPC (new hook in `@/data/challans.ts`,
    mirroring web `lib/actions/challans.ts`) then `challanPdfUrl()` opened with
    `expo-web-browser` for print/share.
  - Fulfil all & deliver → `post_delivery` RPC (same new module).
  - Fulfil as cash memo → `postInvoiceFromOrder(orderId, false)` (already in
    `@/data/sales.ts`).
  Card tap: expands the order's line items inline (header + lines via the
  existing `useOrder` hook) — no dedicated order-detail route this phase.
- **Challans**: `useChallans()` (exists in `@/data/operator.ts`) — RLS shows
  released-only for operators; a caption "Only office-released challans are
  visible" explains gaps. Actions via `set_challan_status`: printed →
  Dispatch; in_transit → Mark delivered; printed|in_transit → Cancel (Alert
  confirm). Status chips reuse `StatusBadge`.
- Header buttons: **+ Sale** → `/record?mode=sale`, **+ Collect** →
  `/record?mode=collect` (the record screen's own `can()` gating already allows
  both for operators).

## 5. Inventory — `mobile/app/inv-op.tsx` (rewrite; replaces stock tab)

- Fix syntax error (line 45), missing imports, wrong `useStockLevels({enabled})`
  call, `r.uom` → `r.unit`.
- List rows: item name, SKU · type chip, qty + unit, carrying value
  (`useStockLevels` select extended with `stock.cost`; value = qty × cost, same
  as web `app/src/lib/data/stock.ts`). Reorder bar: `qty <= reorderLevel` →
  red "Low" pill + reorder level shown as caption.
- Search box filters by item name/SKU client-side.
- Row tap → bottom `Sheet`: item name, on-hand, reorder level, unit of measure,
  and last 10 `stock_ledger` moves (new read-only `useStockLedger(itemId)` in
  `@/data/production.ts`; table is `read_all_auth` for authenticated).
- No adjustments/GRN/opening-stock actions (manager-only).

## 6. Scan — reuse agent screen

Operator `scan` tab renders the existing `mobile/app/(tabs)/scan.tsx`
component (it is role-agnostic; QR-link admin and "log visit" affordances are
already hidden by `can()` checks which resolve false for operators).
Verified: `resolve_store_qr` is SECURITY DEFINER (0111) and returns
`can_sell`/`can_collect`/`can_deliver` true, `can_visit`/`can_manage` false for
operators, so scan → store card → "Sell / Collect / Deliver" shortcuts work and
visit-check-in UI stays hidden. Store/customer table reads are `read_all_auth`.

Universal document QR (invoice/challan codes) = future phase; out of scope.

## 7. Production — `mobile/app/(tabs)/jobs.tsx` (extend; file renames to `production.tsx`)

Rename route file `(tabs)/jobs.tsx` → `(tabs)/production.tsx`; tab id
`production`. Everything that works today stays: filter chips
Pending/Running/Done + counts, Start/Cancel, `CompleteSheet` →
`postProductionRun` + `set_job_card_status`. Add:

- 4th filter chip **Runs**: lists `useRunHistory()` (§10) — last 14 days of
  `production_runs`: run no, stage, output item, qty, unit cost, posted/reversed
  status chip, date-time. Read-only; reversal is manager-only (`production.reverse`).
- Header button **Post run** → `/post-run` (absorbs the old Run FAB; the
  standalone post-run screen is unchanged).

## 8. Workers — `mobile/app/staff.tsx` (rewrite)

Implement as `(tabs)/workers.tsx` (tab screen); delete the standalone
`mobile/app/staff.tsx` that dash-op used to link to.

Fix all listed defects (missing imports, shadowed styles param, `onPress` on
`View`, bogus `{ enabled }` hook args, `claims?.userId`, undefined
`statusLabel`). Three segments (Workers | Attendance | Payroll):

- **Workers**: `useStaff()` list — name, role/job title, phone, active chip.
  Header **+ Add worker** sheet → `addWorker` (exists in `@/data/operator`;
  RLS `operator_add_workers` allows INSERT). Fields: name (required), phone,
  job title, wage-type note free-text. No worker-detail route (v1 — matches
  "not implemented for v1" note; revisit with payroll edit phase).
- **Attendance**: today's board from `useAttendanceToday()`; per-worker row with
  status chips P / A / ½ / Leave / Off → upserts via `markAttendance` (fix its
  `user_id`-missing insert-type bug). RLS limits writes to today — past days are
  not shown, caption explains office finalises history.
- **Payroll** segment: `usePayrollRuns()` list (run no, period, status chip,
  total ₹); tap → `usePayrollLines(runId)` drill-down (worker, days, gross,
  deductions, net) in a Sheet. Strictly read-only (`hr.manage` is manager-side).

## 9. History — `mobile/app/(tabs)/history-op.tsx` (new)

Operator sibling of the agent's `(tabs)/history.tsx` — same shell
(GradientHeader + `SegmentedToggle` + lists), only the relevant segments:

- **Activity**: `useMyActivity()` extended (§10) to union operator docs:
  production runs posted by me + cash memos + collections, grouped by day.
- **Handovers**: my custody rows (`useMyCustody()`) — accept/reject incoming
  transfers (`respondTransfer`), cancel own pending (`cancelTransfer`), plus
  **+ Stock handover** sheet: warehouse → me (or another user), item Dropdown +
  qty + note → `createStockTransfer` (§10; mirrors web `wh2user` panel).
  Cash handover/deposit is hidden (no `cash.transfer`).
- No Expenses segment (agent-van feature; operators have no expense RLS).

## 10. Data layer (`mobile/src/data`)

- `operator.ts`:
  - fix `useTodayProduction` wastage no-op (lines 61–63) — sum abnormal
    wastage from today's posted runs;
  - fix `markAttendance` insert type error (missing `user_id` on worker rows —
    send explicit null/`user_id` per generated types);
  - add `useRunHistory(days = 14)` → `production_runs` joined items/users,
    newest 50, key `["opRunHistory"]`;
  - add `createStockTransfer(toUserId, itemId, qty, note)` → RPC
    `create_transfer` with `type: "stock"`, `from` = warehouse branch config
    copied from web `NewTransferPanel` payload shape (wh2user);
  - `useStaff()` returns workers+users join already; keep.
- `challans.ts` (new): `createChallan(orderId)`, `dispatchChallan/setChallanStatus`
  (wrap existing RPC `set_challan_status`), `challanPdfUrl` — moved out of
  `operator.ts` for cohesion; `useChallans` moves here too.
- `production.ts`: add `useStockLedger(itemId)` (last 10 `stock_ledger` moves).
- `activity.ts`: extend `useMyActivity` with a `runs` kind when role is
  operator (single query branch by permission code, not role sniffing — gate on
  `production.run`).
- `keys.ts`: add `opRunHistory`, `opChallans`, `stockLedger` prefixes.
- `qk` invalidation matrix: post-run → jobCards + stockLevels + opTodayProduction
  + opRunHistory; create/complete challan → opOrders + opChallans; sale/collect
  → today KPIs + opOrders; markAttendance → opAttendanceToday;
  createStockTransfer → myCustody + stockLevels.
- `post-run.tsx` / `record.tsx`: switch their string-key invalidations to `qk.*`
  helpers and add the new keys per matrix.

## 11. Error handling & states

Every rewritten screen follows existing conventions: `SkeletonRows` loading,
`EmptyState`, `friendlyError(e)` toasts on failed RPCs, Alert-confirm on
destructives (cancel challan/job), disabled buttons while a mutation is
pending, `useIsFetching`-driven pull-to-refresh on all lists. No offline
write-queue this phase (Jobs/Run already assume connectivity; sync screen
exists for agent flows only).

## 12. Testing & acceptance

- `npx tsc --noEmit` clean (also proves the four broken screens compile again).
- Jest: unit tests for `useTodayProduction` wastage fix, `groupByDay` reuse in
  history-op, `createStockTransfer` payload shape (mock rpc), tab layout role →
  tab-set mapping (export the arrays and assert operator gets 7 ids incl.
  center scan).
- Manual device pass (signed release APK, adb install): 7 tabs render; post a
  run from Production and see it in Runs + Dashboard + Inventory qty change;
  record a cash memo and a collection; dispatch → deliver a challan; mark
  attendance for all workers; accept a stock handover; scan a store QR; badge
  counts update.
- Version bump per release checklist (`app.json` version + versionCode),
  prebuild not required (no app.json/plugin changes — route files live in JS).

## 13. Explicitly out of scope

Universal document QR scan; order creation/approval/cancel; official GST
invoices; stock adjustments/GRN/opening; payroll compute/post/pay; worker
edit/detail screens; expense capture; cash handovers/deposits; offline write
queue; run reversal (manager).
