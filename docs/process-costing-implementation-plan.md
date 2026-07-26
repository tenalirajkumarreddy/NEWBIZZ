# Process Costing — Implementation Plan

## 1. Overview

The Process Costing module computes the **cost to make** each manufactured item per month using
weighted-average process costing. It is a **valuation/reporting** read-model — it reads
ledger journals + production runs, runs a five-step computation, and writes snapshot tables
for the UI to consume. It posts no sales journals and is rebuildable at any time.

Produces two numbers per product per month:
- **COGM per case** — direct materials + direct labour + manufacturing overhead
- **Fully-loaded per case** — COGM + allocated period costs (admin/selling/finance)

Data flow: `production_runs` + `journal_lines` + `overhead_pools` → `run_process_costing`
→ `costing_runs` + `costing_run_lines` + `product_cost_snapshots` → `compute_loaded_cost`
→ `product_cost_snapshots.loaded_per_case`

## 2. Existing Data Model (migration 0019)

All tables and RPCs are already built in `0019_process_costing.sql`:

| Table | Purpose |
|-------|---------|
| `cost_accounts_tag` | Classifies each cost account for COGM vs period |
| `overhead_pools` | Indirect cost pools (estimated/actual) per month+stage |
| `costing_runs` | One WA computation per month+stage (draft/final) |
| `costing_run_lines` | Per-output-item cost breakdown |
| `product_cost_snapshots` | Per-item COGM + loaded per case per month (PK: item_id, period_month) |

| RPC | Purpose |
|-----|---------|
| `run_process_costing(month, stage, finalize)` → run_id | Five-step WA method; writes runs + snapshots |
| `compute_loaded_cost(month)` | Spreads period costs over FG cases → updates snapshots |
| `set_cost_account_class(code, class)` | Classify a cost account |
| `costing_untagged_accounts(month)` → table | Lists unclassified expense accounts used in month |

## 3. Application Layer

### 3.1 Data Readers (`lib/data/costing.ts`)

**`listCostingRuns()`** — returns all costing runs with computed summary.
**`getCostingRun(id)`** — single run with per-item lines joined with item details.
**`listOverheadPools(month?, stage?)`** — filterable overhead pools.
**`listCostSnapshots(month?)`** — product cost snapshots per item per month.
**`costingUntaggedAccounts(month)`** — lists unclassified cost accounts used in month.

### 3.2 Server Actions (`lib/actions/costing.ts`)

| Action | RPC/Query | Description |
|--------|-----------|-------------|
| `runProcessCosting(month, stage, finalize)` | `run_process_costing` | Compute WA costing |
| `computeLoadedCost(month)` | `compute_loaded_cost` | Spread period costs |
| `upsertOverheadPool(input)` | direct INSERT/UPDATE on `overhead_pools` | CRUD for pools |
| `deleteOverheadPool(id)` | DELETE on `overhead_pools` | Remove a pool |

### 3.3 Validation

- Month must be a first-of-month date
- Stage must be 1 or 2
- `run_process_costing` raises if zero production for the month+stage
- Finalize blocked if untagged cost accounts exist
- Overhead pool: name + stage + period_month unique

## 4. User Interface

### 4.1 Page Tree

```
/costing                    → Costing dashboard
/costing/runs/[id]          → Costing run detail
```

### 4.2 Dashboard (`/costing`)

Two sections:

**Section 1 — Costing Runs (panel, flush).** Table with columns:
- Period (month), Stage (badge 1/2), Status (draft/final badge), Units Completed, Mat/unit, Conv/unit, Transferred-in/unit, COGM/unit, Loaded/unit
- Action column: "Run" button (re-runs costing), "Finalize" toggle, "Compute Loaded" button
- Empty state: "No costing runs yet — run costing for a month + stage"

**Section 2 — Overhead Pools (panel).** Table with columns:
- Name, Stage, Month, Amount, Source (estimated/actual), Driver
- Inline add form at bottom or modal
- Delete button per row

### 4.3 Detail Page (`/costing/runs/[id]`)

- Summary cards: Period, Stage, Status, Units, COGM/unit, Loaded/unit, Mat/unit, Conv/unit, TI/unit
- Per-item breakdown table: Item (SKU + name), Units, Materials, Conversion, Transferred-in, COGM total, COGM/unit
- Compute metadata: computed at, computed by

## 5. Permissions

| Action | Permission |
|--------|-----------|
| View costing runs & snapshots | `report.view_all` |
| Run / finalize costing | `report.view_all` (via definer RPC) |
| Manage overhead pools | `config.edit` |

Nav entry at `/costing` gated by `report.view_all`. Both permissions are already seeded
in migration 0019 and granted to manager + accountant.

## 6. Acceptance Criteria

- [ ] Dashboard shows all costing runs with month/stage/status
- [ ] "Run Costing" triggers WA computation and shows results
- [ ] "Finalize" blocks if untagged accounts exist
- [ ] "Compute Loaded" spreads period costs
- [ ] Overhead pool CRUD works
- [ ] Detail page shows per-item cost breakdown
- [ ] Zero production month shows appropriate message
