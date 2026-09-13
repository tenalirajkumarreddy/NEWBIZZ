# Operator Mobile Parity (7-Tab APK) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the plant-operator role a first-class 7-tab experience in the Expo app (`mobile/`) covering everything the web app allows an operator to do: dashboard, orders/challans + sales/collections, inventory, universal scan (agent screen reused), production jobs + run history, workers + attendance + payroll view, and activity/handover history.

**Architecture:** Single custom tab shell (`app/(tabs)/_layout.tsx` renders a role→screen map; no expo-router `<Tabs>`). All reads are typed supabase-js queries against the generated `Database` types (`src/lib/db-types.ts`); every write goes through existing SECURITY DEFINER RPCs (`rpc()` in `src/lib/rpc.ts`). Zero migrations, zero new native modules. Pure logic (aggregation, payload builders, tab definitions) is extracted into `src/lib/` modules and unit-tested with jest; screens are verified by `tsc` + device pass.

**Tech Stack:** Expo SDK 57, expo-router, React Native 0.86, TypeScript, @tanstack/react-query v5, @supabase/supabase-js v2 (typed client), lucide-react-native, jest-expo.

**Spec:** `docs/superpowers/specs/2026-09-13-operator-mobile-parity-design.md`

## Global Constraints

- Theme tokens from `DESIGN.md`; use `tokens.*` + `useTheme()` palette only — no raw hex outside `src/theme`.
- No emojis in code/UI; lucide icons only. Numbers rendered with `tokens.font.mono*` + `fontVariant: ["tabular-nums"]`; money via `moneyINR`/`moneyCompact` from `src/lib/format.ts`; dates via `dateIST`/`todayIST`.
- Money/stock/cash mutations ONLY through RPCs: `post_production_run`, `set_job_card_status`, `create_challan`, `set_challan_status`, `post_delivery`, `post_invoice`, `post_invoice_from_order`, `record_receipt`, `create_transfer`, `respond_transfer`, `cancel_transfer`. Direct table writes allowed only where RLS explicitly grants the operator: INSERT `workers` (0119), UPSERT `attendance` today-only (0119).
- Operator permission codes (verified grants): `item.view, stock.view, bom.view, production.run, production.jobs, license.view, stock.transfer, order.view, challan.view, challan.record, cashmemo.create, receipt.record, hr.view, attendance.mark`. The operator must NEVER get UI for: order create/approve/cancel, official invoices, stock adjustments, payroll edit, cash transfers, run reversal.
- Status enums (verified in `db-types.ts` / migrations): job cards `pending|in_progress|completed|cancelled`; challans `printed|in_transit|delivered|cancelled`; runs `posted|reversed`; attendance `present|absent|half_day|leave|holiday|week_off`; orders `draft|confirmed|approved|challan_printed|invoiced|fulfilled|partially_fulfilled|cancelled`.
- Challans are release-gated by RLS (0107): operators only ever see released ones — screens must not assume otherwise.
- Every task ends with `npx tsc --noEmit` clean and `npm test` green in `mobile/` before committing.
- Touch targets ≥ 44px; every screen = `Screen` + `GradientHeader` with `right={<HeaderRight />}`.
- Work on branch `feat/mobile-phase2`. Commit after every task: `git add <files> && git commit -m "..."`.
- `npx expo prebuild` is NOT needed for any task in this plan (no native/app-config changes until the optional final release bump).

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `mobile/src/lib/opBuilders.ts` | Create | Pure: `aggregateTodayProduction`, `remainingOrderLines`, `buildStockTransferHeader` |
| `mobile/src/lib/__tests__/opBuilders.test.ts` | Create | Unit tests for the above |
| `mobile/src/lib/tabs.ts` | Create | Pure role→tab-set definitions + `tabsForRole`, `HOME_TAB` |
| `mobile/src/lib/__tests__/tabs.test.ts` | Create | Unit tests for the above |
| `mobile/src/data/keys.ts` | Modify | Add operator query-key factories |
| `mobile/src/data/operator.ts` | Modify | Wire aggregate into `useTodayProduction`; fix `markAttendance`; add `useRunHistory`, `useMyRuns`, `useBranches`, `createStockTransfer`; remove challan/order code (moves out); `useJobCards`-style `enabled` opts |
| `mobile/src/data/challans.ts` | Create | `useChallans`, `setChallanStatus`, `challanPdfUrl` (moved), `createChallanForOrder`, `postDelivery` |
| `mobile/src/data/sales.ts` | Modify | `useOrders` lines gain `lineId` + `qtyFulfilled`; `enabled` arg |
| `mobile/src/data/production.ts` | Modify | `useStockLevels` +`cost`; add `useStockLedger`; `useJobCards(enabled?)` |
| `mobile/src/data/transfers.ts` | Modify | `useMyCustody(enabled?)` |
| `mobile/src/components/BottomNav.tsx` | Modify | `compact?: boolean` prop (7-tab sizing) |
| `mobile/app/(tabs)/_layout.tsx` | Modify | 7 operator tabs, badges, tabs.ts usage, no Run FAB |
| `mobile/app/index.tsx` | Modify | Operator redirect `jobs` → `dash-op` |
| `mobile/app/(tabs)/dash-op.tsx` | Modify | Fix imports/router/icon; quick links → tabs + record pushes |
| `mobile/app/(tabs)/production.tsx` | Rename jobs.tsx + modify | + `runs` filter chip + Post-run button + qk invalidations |
| `mobile/app/(tabs)/orders.tsx` | Create | Orders \| Challans segments w/ operator actions |
| `mobile/app/(tabs)/inventory.tsx` | Create | Stock levels + search + ledger sheet |
| `mobile/app/(tabs)/workers.tsx` | Create | Workers \| Attendance \| Payroll segments |
| `mobile/app/(tabs)/history-op.tsx` | Create | Activity \| Handovers + stock-handover sheet |
| Delete | | `app/stores-orders.tsx`, `app/inv-op.tsx`, `app/staff.tsx`, `app/more-op.tsx`, `app/(tabs)/stock.tsx`, `app/(tabs)/jobs.tsx` (renamed), `app/(tabs)/_layout.tsx.bak` |

---

### Task 1: Pure builders + tests (`opBuilders.ts`)

**Files:**
- Create: `mobile/src/lib/opBuilders.ts`
- Test: `mobile/src/lib/__tests__/opBuilders.test.ts`

**Interfaces:**
- Produces: `aggregateTodayProduction(jobs: JobCountInput[], runs: RunCountInput[]): { stages: StageProgress[]; wastage: number }`; `StageProgress { stage: number; targetQty: number; producedQty: number; jobs: number }`; `remainingOrderLines(lines: { id: string; qty: number; qty_fulfilled: number }[]): { order_line_id: string; qty: number }[]`; `buildStockTransferHeader(fromBranchId: string, toUserId: string, note?: string | null): Record<string, string>`.
- Consumed by: Task 2 (operator.ts), Task 3 (challans.ts + createStockTransfer).

- [ ] **Step 1: Write the failing tests**

```typescript
// mobile/src/lib/__tests__/opBuilders.test.ts
import {
  aggregateTodayProduction, remainingOrderLines, buildStockTransferHeader,
} from "../opBuilders";

describe("aggregateTodayProduction", () => {
  const jobs = [
    { stage: 1, target_qty: 100, status: "pending" },
    { stage: 1, target_qty: 50, status: "in_progress" },
    { stage: 1, target_qty: 999, status: "cancelled" },
    { stage: 2, target_qty: null, status: "pending" },
    { stage: 3, target_qty: 10, status: "pending" },
  ];
  const runs = [
    { stage: 1, output_qty: 80, abnormal_wastage_value: 12.5, run_no: "R1", item_name: "Preform" },
    { stage: 1, output_qty: null, abnormal_wastage_value: null, run_no: "R2", item_name: null },
    { stage: 2, output_qty: 300, abnormal_wastage_value: 7.5, run_no: "R3", item_name: "Bottle" },
  ];
  it("sums non-cancelled targets per stage, ignores unknown stages", () => {
    const { stages } = aggregateTodayProduction(jobs, runs);
    const s1 = stages.find((x) => x.stage === 1)!;
    const s2 = stages.find((x) => x.stage === 2)!;
    expect(s1.targetQty).toBe(150);
    expect(s1.jobs).toBe(2);
    expect(s2.targetQty).toBe(0);
    expect(stages.every((x) => x.stage === 1 || x.stage === 2)).toBe(true);
  });
  it("sums produced qty per stage with nulls as 0", () => {
    const { stages } = aggregateTodayProduction(jobs, runs);
    expect(stages.find((x) => x.stage === 1)!.producedQty).toBe(80);
    expect(stages.find((x) => x.stage === 2)!.producedQty).toBe(300);
  });
  it("sums abnormal wastage across all runs", () => {
    expect(aggregateTodayProduction(jobs, runs).wastage).toBe(20);
  });
});

describe("remainingOrderLines", () => {
  it("drops fully-fulfilled and zero-remaining lines", () => {
    const lines = [
      { id: "a", qty: 10, qty_fulfilled: 4 },
      { id: "b", qty: 6, qty_fulfilled: 6 },
      { id: "c", qty: 0, qty_fulfilled: 0 },
    ];
    expect(remainingOrderLines(lines)).toEqual([
      { order_line_id: "a", qty: 6 },
    ]);
  });
});

describe("buildStockTransferHeader", () => {
  it("matches the web wh2user create_transfer shape", () => {
    expect(buildStockTransferHeader("br-1", "u-2", "note x")).toEqual({
      type: "stock", from_branch_id: "br-1", to_user_id: "u-2", note: "note x",
    });
    expect(buildStockTransferHeader("br-1", "u-2")).toEqual({
      type: "stock", from_branch_id: "br-1", to_user_id: "u-2",
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/lib/__tests__/opBuilders.test.ts` (workdir `mobile`)
Expected: FAIL — "Cannot find module '../opBuilders'"

- [ ] **Step 3: Write the implementation**

```typescript
// mobile/src/lib/opBuilders.ts
export interface StageProgress {
  stage: number;
  targetQty: number;
  producedQty: number;
  jobs: number;
}

export interface JobCountInput {
  stage: number | string;
  target_qty: number | string | null;
  status: string;
}

export interface RunCountInput {
  stage: number | string;
  output_qty: number | string | null;
  abnormal_wastage_value?: number | string | null;
  run_no: string;
  item_name: string | null;
}

/** Today's open-job targets vs posted-run output per stage (1 = Blowing, 2 = Filling). */
export function aggregateTodayProduction(
  jobs: JobCountInput[], runs: RunCountInput[],
): { stages: StageProgress[]; wastage: number } {
  const stages = new Map<number, StageProgress>();
  for (const stage of [1, 2]) {
    stages.set(stage, { stage, targetQty: 0, producedQty: 0, jobs: 0 });
  }
  let wastage = 0;
  for (const j of jobs) {
    const s = stages.get(Number(j.stage));
    if (s && j.status !== "cancelled") {
      s.targetQty += Number(j.target_qty ?? 0);
      s.jobs++;
    }
  }
  for (const r of runs) {
    const s = stages.get(Number(r.stage));
    if (s) s.producedQty += Number(r.output_qty ?? 0);
    wastage += Number(r.abnormal_wastage_value ?? 0);
  }
  return { stages: [...stages.values()], wastage };
}

export function remainingOrderLines(
  lines: { id: string; qty: number; qty_fulfilled: number }[],
): { order_line_id: string; qty: number }[] {
  return lines
    .map((l) => ({ order_line_id: l.id, qty: Number(l.qty) - Number(l.qty_fulfilled ?? 0) }))
    .filter((l) => l.qty > 0);
}

export function buildStockTransferHeader(
  fromBranchId: string, toUserId: string, note?: string | null,
): Record<string, string> {
  const header: Record<string, string> = {
    type: "stock", from_branch_id: fromBranchId, to_user_id: toUserId,
  };
  if (note?.trim()) header.note = note.trim();
  return header;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/lib/__tests__/opBuilders.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/opBuilders.ts mobile/src/lib/__tests__/opBuilders.test.ts
git commit -m "feat(mobile): pure builders for operator aggregation and payloads"
```

---

### Task 2: Role→tab definitions (`tabs.ts`) + tests

**Files:**
- Create: `mobile/src/lib/tabs.ts`
- Test: `mobile/src/lib/__tests__/tabs.test.ts`

**Interfaces:**
- Produces: `TabDef { id: string; label: string; icon: LucideIcon; center?: boolean }`, `AGENT_TABS`, `MANAGER_TABS`, `OPERATOR_TABS`, `tabsForRole(roles: string[]): TabDef[]` (operator wins over agent wins over manager), `HOME_TAB: Record<"operator" | "agent" | "manager", string>`.
- Consumed by: Task 11 (layout) and Task 5 dash-op labels.

- [ ] **Step 1: Write the failing tests**

```typescript
// mobile/src/lib/__tests__/tabs.test.ts
import { AGENT_TABS, MANAGER_TABS, OPERATOR_TABS, tabsForRole, HOME_TAB } from "../tabs";

describe("operator tabs", () => {
  it("has 7 tabs with scan as the single center FAB", () => {
    expect(OPERATOR_TABS).toHaveLength(7);
    expect(OPERATOR_TABS.map((t) => t.id)).toEqual(
      ["dash-op", "orders", "inventory", "scan", "production", "workers", "history"]);
    expect(OPERATOR_TABS.filter((t) => t.center).map((t) => t.id)).toEqual(["scan"]);
  });
  it("has no duplicate icons", () => {
    const icons = OPERATOR_TABS.map((t) => t.icon);
    expect(new Set(icons).size).toBe(icons.length);
  });
});

describe("tabsForRole", () => {
  it("operator wins over agent", () => {
    expect(tabsForRole(["operator", "agent"])).toBe(OPERATOR_TABS);
  });
  it("agent wins over manager-only", () => {
    expect(tabsForRole(["agent"])).toBe(AGENT_TABS);
    expect(tabsForRole(["manager"])).toBe(MANAGER_TABS);
    expect(tabsForRole([])).toBe(MANAGER_TABS);
  });
});

it("HOME_TAB lands operators on the dashboard", () => {
  expect(HOME_TAB).toEqual({ operator: "dash-op", agent: "home", manager: "dash" });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/lib/__tests__/tabs.test.ts`
Expected: FAIL — cannot find module `../tabs`

- [ ] **Step 3: Write the implementation**

Icons: operator `Store` (Orders), `Boxes` (Inventory), `ScanLine` (scan center), `Factory` (Production), `Users` (Workers), `History` (History), `LayoutDashboard` (Dashboard). Agent/manager sets move verbatim from `_layout.tsx:35-49` (Home/Map/ScanLine/Users/History and LayoutDashboard/ClipboardCheck/Plus/Users/Menu).

```typescript
// mobile/src/lib/tabs.ts
import {
  Home, Map, ScanLine, Users, History, LayoutDashboard, ClipboardCheck, Plus, Menu,
  Store, Boxes, Factory,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";

export interface TabDef {
  id: string;
  label: string;
  icon: LucideIcon;
  center?: boolean;
}

export const AGENT_TABS: TabDef[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "routes", label: "Routes", icon: Map },
  { id: "scan", label: "Scan", icon: ScanLine, center: true },
  { id: "stores", label: "Stores", icon: Users },
  { id: "history", label: "History", icon: History },
];

export const MANAGER_TABS: TabDef[] = [
  { id: "dash", label: "Dash", icon: LayoutDashboard },
  { id: "approvals", label: "Approvals", icon: ClipboardCheck },
  { id: "sell", label: "Sell", icon: Plus, center: true },
  { id: "customers", label: "Customers", icon: Users },
  { id: "more", label: "More", icon: Menu },
];

export const OPERATOR_TABS: TabDef[] = [
  { id: "dash-op", label: "Dash", icon: LayoutDashboard },
  { id: "orders", label: "Orders", icon: Store },
  { id: "inventory", label: "Stock", icon: Boxes },
  { id: "scan", label: "Scan", icon: ScanLine, center: true },
  { id: "production", label: "Jobs", icon: Factory },
  { id: "workers", label: "Workers", icon: Users },
  { id: "history", label: "History", icon: History },
];

export function tabsForRole(roles: string[]): TabDef[] {
  if (roles.includes("operator")) return OPERATOR_TABS;
  if (roles.includes("agent")) return AGENT_TABS;
  return MANAGER_TABS;
}

export const HOME_TAB = { operator: "dash-op", agent: "home", manager: "dash" } as const;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/lib/__tests__/tabs.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/tabs.ts mobile/src/lib/__tests__/tabs.test.ts
git commit -m "feat(mobile): role tab definitions extracted with tests"
```

---

### Task 3: Data layer — operator.ts fixes + new hooks, challans module, sales/production/transfers tweaks

**Files:**
- Modify: `mobile/src/data/keys.ts:33`
- Modify: `mobile/src/data/operator.ts` (lines 9-66, 68-149, 200-219, add new hooks)
- Create: `mobile/src/data/challans.ts`
- Modify: `mobile/src/data/sales.ts` (`useOrders` ~178-215 + `OrderRow.lines`)
- Modify: `mobile/src/data/production.ts` (`useStockLevels` 127-165, add `useStockLedger`, `useJobCards(enabled?)`)
- Modify: `mobile/src/data/transfers.ts` (`useMyCustody(enabled?)`)

**Interfaces:**
- Consumes: Task 1 builders. Produces (for later tasks):
  - `qk.opTodayProduction()`, `qk.opAttendanceToday()`, `qk.opStaff()`, `qk.opPayrollRuns()`, `qk.opPayrollLines(id)`, `qk.opOrders()`, `qk.opChallans()`, `qk.opRunHistory()`, `qk.myRuns()`, `qk.stockLedger(itemId)`, `qk.branches()`
  - `useTodayProduction()` (same shape, real `wastage`)
  - `useRunHistory(days?: number): RunHistoryRow[]` — `{ id, runNo, runDate, stage, outputQty, unitCost, wastage, status, notes, createdAt, itemName, posterName }`
  - `useMyRuns(days?: number)` — same row type, `created_by = me`
  - `useBranches()` — `{ id, name, isWarehouse }[]` (active only)
  - `createStockTransfer(input: { fromBranchId, toUserId, lines: { itemId, qty }[], note? }): Promise<string>`
  - `useChallans()` / `setChallanStatus(id, status)` / `challanPdfUrl(id)` from `@/data/challans`; plus `createChallanForOrder(order: OrderRow): Promise<string>` and `postDelivery(orderId: string): Promise<string>`
  - `OrderRow.lines: { lineId, itemId, qty, unitPrice, itemName, qtyFulfilled }[]`
  - `StockLevelRow + { cost: number }`; `useStockLedger(itemId: string | null)` → `{ id, moveType, qtyDelta, qtyAfter, unitCost, movedAt, branchName }[]`

- [ ] **Step 1: keys.ts — add factories**

After `qr: (code)` add:

```typescript
  opTodayProduction: () => ["opTodayProduction"] as const,
  opAttendanceToday: () => ["opAttendanceToday"] as const,
  opStaff: () => ["opStaff"] as const,
  opPayrollRuns: () => ["opPayrollRuns"] as const,
  opPayrollLines: (runId: string) => ["opPayrollLines", runId] as const,
  opOrders: () => ["opOrders"] as const,
  opChallans: () => ["opChallans"] as const,
  opRunHistory: () => ["opRunHistory"] as const,
  myRuns: () => ["myRuns"] as const,
  stockLedger: (itemId: string) => ["stockLedger", itemId] as const,
  branches: () => ["branches"] as const,
```

- [ ] **Step 2: sales.ts — expose line ids + fulfilment**

In `OrderRow` change `lines` to:

```typescript
  lines: { lineId: string; itemId: string; qty: number; qtyFulfilled: number; unitPrice: number; itemName: string | null }[];
```

In `useOrders()` (both select strings at `src/data/sales.ts` — orders list and any identical select): change the embedded resource to
`lines:sales_order_lines(id, item_id, qty, qty_fulfilled, unit_price, item:items(name))` and map `lineId: l.id`, `qtyFulfilled: Number(l.qty_fulfilled ?? 0)`. Add `enabled = true` first param: `export function useOrders(enabled = true)` → `enabled: !!user?.id && enabled`.
(Verify with tsc that `qty_fulfilled` exists on the typed client — it does per `db-types` `sales_order_lines.Row`.)

- [ ] **Step 3: production.ts — cost, ledger, enabled**

`useStockLevels` select becomes
`"item_id, qty_on_hand, cost, item:items(sku, name, reorder_level, base_unit:units!items_base_unit_id_fkey(code)), branch:branches(name)"`;
`StockLevelRow` gains `cost: number` and the mapper `cost: Number(r.cost ?? 0)`.
After `useJobCards()` signature add `(enabled = true)` → `enabled: !!user?.id && enabled`.
Append:

```typescript
export interface StockLedgerRow {
  id: string;
  moveType: string;
  qtyDelta: number;
  qtyAfter: number;
  unitCost: number;
  movedAt: string;
  branchName: string;
}

/** Last 10 ledger moves for an item (read-only audit trail). */
export function useStockLedger(itemId: string | null) {
  const { user } = useSession();
  return useQuery({
    queryKey: qk.stockLedger(itemId ?? ""),
    enabled: !!user?.id && !!itemId,
    queryFn: async (): Promise<StockLedgerRow[]> => {
      const { data, error } = await supabase
        .from("stock_ledger")
        .select("id, move_type, qty_delta, qty_after, unit_cost, moved_at, branch:branches(name)")
        .eq("item_id", itemId!)
        .order("moved_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id as string,
        moveType: r.move_type as string,
        qtyDelta: Number(r.qty_delta ?? 0),
        qtyAfter: Number(r.qty_after ?? 0),
        unitCost: Number(r.unit_cost ?? 0),
        movedAt: r.moved_at as string,
        branchName: (r.branch?.name as string) ?? "-",
      }));
    },
  });
}
```

- [ ] **Step 4: transfers.ts — enabled arg**

`export function useMyCustody(enabled = true)` → `enabled: !!user?.id && enabled`.

- [ ] **Step 5: operator.ts — rewrite production aggregation + remove moved code**

Replace the `StageProgress` interface + `useTodayProduction` (lines 9-66) with:

```typescript
import { aggregateTodayProduction, type StageProgress } from "@/lib/opBuilders";
export type { StageProgress };

/** Today's production targets (open job cards) vs posted run output, per stage. */
export function useTodayProduction() {
  const { user } = useSession();
  return useQuery({
    queryKey: qk.opTodayProduction(),
    enabled: !!user?.id,
    queryFn: async (): Promise<{ stages: StageProgress[]; wastage: number; recent: { runNo: string; name: string; qty: number; stage: number }[] }> => {
      const today = todayIST();
      const [jobsRes, runsRes] = await Promise.all([
        supabase
          .from("production_job_cards")
          .select("stage, target_qty, status")
          .eq("card_date", today),
        supabase
          .from("production_runs")
          .select("run_no, stage, output_qty, abnormal_wastage_value, output_item:items(name)")
          .eq("run_date", today)
          .eq("status", "posted")
          .order("created_at", { ascending: false })
          .limit(8),
      ]);
      if (jobsRes.error) throw jobsRes.error;
      if (runsRes.error) throw runsRes.error;
      const runs = (runsRes.data ?? []).map((r: any) => ({
        run_no: r.run_no as string,
        item_name: (r.output_item?.name as string) ?? null,
        stage: Number(r.stage),
        output_qty: r.output_qty,
        abnormal_wastage_value: r.abnormal_wastage_value,
      }));
      const { stages, wastage } = aggregateTodayProduction(
        (jobsRes.data ?? []) as any, runs,
      );
      return {
        stages,
        wastage,
        recent: runs.map((r) => ({
          runNo: r.run_no,
          name: r.item_name ?? "Item",
          qty: Number(r.output_qty ?? 0),
          stage: r.stage,
        })),
      };
    },
  });
}
```

Delete `OpOrderRow` + `useOrders` (lines 68-104 — the Orders tab uses `@/data/sales`' richer `useOrders`) and delete `ChallanRow`, `useChallans`, `setChallanStatus`, `challanPdfUrl` (lines 106-149 — move to `challans.ts` in Step 7). Switch remaining raw keys to qk: `["opStaff"]` → `qk.opStaff()`, `["opAttendanceToday"]` → `qk.opAttendanceToday()`, `["opPayrollRuns"]` → `qk.opPayrollRuns()`, `["opPayrollLines", runId]` → `qk.opPayrollLines(runId)`.

- [ ] **Step 6: operator.ts — markAttendance null-explicit payloads + new hooks**

In `markAttendance`, change payload construction so BOTH id columns are always present:

```typescript
    const payload =
      r.entityType === "user"
        ? { ...base, user_id: r.entityId, worker_id: null }
        : { ...base, worker_id: r.entityId, user_id: null };
```

Also extend `AttendanceTodayRow` (interface + mapper in `useAttendanceToday`) with
`entityId: string` — mapped as `(r.user_id ?? r.worker_id) as string` — so the
Workers tab can join attendance rows to staff rows by entity id.

Append to the file:

```typescript
export interface RunHistoryRow {
  id: string;
  runNo: string;
  runDate: string;
  stage: number;
  outputQty: number;
  unitCost: number;
  wastage: number;
  status: string;
  notes: string | null;
  createdAt: string;
  itemName: string | null;
  posterName: string | null;
}

function mapRun(r: any): RunHistoryRow {
  return {
    id: r.id as string,
    runNo: r.run_no as string,
    runDate: r.run_date as string,
    stage: Number(r.stage),
    outputQty: Number(r.output_qty ?? 0),
    unitCost: Number(r.output_unit_cost ?? 0),
    wastage: Number(r.abnormal_wastage_value ?? 0),
    status: r.status as string,
    notes: (r.notes as string) ?? null,
    createdAt: r.created_at as string,
    itemName: (r.output_item?.name as string) ?? null,
    posterName: (r.poster?.full_name as string) ?? null,
  };
}

const RUN_SELECT =
  "id, run_no, run_date, stage, output_qty, output_unit_cost, abnormal_wastage_value, status, notes, created_at, " +
  "output_item:items(name), poster:users!production_runs_created_by_fkey(full_name)";

/** Production runs, last N days, newest first (RLS: read_all_auth). */
export function useRunHistory(days = 14) {
  const { user } = useSession();
  return useQuery({
    queryKey: qk.opRunHistory(),
    enabled: !!user?.id,
    queryFn: async (): Promise<RunHistoryRow[]> => {
      const { data, error } = await supabase
        .from("production_runs")
        .select(RUN_SELECT)
        .gte("run_date", isoDaysAgo(days - 1))
        .order("run_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []).map(mapRun);
    },
  });
}

/** Runs posted by the signed-in user (operator Activity segment). */
export function useMyRuns(days = 14) {
  const { user } = useSession();
  return useQuery({
    queryKey: qk.myRuns(),
    enabled: !!user?.id,
    queryFn: async (): Promise<RunHistoryRow[]> => {
      const { data, error } = await supabase
        .from("production_runs")
        .select(RUN_SELECT)
        .eq("created_by", user!.id)
        .gte("run_date", isoDaysAgo(days - 1))
        .order("run_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []).map(mapRun);
    },
  });
}

export interface BranchRow {
  id: string;
  name: string;
  isWarehouse: boolean;
}

/** Branches for the stock-handover source picker. */
export function useBranches() {
  const { user } = useSession();
  return useQuery({
    queryKey: qk.branches(),
    enabled: !!user?.id,
    queryFn: async (): Promise<BranchRow[]> => {
      const { data, error } = await supabase
        .from("branches")
        .select("id, name, is_warehouse")
        .eq("status", "active")
        .order("name");
      if (error) throw error;
      return (data ?? []).map((b: any) => ({
        id: b.id as string,
        name: b.name as string,
        isWarehouse: !!b.is_warehouse,
      }));
    },
  });
}

/** Warehouse -> user stock handover (RLS: stock.transfer, RPC create_transfer). */
export async function createStockTransfer(input: {
  fromBranchId: string;
  toUserId: string;
  lines: { itemId: string; qty: number }[];
  note?: string | null;
}): Promise<string> {
  const lines = input.lines.filter((l) => l.itemId && Number(l.qty) > 0);
  if (lines.length === 0) throw new RpcError("Add at least one item with a quantity");
  return rpc<string>("create_transfer", {
    p_header: buildStockTransferHeader(input.fromBranchId, input.toUserId, input.note),
    p_lines: lines.map((l) => ({ item_id: l.itemId, qty: Number(l.qty) })),
  });
}
```

Add imports at the top of operator.ts:

```typescript
import { rpc, RpcError } from "@/lib/rpc";
import { isoDaysAgo } from "./transfers";
import { buildStockTransferHeader } from "@/lib/opBuilders";
```

- [ ] **Step 7: Create `src/data/challans.ts`**

```typescript
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { rpc } from "@/lib/rpc";
import { useSession } from "@/lib/session";
import { qk } from "./keys";
import { remainingOrderLines } from "@/lib/opBuilders";
import type { OrderRow } from "./sales";

export interface ChallanRow {
  id: string;
  challanNo: string;
  challanDate: string;
  status: string;
  orderNo: string | null;
  orderId: string | null;
}

/** Delivery challans visible to this user (RLS: released-only for operators). */
export function useChallans() {
  const { user } = useSession();
  return useQuery({
    queryKey: qk.opChallans(),
    enabled: !!user?.id,
    queryFn: async (): Promise<ChallanRow[]> => {
      const { data, error } = await supabase
        .from("delivery_challans")
        .select("id, challan_no, challan_date, status, order_id, order:sales_orders(order_no)")
        .order("challan_date", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        challanNo: r.challan_no,
        challanDate: r.challan_date,
        status: r.status as string,
        orderId: r.order_id as string | null,
        orderNo: (r.order?.order_no as string) ?? null,
      }));
    },
  });
}

export async function setChallanStatus(id: string, status: string): Promise<void> {
  await rpc("set_challan_status", { p_id: id, p_status: status });
}

export async function createChallanForOrder(order: OrderRow): Promise<string> {
  const lines = remainingOrderLines(
    order.lines.map((l) => ({ id: l.lineId, qty: l.qty, qty_fulfilled: l.qtyFulfilled })),
  );
  if (lines.length === 0) throw new Error("Nothing left to deliver on this order");
  return rpc<string>("create_challan", {
    p_header: { order_id: order.id },
    p_lines: lines,
  });
}

/** Fulfil-all & deliver shortcut (RPC creates + delivers, rolls up order). */
export async function postDelivery(orderId: string): Promise<string> {
  return rpc<string>("post_delivery", { p_order: orderId });
}

/** Challan PDF: opens the web print view. */
export function challanPdfUrl(challanId: string): string {
  const base = process.env.EXPO_PUBLIC_WEB_URL ?? "https://newbizz-kappa.vercel.app";
  return `${base}/challans/${challanId}/print`;
}
```

Add `import { RpcError } ...` NOT needed here (plain Error). Also update `src/data/operator.ts`'s remaining callers — none after Step 5's deletion.

- [ ] **Step 8: Typecheck + full test run**

Run: `npx tsc --noEmit` (workdir `mobile`)
Expected: no NEW error categories in `src/` (broken `app/` screens may still show their pre-existing errors — dash-op/stores-orders/staff were reported by prior audit; do not fix them here, Tasks 5-9 own them).
Run: `npm test`
Expected: PASS (existing + opBuilders tests).

- [ ] **Step 9: Commit**

```bash
git add mobile/src/data mobile/src/lib/db-types.ts
git commit -m "feat(mobile): operator data layer - run history, stock ledger, challans module, transfer/attendance fixes"
```

---

### Task 4: BottomNav compact mode

**Files:**
- Modify: `mobile/src/components/BottomNav.tsx`

**Interfaces:**
- Consumes: nothing. Produces: `BottomNav({ tabs, active, onChange, badgeCounts, compact })` with `compact?: boolean`.
- Consumed by: Task 11.

- [ ] **Step 1: Add the prop and sizing**

In the component signature add `compact = false,` to destructuring and `compact?: boolean;` to the props type. Then:
- `<Icon size={compact ? 19 : 20} ...>` (non-center branch only)
- `<Text style={[s.label, { color: ..., fontSize: compact ? 9 : undefined }, ...]}>` — cleaner: `style={[s.label, compact && { fontSize: 9 }, { color: isActive ? t.color.brand : t.color.ink4 }]}`.
- Center FAB unchanged.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit` — Expected: no BottomNav errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components/BottomNav.tsx
git commit -m "feat(mobile): BottomNav compact mode for 7-tab bars"
```

---

### Task 5: Dashboard (`(tabs)/dash-op.tsx`) repair + quick actions

**Files:**
- Modify: `mobile/app/(tabs)/dash-op.tsx`

**Interfaces:**
- Consumes: `@/data/operator` (`useTodayProduction`, `useAttendanceToday`), `@/data/production` (`useStockLevels`), `@/data/sales` (`useTodayKpis`), `gotoTab` from `@/lib/tabBus`, router pushes to `/post-run`, `/record?mode=sale|collect`.
- Produces: working operator Dashboard screen (default export unchanged name).

- [ ] **Step 1: Fix the imports block (lines 1-22)**

- Line 5: `Cart` → `Store` (lucide has no `Cart` export; `Store` exists).
- Line 19: `from "@/data/production"` → `from "@/data/operator"`.
- Add: `import { useTheme } from "@/theme/ThemeContext";`
- Add: `import { gotoTab } from "@/lib/tabBus";`
- Add: `import { Factory, Plus } from ...` already partially imported — final icon import line:
  `import { Boxes, ChevronRight, Factory, IndianRupee, ClipboardList, Users, Store, ReceiptText, ScanLine } from "lucide-react-native";` (ScanLine unused here — do NOT import what you don't use; keep: Boxes, ChevronRight, Factory, IndianRupee, ClipboardList, Users, Store, ReceiptText).

- [ ] **Step 2: Instantiate the router**

After line 25 (`const { claims } = useSession();`) add `const router = useRouter();` (fixes every `router.push` at line 138).

- [ ] **Step 3: Replace the quick-links array (lines 40-44)**

```typescript
  const links: { key: string; label: string; sub: string; icon: typeof Boxes; go: () => void }[] = [
    { key: "run", label: "Post run", sub: "Record production output", icon: Factory, go: () => router.push("/post-run") },
    { key: "sale", label: "Record sale", sub: "Cash memo at the plant", icon: IndianRupee, go: () => router.push("/record?mode=sale" as never) },
    { key: "collect", label: "Record collection", sub: "Payment from a store", icon: ReceiptText, go: () => router.push("/record?mode=collect" as never) },
    { key: "orders", label: "Stores & Orders", sub: "Orders, challans and delivery", icon: Store, go: () => gotoTab("orders") },
    { key: "inv", label: "Inventory", sub: "Stock levels and reorder alerts", icon: Boxes, go: () => gotoTab("inventory") },
    { key: "workers", label: "Workers", sub: "Attendance and payroll", icon: Users, go: () => gotoTab("workers") },
  ];
```

And the map below (lines 135-151): key `l.href` → `l.key`, `onPress={() => router.push(l.href as never)}` → `onPress={l.go}`, drop the `href` typing.

- [ ] **Step 4: Copy fixes**

Line 122 attendance empty-state text: `"Nobody marked yet — open Staff to mark attendance."` → `"Nobody marked yet — open Workers to mark attendance."`. Line 42's stale `/staff` link is gone via Step 3.

- [ ] **Step 5: Wastage strip**

Under the production card's run rows (after line 95 `))}`) add, only when non-zero:

```tsx
              {(prod.data?.wastage ?? 0) > 0 ? (
                <Text style={s.stageSub}>
                  Abnormal wastage today: {"₹"}{(prod.data!.wastage).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                </Text>
              ) : null}
```

- [ ] **Step 6: Typecheck + commit**

Run: `npx tsc --noEmit` — Expected: dash-op.tsx errors gone.

```bash
git add "mobile/app/(tabs)/dash-op.tsx"
git commit -m "fix(mobile): operator dashboard compiles with tab-aware quick actions"
```

---

### Task 6: Production tab — rename jobs → production, add Runs chip + Post run

**Files:**
- Rename: `mobile/app/(tabs)/jobs.tsx` → `mobile/app/(tabs)/production.tsx` (git mv)
- Modify: `mobile/app/(tabs)/production.tsx`
- Modify: `mobile/app/post-run.tsx` (invalidation keys)

**Interfaces:**
- Consumes: `useRunHistory` from `@/data/operator`, `qk`, existing job-card flows.
- Produces: tab id `production` screen (default export `ProductionScreen`).

- [ ] **Step 1: git mv**

```bash
git mv "mobile/app/(tabs)/jobs.tsx" "mobile/app/(tabs)/production.tsx"
```

- [ ] **Step 2: add filter value + chip + runs list**

Change `type Filter = "pending" | "in_progress" | "completed";` (file top) to
`type Filter = "pending" | "in_progress" | "completed" | "runs";`.
Ensure these imports are present (add only the ones missing — check the file's existing import block first to avoid duplicates): `useRunHistory` and `type RunHistoryRow` from `@/data/operator`; `StatusBadge` from `@/components/StatusBadge`; `moneyINR` and `dateIST` from `@/lib/format`; `friendlyError` from `@/lib/rpc`; `useRouter` from `expo-router`; `FlaskConical` from `lucide-react-native`.
In `ProductionScreen` (rename default export function accordingly): `const router = useRouter(); const runs = useRunHistory();`.
Where the four filter buttons render (`s.filters` block), append a 4th:

```tsx
          <FilterBtn label={`Runs (${runs.data?.length ?? 0})`} active={filter === "runs"} onPress={() => setFilter("runs")} />
```

Guard the jobs list: `filter !== "runs" && (...)` around the existing FlatList/rows section, and add sibling:

```tsx
        {filter === "runs" ? (
          runs.isLoading ? <SkeletonRows rows={6} />
          : runs.isError ? <EmptyState title="Could not load runs" message={friendlyError(runs.error)} />
          : (runs.data ?? []).length === 0 ? <EmptyState title="No runs in the last 14 days" />
          : (
            <View style={s.list}>
              {(runs.data ?? []).map((r) => (
                <View key={r.id} style={s.runCard}>
                  <View style={s.runHead}>
                    <Text style={s.runNo}>{r.runNo}</Text>
                    <StatusBadge label={r.status} tone={r.status === "posted" ? "grn" : "red"} />
                  </View>
                  <Text style={s.runBody} numberOfLines={1}>
                    {r.stage === 1 ? "Blowing" : "Filling"} · {r.itemName ?? "Item"} · {r.outputQty.toLocaleString("en-IN")} @ {moneyINR(r.unitCost)}/unit
                  </Text>
                  <Text style={s.runSub}>{dateIST(r.runDate)} · {r.posterName ?? "—"}</Text>
                </View>
              ))}
            </View>
          )
        ) : null}
```

`StatusBadge` from `@/components/StatusBadge`, `dateIST`/`friendlyError` imports added; `SkeletonRows`/`EmptyState` already imported. Add styles `runCard` (card look copied from the file's existing card style), `runHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }`, `runNo` (mono bold xs), `runBody` (sans xs ink2, marginTop 2), `runSub` (sans eyebrow ink4).

- [ ] **Step 3: Post run button**

Just below `<GradientHeader title="Production jobs" ... />` change title to `"Production"` and add:

```tsx
      <Pressable
        onPress={() => router.push("/post-run")}
        style={({ pressed }) => [s.postRun, pressed && { opacity: 0.85 }]}
        accessibilityRole="button"
        accessibilityLabel="Post production run"
      >
        <FlaskConical size={15} color="#ffffff" />
        <Text style={s.postRunTxt}>Post run</Text>
      </Pressable>
```

with style `postRun: { marginHorizontal: tokens.space.lg, marginTop: tokens.space.sm, minHeight: 44, borderRadius: tokens.radius.md, backgroundColor: t.color.brand, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: tokens.space.xs }`, `postRunTxt: { color: "#ffffff", fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs }`. Import `FlaskConical` from lucide.

- [ ] **Step 4: CompleteSheet + onStart/onCancel invalidations — add the new keys**

Everywhere this file calls `qc.invalidateQueries({ queryKey: qk.jobCards() })`, follow it with (helper once at top of component):

```typescript
  function invalidateOps() {
    void qc.invalidateQueries({ queryKey: qk.jobCards() });
    void qc.invalidateQueries({ queryKey: qk.opTodayProduction() });
    void qc.invalidateQueries({ queryKey: qk.opRunHistory() });
    void qc.invalidateQueries({ queryKey: qk.myRuns() });
    void qc.invalidateQueries({ queryKey: qk.stockLevels() });
  }
```

Replace the existing standalone invalidation calls with `invalidateOps()`.

- [ ] **Step 5: post-run.tsx — same keys via qk**

Replace `queryKey: ["jobCards"]` → `qk.jobCards()`, `["stockLevels"]` → `qk.stockLevels()`, and add invalidations for `qk.opTodayProduction()`, `qk.opRunHistory()`, `qk.myRuns()`. Import `qk` from `@/data/keys`.

- [ ] **Step 6: Typecheck + commit**

Run: `npx tsc --noEmit` — Expected: no errors in these two files.

```bash
git add -A "mobile/app/(tabs)/jobs.tsx" "mobile/app/(tabs)/production.tsx" mobile/app/post-run.tsx
git commit -m "feat(mobile): production tab with run history and standalone post-run entry"
```

---

### Task 7: Orders tab — `(tabs)/orders.tsx` (new), delete `stores-orders.tsx`

**Files:**
- Create: `mobile/app/(tabs)/orders.tsx`
- Delete: `mobile/app/stores-orders.tsx`

**Interfaces:**
- Consumes: `useOrders` from `@/data/sales`, `useChallans`/`setChallanStatus`/`createChallanForOrder`/`postDelivery`/`challanPdfUrl` from `@/data/challans`, `postInvoiceFromOrder` from `@/data/sales`, `expo-web-browser`, tab components (`Screen`, `GradientHeader`, `StatusBadge`, `EmptyState`, `SkeletonRows`, `Sheet`).
- Produces: default export `OrdersScreen` (tab id `orders`), inline segmented control (local state, same style as scan.tsx's `SegmentedToggle` pattern).

- [ ] **Step 1: Delete the broken screen, create the new one**

```bash
git rm mobile/app/stores-orders.tsx
```

Full file content (pattern-faithful; compact styles):

```tsx
import { useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, Alert } from "react-native";
import { useQueryClient, useIsFetching } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import Toast from "react-native-toast-message";
import { Printer, Truck, ReceiptText, Banknote, ChevronDown, ChevronUp, Ticket } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { GradientHeader } from "@/components/GradientHeader";
import { HeaderRight } from "@/components/HeaderRight";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonRows } from "@/components/SkeletonRows";
import { useSession } from "@/lib/session";
import { roleLabel } from "@/lib/claims";
import { friendlyError } from "@/lib/rpc";
import { moneyINR, moneyCompact, dateIST } from "@/lib/format";
import { qk } from "@/data/keys";
import { useOrders, postInvoiceFromOrder, type OrderRow } from "@/data/sales";
import {
  useChallans, setChallanStatus, createChallanForOrder, postDelivery, challanPdfUrl,
  type ChallanRow,
} from "@/data/challans";
import { tokens } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeContext";

type Seg = "orders" | "challans";

const ORDER_TONE: Record<string, "neutral" | "brand" | "grn" | "amb" | "red"> = {
  draft: "neutral", confirmed: "brand", approved: "amb",
  challan_printed: "brand", fulfilled: "grn", partially_fulfilled: "amb",
  invoiced: "grn", cancelled: "red",
};

export default function OrdersScreen() {
  const s = useStyles();
  const { palette: t } = useTheme();
  const { claims } = useSession();
  const qc = useQueryClient();
  const router = useRouter();
  const fetching = useIsFetching();
  const [seg, setSeg] = useState<Seg>("orders");
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const orders = useOrders();
  const challans = useChallans();

  function invalidateOrders() {
    void qc.invalidateQueries({ queryKey: ["orders"] });
    void qc.invalidateQueries({ queryKey: qk.opChallans() });
    void qc.invalidateQueries({ queryKey: qk.stockLevels() });
    void qc.invalidateQueries({ queryKey: qk.today() });
  }

  async function act(id: string, fn: () => Promise<unknown>, okMsg: string) {
    setBusy(id);
    try {
      await fn();
      Toast.show({ type: "success", text1: okMsg });
      invalidateOrders();
    } catch (e) {
      Toast.show({ type: "error", text1: "Action failed", text2: friendlyError(e) });
    } finally {
      setBusy(null);
    }
  }

  function onPrint(o: OrderRow) {
    void act(o.id, async () => {
      const id = await createChallanForOrder(o);
      await WebBrowser.openBrowserAsync(challanPdfUrl(id));
    }, "Challan created");
  }

  function onDeliver(o: OrderRow) {
    Alert.alert("Fulfil all & deliver?", "Marks every remaining line delivered.", [
      { text: "Cancel", style: "cancel" },
      { text: "Deliver", onPress: () => void act(o.id, () => postDelivery(o.id), "Delivered") },
    ]);
  }

  function onMemo(o: OrderRow) {
    Alert.alert("Fulfil as cash memo?", "Creates a cash memo for the remaining lines.", [
      { text: "Cancel", style: "cancel" },
      { text: "Create", onPress: () => void act(o.id, () => postInvoiceFromOrder(o.id, false), "Cash memo posted") },
    ]);
  }

  function onChallanStatus(c: ChallanRow, status: string) {
    void act(c.id, () => setChallanStatus(c.id, status), `Challan ${status.replace("_", " ")}`);
  }

  return (
    <Screen refreshing={fetching > 0} onRefresh={invalidateOrders}>
      <GradientHeader title="Stores & Orders" subtitle={roleLabel(claims)} right={<HeaderRight />} />
      <View style={s.segRow}>
        {(["orders", "challans"] as Seg[]).map((k) => (
          <Pressable key={k} onPress={() => setSeg(k)} style={[s.segBtn, seg === k && s.segBtnOn]}>
            <Text style={[s.segTxt, seg === k && s.segTxtOn]}>{k === "orders" ? "Orders" : "Challans"}</Text>
          </Pressable>
        ))}
      </View>
      {seg === "orders" ? (
        orders.isLoading ? <View style={s.pad}><SkeletonRows rows={5} /></View>
        : orders.isError ? <EmptyState title="Could not load orders" message={friendlyError(orders.error)} />
        : (orders.data ?? []).length === 0 ? <EmptyState title="No open orders" message="Approved orders appear here for challan and fulfilment." />
        : (
          <View style={s.list}>
            {(orders.data ?? []).map((o) => {
              const total = o.lines.reduce((x, l) => x + l.qty * l.unitPrice, 0);
              const isOpen = open === o.id;
              const approved = o.status === "approved";
              return (
                <View key={o.id} style={s.card}>
                  <Pressable onPress={() => setOpen(isOpen ? null : o.id)} style={s.cardHead}>
                    <View style={s.headLine}>
                      <Text style={s.docNo}>{o.orderNo}</Text>
                      <StatusBadge label={o.status.replace(/_/g, " ")} tone={ORDER_TONE[o.status] ?? "neutral"} />
                    </View>
                    <Text style={s.sub} numberOfLines={1}>
                      {o.storeName ?? "Store"} · {dateIST(o.orderDate)} · {moneyINR(total)}
                    </Text>
                    {isOpen ? <ChevronUp size={15} color={t.color.ink4} /> : <ChevronDown size={15} color={t.color.ink4} />}
                  </Pressable>
                  {isOpen ? (
                    <View style={s.lines}>
                      {o.lines.map((l) => (
                        <View key={l.lineId} style={s.lineRow}>
                          <Text style={s.lineName} numberOfLines={1}>{l.itemName ?? "Item"}</Text>
                          <Text style={s.lineQty}>
                            {l.qty - l.qtyFulfilled > 0 ? `${l.qty - l.qtyFulfilled}/${l.qty}` : `${l.qty}`}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                  {approved ? (
                    <View style={s.actions}>
                      <ActionBtn label="Print" icon={Printer} busy={busy === o.id} onPress={() => onPrint(o)} tone="brand" />
                      <ActionBtn label="Deliver all" icon={Truck} busy={busy === o.id} onPress={() => onDeliver(o)} tone="grn" />
                      <ActionBtn label="Cash memo" icon={Banknote} busy={busy === o.id} onPress={() => onMemo(o)} tone="amb" />
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        )
      ) : challans.isLoading ? <View style={s.pad}><SkeletonRows rows={5} /></View>
        : challans.isError ? <EmptyState title="Could not load challans" message={friendlyError(challans.error)} />
        : (challans.data ?? []).length === 0 ? <EmptyState title="No released challans" message="Only office-released challans are visible here." />
        : (
          <View style={s.list}>
            {(challans.data ?? []).map((c) => (
              <View key={c.id} style={s.card}>
                <View style={s.headLine}>
                  <Text style={s.docNo}>{c.challanNo}</Text>
                  <StatusBadge
                    label={c.status.replace("_", " ")}
                    tone={c.status === "delivered" ? "grn" : c.status === "cancelled" ? "red" : c.status === "in_transit" ? "amb" : "brand"}
                  />
                </View>
                <Text style={s.sub}>{c.orderNo ? `Order ${c.orderNo} · ` : ""}{dateIST(c.challanDate)}</Text>
                <View style={s.actions}>
                  {c.status === "printed" ? (
                    <>
                      <ActionBtn label="Dispatch" icon={Truck} busy={busy === c.id} onPress={() => onChallanStatus(c, "in_transit")} tone="brand" />
                      <ActionBtn label="Delivered" icon={ReceiptText} busy={busy === c.id} onPress={() => onChallanStatus(c, "delivered")} tone="grn" />
                    </>
                  ) : null}
                  {c.status === "in_transit" ? (
                    <ActionBtn label="Delivered" icon={ReceiptText} busy={busy === c.id} onPress={() => onChallanStatus(c, "delivered")} tone="grn" />
                  ) : null}
                  {c.status === "printed" || c.status === "in_transit" ? (
                    <>
                      <ActionBtn label="PDF" icon={Ticket} busy={busy === c.id}
                        onPress={() => void WebBrowser.openBrowserAsync(challanPdfUrl(c.id)).catch(() => Toast.show({ type: "error", text1: "Could not open print view" }))}
                        tone="ghost" />
                      <ActionBtn label="Cancel" icon={Printer} busy={busy === c.id}
                        onPress={() => Alert.alert("Cancel challan?", c.challanNo, [
                          { text: "No", style: "cancel" },
                          { text: "Cancel it", style: "destructive", onPress: () => onChallanStatus(c, "cancelled") },
                        ])}
                        tone="red" />
                    </>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        )}
    </Screen>
  );
}
```

```tsx
type ActTone = "brand" | "grn" | "amb" | "red" | "ghost";

function ActionBtn({ label, icon: Icon, onPress, busy, tone }: {
  label: string; icon: typeof Printer; onPress: () => void; busy: boolean; tone: ActTone;
}) {
  const s = useStyles();
  const { palette: t } = useTheme();
  const colors: Record<ActTone, [string, string]> = {
    brand: [t.color.brandWash, t.color.brand],
    grn: [t.color.grnWash, t.color.grn],
    amb: [t.color.ambWash, t.color.amb],
    red: [t.color.redWash, t.color.red],
    ghost: [t.color.surface, t.color.ink2],
  };
  const [bg, fg] = colors[tone];
  return (
    <Pressable
      onPress={() => !busy && onPress()}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        s.actBase, { backgroundColor: bg },
        pressed && { opacity: 0.8 }, busy && { opacity: 0.5 },
      ]}
    >
      <Icon size={13} color={fg} />
      <Text style={[s.actTxt, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}
```

Call sites use `tone=`: `tone="brand"` (Print/Dispatch), `tone="grn"` (Deliver all/Delivered), `tone="amb"` (Cash memo), `tone="red"` (Cancel), `tone="ghost"` (PDF). `useStyles` is defined once at the module bottom and both components call it (it is a hook wrapper over `StyleSheet.create`, same pattern as every other screen).

Styles to define in `useStyles` (colors from palette `t`):

```typescript
const useStyles = () => {
  const { palette: t } = useTheme();
  return StyleSheet.create({
    segRow: { flexDirection: "row", gap: tokens.space.sm, paddingHorizontal: tokens.space.lg, paddingTop: tokens.space.md },
    segBtn: {
      flex: 1, minHeight: 36, borderRadius: tokens.radius.md, borderWidth: 1, borderColor: t.color.line,
      backgroundColor: t.color.surface, alignItems: "center", justifyContent: "center",
    },
    segBtnOn: { backgroundColor: t.color.ink, borderColor: t.color.ink },
    segTxt: { color: t.color.ink3, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
    segTxtOn: { color: t.color.surface },
    list: { paddingHorizontal: tokens.space.lg, paddingTop: tokens.space.md, gap: tokens.space.sm },
    pad: { padding: tokens.space.lg },
    card: {
      backgroundColor: t.color.surface, borderRadius: tokens.radius.lg, borderWidth: 1,
      borderColor: t.color.line, padding: tokens.space.md, gap: tokens.space.xs, ...tokens.shadow.card,
    },
    cardHead: { gap: 2 },
    headLine: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    docNo: { color: t.color.ink, fontFamily: tokens.font.monoBold, fontSize: tokens.size.xs, fontVariant: ["tabular-nums"] },
    sub: { color: t.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow },
    lines: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.color.line, paddingTop: tokens.space.xs },
    lineRow: { flexDirection: "row", justifyContent: "space-between", minHeight: 26, alignItems: "center" },
    lineName: { flex: 1, color: t.color.ink2, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow },
    lineQty: { color: t.color.ink, fontFamily: tokens.font.mono, fontSize: tokens.size.eyebrow, fontVariant: ["tabular-nums"] },
    actions: { flexDirection: "row", flexWrap: "wrap", gap: tokens.space.sm, marginTop: tokens.space.xs },
    actBase: {
      flexDirection: "row", alignItems: "center", gap: 4, minHeight: 36, paddingHorizontal: tokens.space.md,
      borderRadius: tokens.radius.md, borderWidth: 1, borderColor: t.color.line,
    },
    actTxt: { fontFamily: tokens.font.sansSemi, fontSize: tokens.size.eyebrow },
  });
};
```

- [ ] **Step 2: New-sale / new-collect header buttons**

Add above the segment row:

```tsx
      <View style={s.segRow}>
        <Pressable onPress={() => router.push("/record?mode=sale" as never)} style={s.quick} accessibilityRole="button" accessibilityLabel="Record sale">
          <IndianRupee size={14} color={t.color.brand} />
          <Text style={s.quickTxt}>+ Sale</Text>
        </Pressable>
        <Pressable onPress={() => router.push("/record?mode=collect" as never)} style={s.quick} accessibilityRole="button" accessibilityLabel="Record collection">
          <Banknote size={14} color={t.color.grn} />
          <Text style={s.quickTxt}>+ Collect</Text>
        </Pressable>
      </View>
```

with `quick: { flex: 1, minHeight: 40, borderRadius: tokens.radius.md, borderWidth: 1, borderColor: t.color.line, backgroundColor: t.color.surface, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 }` and `quickTxt: { fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs, color: t.color.ink }`; import `useRouter`, `IndianRupee`.

- [ ] **Step 3: Challenged print-URL check**

Step for the reviewer: open the PDF button on device — `/challans/[id]/print` is behind the web login. If the web middleware 401s the operator's browser session, the fallback message must tell them office staff print challans; acceptable for this release (record result in the task notes / follow-up issue). Do not change web auth.

- [ ] **Step 4: Typecheck + commit**

Run: `npx tsc --noEmit` — Expected: orders.tsx clean.

```bash
git add -A mobile/app
git commit -m "feat(mobile): operator orders tab with challan and fulfilment actions"
```

---

### Task 8: Inventory tab — `(tabs)/inventory.tsx` (new), delete `inv-op.tsx` + `(tabs)/stock.tsx`

**Files:**
- Create: `mobile/app/(tabs)/inventory.tsx`
- Delete: `mobile/app/inv-op.tsx`, `mobile/app/(tabs)/stock.tsx`

**Interfaces:**
- Consumes: `useStockLevels`, `useStockLedger` from `@/data/production` (rows now carry `cost`), `Sheet`, `StatusBadge`.
- Produces: `InventoryScreen` default export (tab id `inventory`).

- [ ] **Step 1: Delete dead files**

```bash
git rm mobile/app/inv-op.tsx "mobile/app/(tabs)/stock.tsx"
```

- [ ] **Step 2: Write the screen**

```tsx
import { useMemo, useState } from "react";
import { View, Text, StyleSheet, TextInput } from "react-native";
import { useIsFetching } from "@tanstack/react-query";
import { Boxes, Search } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { GradientHeader } from "@/components/GradientHeader";
import { HeaderRight } from "@/components/HeaderRight";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonRows } from "@/components/SkeletonRows";
import { Sheet } from "@/components/Sheet";
import { useSession } from "@/lib/session";
import { roleLabel } from "@/lib/claims";
import { friendlyError } from "@/lib/rpc";
import { moneyINR, dateIST } from "@/lib/format";
import { useStockLevels, useStockLedger, type StockLevelRow } from "@/data/production";
import { PressCard } from "@/components/PressCard";
import { tokens } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeContext";

export default function InventoryScreen() {
  const s = useStyles();
  const { palette: t } = useTheme();
  const { claims } = useSession();
  const fetching = useIsFetching();
  const stock = useStockLevels();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<StockLevelRow | null>(null);
  const ledger = useStockLedger(selected?.itemId ?? null);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return stock.data ?? [];
    return (stock.data ?? []).filter(
      (r) => r.itemName.toLowerCase().includes(needle) || r.itemSku.toLowerCase().includes(needle),
    );
  }, [stock.data, q]);

  return (
    <Screen refreshing={fetching > 0} onRefresh={() => void stock.refetch()}>
      <GradientHeader title="Inventory" subtitle={roleLabel(claims)} right={<HeaderRight />} />
      <View style={s.body}>
        <View style={s.search}>
          <Search size={15} color={t.color.ink4} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search item or SKU"
            placeholderTextColor={t.color.ink4}
            style={s.searchInput}
            accessibilityLabel="Search inventory"
          />
        </View>
        {stock.isLoading ? <SkeletonRows rows={8} />
          : stock.isError ? <EmptyState title="Could not load stock" message={friendlyError(stock.error)} />
          : rows.length === 0 ? <EmptyState title="No items" message={q ? "Nothing matches that search." : "Stock appears here once the office loads it."} />
          : rows.map((r) => {
            const low = r.reorderLevel > 0 && r.qtyOnHand <= r.reorderLevel;
            return (
              <PressCard key={`${r.itemId}-${r.branchName}`} onPress={() => setSelected(r)} style={s.row}>
                <View style={s.chip}>
                  <Boxes size={14} color={t.color.brand} />
                </View>
                <View style={s.texts}>
                  <Text style={s.name} numberOfLines={1}>{r.itemName}</Text>
                  <Text style={s.sub} numberOfLines={1}>
                    {r.itemSku} · {r.branchName}{r.reorderLevel > 0 ? ` · reorder at ${r.reorderLevel.toLocaleString("en-IN")}` : ""}
                  </Text>
                </View>
                <View style={s.right}>
                  <Text style={[s.qty, low && { color: t.color.red }]}>
                    {r.qtyOnHand.toLocaleString("en-IN")} {r.unit}
                  </Text>
                  {low ? <StatusBadge label="Low" tone="red" /> : null}
                </View>
              </PressCard>
            );
          })}
      </View>
      <Sheet visible={!!selected} onClose={() => setSelected(null)} title={selected?.itemName ?? "Item"}>
        {selected ? (
          <View style={s.sheetBody}>
            <SheetLine label="On hand" value={`${selected.qtyOnHand.toLocaleString("en-IN")} ${selected.unit}`} />
            <SheetLine label="Reorder level" value={selected.reorderLevel.toLocaleString("en-IN")} />
            <SheetLine label="Branch" value={selected.branchName} />
            <SheetLine label="Value" value={moneyINR(selected.qtyOnHand * selected.cost)} />
            <Text style={s.ledgerTitle}>Recent stock movements</Text>
            {ledger.isLoading ? <Text style={s.ledgerSub}>Loading…</Text>
              : ledger.isError ? <Text style={s.ledgerSub}>{friendlyError(ledger.error)}</Text>
              : (ledger.data ?? []).length === 0 ? <Text style={s.ledgerSub}>No movements yet.</Text>
              : (ledger.data ?? []).map((m) => (
                <View key={m.id} style={s.ledgerRow}>
                  <View style={s.texts}>
                    <Text style={s.name} numberOfLines={1}>{m.moveType.replace(/_/g, " ")}</Text>
                    <Text style={s.sub}>{m.branchName} · {dateIST(m.movedAt.slice(0, 10))}</Text>
                  </View>
                  <Text style={[s.qty, { color: m.qtyDelta >= 0 ? t.color.grn : t.color.ink }]}>
                    {m.qtyDelta >= 0 ? "+" : ""}{m.qtyDelta.toLocaleString("en-IN")}
                    <Text style={s.qtyAfter}> → {m.qtyAfter.toLocaleString("en-IN")}</Text>
                  </Text>
                </View>
              ))}
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}

function SheetLine({ label, value }: { label: string; value: string }) {
  const s = useStyles();
  return (
    <View style={s.ledgerRow}>
      <Text style={s.sub}>{label}</Text>
      <Text style={s.name}>{value}</Text>
    </View>
  );
}
```

(If the `Screen` ScrollView wrapper cannot host a `Sheet` overlay correctly, move `<Sheet>` inside the scroll body — matches how `jobs.tsx` hosts its `CompleteSheet`.)

Styles: reuse the `row/texts/name/sub/chip/right/qty` shapes from the dash-op card styles; add `search: { flexDirection: "row", alignItems: "center", gap: tokens.space.sm, minHeight: 44, borderRadius: tokens.radius.md, borderWidth: 1, borderColor: t.color.line, backgroundColor: t.color.surface, paddingHorizontal: tokens.space.md }`, `searchInput: { flex: 1, color: t.color.ink, fontFamily: tokens.font.sans, fontSize: tokens.size.xs }`, `sheetBody: { gap: tokens.space.xs, paddingBottom: tokens.space.xl }`, `ledgerTitle: { color: t.color.ink3, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.eyebrow, marginTop: tokens.space.md }`, `ledgerSub: { color: t.color.ink4, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow }`, `ledgerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 34 }`, `qtyAfter: { color: t.color.ink3 }`.

- [ ] **Step 3: Typecheck + commit**

Run: `npx tsc --noEmit` — Expected: inventory clean; `npx jest` PASS.

```bash
git add -A mobile/app mobile/src
git commit -m "feat(mobile): operator inventory tab with reorder flags and ledger drill-down"
```

---

### Task 9: Workers tab — `(tabs)/workers.tsx` (new), delete `staff.tsx`

**Files:**
- Create: `mobile/app/(tabs)/workers.tsx`
- Delete: `mobile/app/staff.tsx`

**Interfaces:**
- Consumes: `useStaff`, `addWorker`, `useAttendanceToday`, `markAttendance`, `usePayrollRuns`, `usePayrollLines`, `AttendanceMark` from `@/data/operator`; `qk`; `Sheet`, `DropdownSelect` not needed (status chips instead).
- Produces: `WorkersScreen` default export (tab id `workers`), three segments `Workers | Attendance | Payroll`.

- [ ] **Step 1: git rm mobile/app/staff.tsx**

- [ ] **Step 2: Write the screen**

Structure — one component, `const [seg, setSeg] = useState<"workers" | "attendance" | "payroll">("workers")`, same `segRow` buttons as Task 7. Import list:

```tsx
import { useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, TextInput, Alert } from "react-native";
import { useQueryClient, useIsFetching } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import { UserPlus, ChevronRight } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { GradientHeader } from "@/components/GradientHeader";
import { HeaderRight } from "@/components/HeaderRight";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonRows } from "@/components/SkeletonRows";
import { Sheet } from "@/components/Sheet";
import { PressCard } from "@/components/PressCard";
import { useSession } from "@/lib/session";
import { roleLabel } from "@/lib/claims";
import { friendlyError } from "@/lib/rpc";
import { moneyINR } from "@/lib/format";
import { qk } from "@/data/keys";
import {
  useStaff, addWorker, useAttendanceToday, markAttendance,
  usePayrollRuns, usePayrollLines, type AttendanceMark, type WorkerRow,
} from "@/data/operator";
import { tokens } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeContext";
```

**Workers segment** — `staff = useStaff()`; rows: kind icon dot (user = brand, worker = neutral via small colored View), name, phone sub, `StatusBadge label={r.status ?? "active"}`. Header strip button `+ Add worker` opens `addOpen` Sheet with three `TextInput`s (name, phone, aadhar) and a submit `Pressable`:

```tsx
  async function onAddWorker() {
    if (!newName.trim()) {
      Toast.show({ type: "error", text1: "Name is required" });
      return;
    }
    setBusyAdd(true);
    try {
      await addWorker({
        fullName: newName.trim(),
        phone: newPhone.trim() ? newPhone.trim() : null,
        aadhar: newAadhar.trim() ? newAadhar.trim() : null,
      });
      Toast.show({ type: "success", text1: "Worker added" });
      setAddOpen(false);
      void qc.invalidateQueries({ queryKey: qk.opStaff() });
    } catch (e) {
      Toast.show({ type: "error", text1: "Could not add worker", text2: friendlyError(e) });
    } finally {
      setBusyAdd(false);
    }
  }
```

**Attendance segment** — `att = useAttendanceToday()`. Combine `useStaff().data` (workers+users) with today's rows client-side using the `entityId` added in Task 3 Step 6:

```tsx
  const attByEntity = useMemo(() => {
    const m = new Map<string, { status: string; hours: number }>();
    for (const a of att.data ?? []) m.set(`${a.entityType}:${a.entityId}`, { status: a.status, hours: a.hours });
    return m;
  }, [att.data]);
```

Each staff row: name + five chip buttons `P A ½ L W` mapping to statuses `present|absent|half_day|leave|week_off`; active chip = current mark. Chip press stores in local `draft: Record<string, AttendanceMark["status"]>` keyed `entityType:id` (hours derived: present 8, half_day 4, else 0; otHours 0) and calls `markAttendance([row])` immediately:

```tsx
  async function onMark(entityType: "user" | "worker", entityId: string, status: AttendanceMark["status"]) {
    setBusyId(entityId);
    try {
      await markAttendance([{
        entityType, entityId, status,
        hours: status === "present" ? 8 : status === "half_day" ? 4 : 0,
        otHours: 0,
      }]);
      void qc.invalidateQueries({ queryKey: qk.opAttendanceToday() });
    } catch (e) {
      Toast.show({ type: "error", text1: "Could not save", text2: friendlyError(e) });
    } finally {
      setBusyId(null);
    }
  }
```

Caption under the segment: `Only today can be marked — the office locks earlier days.`

**Payroll segment** — `runs = usePayrollRuns()`; cards: `dateIST-ish period (YYYY-MM → "MMM YYYY")` use existing format helpers: render `r.periodMonth` raw with `moneyCompact(r.totalGross)` + StatusBadge tone by status (`draft: neutral, computed: amb, posted: brand, paid: grn`). Tap sets `payrollRunId`; Sheet with `usePayrollLines(payrollRunId)` rows: name, `moneyINR(l.gross)`, `StatusBadge label={l.paid ? "paid" : "unpaid"}`.

- [ ] **Step 3: Typecheck + tests + commit**

Run: `npx tsc --noEmit` (clean) and `npm test` (PASS).

```bash
git add -A mobile/app mobile/src
git commit -m "feat(mobile): workers tab - roster, add worker, today attendance, payroll view"
```

---

### Task 10: History tab — `(tabs)/history-op.tsx` (new)

**Files:**
- Create: `mobile/app/(tabs)/history-op.tsx`
- Create: `mobile/src/features/history/StockHandoverSheet.tsx`
- Create: `mobile/src/lib/opHistory.ts`
- Test: `mobile/src/lib/__tests__/opHistory.test.ts`

**Interfaces:**
- Consumes: `useMyActivity` + `ActivityRow` from `@/data/activity`, `useMyRuns` + `RunHistoryRow` from `@/data/operator`, `useMyCustody`, `respondTransfer`, `cancelTransfer` from `@/data/transfers`, `useBranches`, `useStaff`, `useStockLevels`, `createStockTransfer` (Task 3), `DropdownSelect`, `Sheet`, `StatusBadge`.
- Produces: `HistoryOpScreen` default export (tab id `history`); pure `mergeOperatorActivity(activity: ActivityRow[], runs: RunHistoryRow[]): OpActivityRow[]` exported from `src/lib/opHistory.ts`.

- [ ] **Step 1: Write the failing test**

```typescript
// mobile/src/lib/__tests__/opHistory.test.ts
import { mergeOperatorActivity } from "../opHistory";

it("merges sales, payments and runs newest-first with distinct kinds", () => {
  const out = mergeOperatorActivity(
    [
      { id: "i1", kind: "sale", docNo: "CM-1", name: "Store A", amount: 100, createdAt: "2026-09-13T09:00:00Z" },
      { id: "p1", kind: "payment", docNo: "RC-1", name: "Store B", amount: 50, createdAt: "2026-09-13T10:00:00Z" },
    ],
    [
      { id: "r1", runNo: "PR-9", runDate: "2026-09-13", stage: 1, outputQty: 200, unitCost: 1, wastage: 0, status: "posted", notes: null, createdAt: "2026-09-13T11:00:00Z", itemName: "Preform", posterName: "Me" },
    ],
  );
  expect(out.map((r) => r.kind)).toEqual(["run", "payment", "sale"]);
  expect(out[0].docNo).toBe("PR-9");
  expect(out[0].name).toBe("Preform");
});
```

- [ ] **Step 2: Run — expect FAIL (module missing)**

`npx jest src/lib/__tests__/opHistory.test.ts`

- [ ] **Step 3: Implement `src/lib/opHistory.ts`**

```typescript
import type { ActivityRow } from "@/data/activity";
import type { RunHistoryRow } from "@/data/operator";

export type OpActivityRow = ActivityRow | {
  id: string; kind: "run"; docNo: string; name: string | null; amount: number; createdAt: string;
};

export function mergeOperatorActivity(
  activity: ActivityRow[], runs: RunHistoryRow[],
): OpActivityRow[] {
  const runRows: OpActivityRow[] = runs.map((r) => ({
    id: r.id, kind: "run" as const, docNo: r.runNo, name: r.itemName, amount: r.outputQty, createdAt: r.createdAt,
  }));
  return [...activity, ...runRows].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}
```

- [ ] **Step 4: Run — expect PASS. Then write the screen.**

`history-op.tsx` skeleton (imports mirror Task 7's list + these): `SegmentedToggle`-style two buttons `Activity | Handovers`.

Activity render: group `mergeOperatorActivity(myActivity.data ?? [], myRuns.data ?? [])` by `dateIST(r.createdAt)` — reuse the exact grouping approach from `(tabs)/history.tsx`. Row icon per kind: run = `Factory`, sale = `ArrowUp`, payment = `ArrowDown`. Amount column: sale/payment `moneyINR(amount)`; run shows `${amount.toLocaleString("en-IN")} units`.

Handovers render: `custody = useMyCustody()` — render EVERY row RLS returns (stock legs carry `type: "stock"`, `amount: 0`, and a `note`). Show `transfer_no`, a type chip, a status badge, and `from → to` names resolved from `useStaff().data` by `from_user_id`/`to_user_id` (a null id renders `"Warehouse"`). Actions as in agent history: accept/reject when `to_user_id === uid && status === "pending"`; cancel when `from_user_id === uid && status === "pending"` — via `respondTransfer`/`cancelTransfer`, then invalidate `qk.custody()` + `qk.stockLevels()` + `qk.opTodayProduction()`.
Header strip: `+ Stock handover` button opens `StockHandoverSheet.tsx` under `mobile/src/features/history/` (separate file to keep route files focused):

State: `branchId` (`DropdownSelect` over `useBranches().data` — options label `b.name + (b.isWarehouse ? " (warehouse)" : "")`), `userId` (`DropdownSelect` over `useStaff().data.filter(r => r.kind === "user")`), `itemId` (`DropdownSelect` over `useStockLevels().data.filter(r => r.branchName === selectedBranchName && r.qtyOnHand > 0)` — label includes on-hand qty), `qtyText`, `noteText`. All controls required; Submit disabled while any missing. Submit:

```tsx
      await createStockTransfer({
        fromBranchId: branchId, toUserId: userId,
        lines: [{ itemId, qty: Number(qtyText) }],
        note: noteText.trim() || null,
      });
```

Validate: all four set + `Number(qtyText) > 0` → else toast. On success: toast "Handover created", close, invalidate `qk.custody()` + `qk.stockLevels()`.

- [ ] **Step 5: Typecheck + tests + commit**

```bash
git add mobile/src/lib/opHistory.ts mobile/src/lib/__tests__/opHistory.test.ts "mobile/app/(tabs)/history-op.tsx" mobile/src/features/history
git commit -m "feat(mobile): operator history tab with activity and stock handovers"
```

---

### Task 11: Shell wiring — 7-tab layout, redirect, badges, deletions

**Files:**
- Modify: `mobile/app/(tabs)/_layout.tsx`
- Modify: `mobile/app/index.tsx`
- Delete: `mobile/app/more-op.tsx`, `mobile/app/(tabs)/_layout.tsx.bak`

**Interfaces:**
- Consumes: Task 2 `tabs.ts` (`tabsForRole`, `HOME_TAB`), all screens from Tasks 5-10, `qk`, `useMyCustody(enabled)`, `useJobCards(enabled)`, `useOrders(enabled)`, BottomNav `compact`.

- [ ] **Step 1: Delete orphans**

```bash
git rm mobile/app/more-op.tsx "mobile/app/(tabs)/_layout.tsx.bak"
```

- [ ] **Step 2: Rewrite `_layout.tsx` imports & definitions**

Remove: inline `TabDef`, `AGENT_TABS`, `MANAGER_TABS`, `OPERATOR_TABS` (lines 28-72 replaced by `import { tabsForRole, type TabDef } from "@/lib/tabs";`), remove now-unused icon imports not used elsewhere in the file (keep only what screens map needs), remove `ProfileScreen`/`StockScreen` imports; add:

```typescript
import OrdersScreen from "./orders";
import InventoryScreen from "./inventory";
import ProductionScreen from "./production";
import WorkersScreen from "./workers";
import HistoryOpScreen from "./history-op";
import { useMyCustody } from "@/data/transfers";
import { useJobCards } from "@/data/production";
import { useOrders } from "@/data/sales";
```

(Delete the `import ProfileScreen from "../profile";` and `import StockScreen from "./stock";` and `import JobsScreen from "./jobs";` — ProductionScreen replaces it.)

Screen maps:

```typescript
const OPERATOR_SCREENS: Record<string, ComponentType> = {
  "dash-op": DashOpScreen,
  orders: OrdersScreen,
  inventory: InventoryScreen,
  production: ProductionScreen,
  workers: WorkersScreen,
  history: HistoryOpScreen,
};
```

(Agent/manager maps unchanged.)

- [ ] **Step 3: Layout body**

```typescript
  const tabs = tabsForRole(claims.roles);
  const screens = isOperator ? OPERATOR_SCREENS : isAgent ? AGENT_SCREENS : MANAGER_SCREENS;
  const homeTab = isOperator ? HOME_TAB.operator : isAgent ? HOME_TAB.agent : HOME_TAB.manager;
```

import `HOME_TAB`. Delete `pushingRun` ref and the `"run"` branch of `onChange`/`onGotoTab` subscription (`openSell`/`"sell"` interception stays for managers). Scan now just `setActive("scan")` (falls into the default branch — ensure `onChange` default does that for operator scan, exactly like agent scan already does).

Badges (operator only):

```typescript
  const jobs = useJobCards(isOperator);
  const ord = useOrders(isOperator);
  const cust = useMyCustody(isOperator);
  const badgeCounts = useMemo(() => {
    if (!isOperator) return {};
    const openJobs = (jobs.data ?? []).filter((j) => j.status === "pending" || j.status === "in_progress").length;
    const approved = (ord.data ?? []).filter((o) => o.status === "approved").length;
    const pending = (cust.data ?? []).filter((c) => c.status === "pending" && c.to_user_id === user?.id).length;
    return { production: openJobs, orders: approved, history: pending };
  }, [isOperator, jobs.data, ord.data, cust.data, user?.id]);
```

(`const { user, claims } = useSession();`)
Render: `<BottomNav tabs={tabs} active={active} onChange={onChange} badgeCounts={badgeCounts} compact={tabs.length >= 7} />`.

- [ ] **Step 4: index redirect**

`mobile/app/index.tsx` line 26: `const homeTab = claims.roles.includes("operator") ? "jobs" : "home";` → `const homeTab = claims.roles.includes("operator") ? HOME_TAB.operator : claims.roles.includes("agent") ? HOME_TAB.agent : HOME_TAB.manager;` with `import { HOME_TAB } from "@/lib/tabs";` (this also fixes manager landing on a real manager screen — previously redirected to agent `/home`).

- [ ] **Step 5: Typecheck + tests + full-bundle smoke**

Run: `npx tsc --noEmit` → Expected: zero errors project-wide.
Run: `npm test` → PASS.
Run: `npx expo export --platform android --output-dir /tmp/exp-op-check` — Expected: bundle succeeds (catches any runtime import the type-checker can't see). Delete the export dir after.

- [ ] **Step 6: Commit**

```bash
git add mobile/app
git commit -m "feat(mobile): 7-tab operator shell with badges; drop orphan stubs"
```

---

### Task 12: Release — version bump, signed APK, device pass

**Files:**
- Modify: `mobile/app.json` (`expo.version` + `expo.android.versionCode`)
- Modify: `mobile/android/app/build.gradle` (`versionCode` must match app.json — prebuild-synced value)

**Interfaces:** Consumes everything above. Produces: installable `app-release.apk`.

- [ ] **Step 1: Bump versions** — read `mobile/app.json`; set `expo.version` to the current patch +1 (e.g. `1.0.2` → `1.0.3`) and `expo.android.versionCode` to current +1; set `versionCode` in `mobile/android/app/build.gradle` to the same new number (`versionName` too if present).

- [ ] **Step 2: Build**

```powershell
cd mobile/android; .\gradlew assembleRelease --console=plain
```

Expected: `BUILD SUCCESSFUL`; output `mobile/android/app/build/outputs/apk/release/app-release.apk`.

- [ ] **Step 3: Install** — `adb devices` then `adb -s <serial> install -r mobile/android/app/build/outputs/apk/release/app-release.apk`.

- [ ] **Step 4: Device walkthrough (operator account)** — required checklist, log result of each:
 1. Login lands on Dash; 7 tabs visible, Scan FAB centered, badges render.
 2. Production: see jobs; Post run → /post-run succeeds → run appears in Runs chip, Dash tiles, Inventory qty.
 3. Orders: approved order → Print challan opens web PDF (record whether the print page requires web login — known risk, Task 7 Step 3).
 4. + Sale / + Collect flows complete and Dash KPIs move.
 5. Challans: dispatch → delivered status transitions work.
 6. Inventory: search, low pills, ledger sheet.
 7. Workers: add worker appears; mark all 5 attendance chips (reopen app to confirm persistence); payroll lists.
 8. History: activity lists today's run + sale + payment; create stock handover; office-side acceptance round-trip if available.
 9. Scan: store QR resolves to store card with Sell/Collect/Deliver shortcuts, no visit buttons.

- [ ] **Step 5: Commit + tag**

```bash
git add mobile/app.json mobile/android/app/build.gradle
git commit -m "chore(mobile): bump version for operator release"
git tag mobile-v<version>
```

---

## Self-Review Notes (completed at write time)

- Spec §2-§13 mapped to Tasks: shell/redirect/badges → T2+T11; dash → T5; orders/challans/actions → T3+T7; inventory → T3+T8; scan reuse → T11 (agent screen untouched); production tab → T6; workers/payroll → T9; history/handover → T3+T10; invalidation matrix → T5-T11 steps; tests → T1/T2/T10 + tsc/jest gates + T11 export smoke; release checklist → T12.
- No manager/agent regression: layout keeps their tab sets verbatim via `tabs.ts`; `useOrders`/`useJobCards`/`useMyCustody` signature changes are additive default params.
- Known accepted risk (documented, not silently deferred): challan web-PDF auth (Task 7 Step 3) and the qty-clamp edge when the office partially fulfilled a line after sync (server validates; toast explains).
