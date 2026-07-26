# Production Runs — Implementation Plan

## 1. Overview

The Production Runs module records an end-of-day (EOD) manufacturing event: a single atomic
transaction that consumes raw/WIP inputs at their current weighted-average cost and produces
finished-good (or next-stage WIP) output at the derived unit cost. Abnormal wastage is
expensed to account 5170; rounding paise are trued up so that clearing account 1225 nets
to exactly zero per run.

Two-stage manufacturing is explicitly supported:
- **Stage 1 (Blowing):** raw material (preform) → empty bottle (WIP item)
- **Stage 2 (Filling):** WIP bottle + caps + labels + water → filled case (FG item)

Each stage has its own BOM (defined in the BOM/Recipes module). When posting a run without
explicit inputs, `post_production_run` calls `explode_bom` to resolve the active BOM.

## 2. Data Model

Already fully implemented in migration `0018_production.sql`:

### `production_runs` (header)
| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid PK` | |
| `run_no` | `text` | Auto-numbered via `next_number('prun', date)` |
| `fy_id` | `uuid FK → financial_years` | |
| `branch_id` | `uuid FK → branches` | Defaults to HO |
| `run_date` | `date` | Defaults to current_date |
| `stage` | `int` | 1 = blowing, 2 = filling |
| `output_item_id` | `uuid FK → items` | Must be wip or finished_good |
| `output_qty` | `numeric(14,3)` | Good units produced |
| `output_unit_cost` | `numeric(14,4)` | Derived WA cost (computed on post) |
| `input_value` | `numeric(14,2)` | Σ consumed value | 
| `abnormal_wastage_value` | `numeric(14,2)` | Default 0 |
| `journal_run_id` | `uuid` | Shared source_id for all journal entries in this run |
| `status` | `production_status` | `posted` or `reversed` |
| `notes` | `text` | |
| `created_by` | `uuid FK → users` | |
| `created_at` | `timestamptz` | |

### `production_run_inputs` (child lines)
| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid PK` | |
| `run_id` | `uuid FK → production_runs` | Cascade delete |
| `item_id` | `uuid FK → items` | The input consumed |
| `qty` | `numeric(14,3)` | Base units consumed |
| `unit_cost` | `numeric(14,4)` | WAC at consumption |
| `value` | `numeric(14,2)` | qty × unit_cost |
| `line_no` | `int` | |

### Key RPC: `post_production_run(p_header jsonb, p_inputs jsonb default '[]')`
Already built in migration 0018. Accepts:
- **header:** `{ output_item_id, output_qty, run_date?, branch_id?, stage?, abnormal_wastage_value?, notes? }`
- **inputs:** `[ { item_id, qty }, ... ]` — if omitted/empty, explodes active BOM

Returns the new `run_id` (uuid). Runs as a single atomic transaction (definer rights).

## 3. Application Layer

### 3.1 Data Readers (`lib/data/production.ts`)

```typescript
interface ProductionRunRow {
  id: string;
  runNo: string;
  runDate: string;           // ISO date
  stage: number;             // 1 | 2
  outputItemId: string;
  outputSku: string;
  outputName: string;
  outputQty: number;
  outputUnitCost: number;
  inputValue: number;
  abnormalWastage: number;
  status: string;            // "posted" | "reversed"
  notes: string | null;
  createdBy: string;
  createdAt: string;
  inputCount: number;
}

interface ProductionRunDetail extends ProductionRunRow {
  inputs: ProductionRunInputRow[];
}

interface ProductionRunInputRow {
  id: string;
  itemId: string;
  itemSku: string;
  itemName: string;
  qty: number;
  unitCost: number;
  value: number;
  lineNo: number;
}
```

**Functions:**
- `listRuns(opts?)` — paginated, filterable by stage/date/status
- `getRun(id)` — single run with inputs joined

### 3.2 Server Actions (`lib/actions/production.ts`)

- `postProductionRun(input: PostRunInput)` — calls `post_production_run` RPC with header only (no explicit inputs → BOM auto-explodes)
  - Validates: output item exists, output qty > 0, notes length check
  - Returns `{ ok: true, runId }` or `{ ok: false, error }`
  - Revalidates `/production` path

### 3.3 Validation Rules

| Rule | Enforcement |
|------|------------|
| Output item must exist and be stocked | RPC raises |
| Output item type must not be `service` | RPC raises |
| Output qty must be > 0 | Client + RPC |
| Stage can be 1 or 2 | Client (select) |
| Abnormal wastage must be ≥ 0 (default 0) | Client + RPC |
| A BOM must exist for the output item | RPC raises if no inputs given and no BOM |
| Run is immutable once posted (only reverse) | DB — no update RPC exists |

## 4. User Interface

### 4.1 Page Tree

```
/production            → List all production runs
/production/new        → Post a new production run (auto-explode BOM)
/production/[id]       → Production run detail
```

### 4.2 List Page (`/production`)

- **Layout:** Max-width 1200px, same pattern as BOM/pricing lists
- **Header:** Title "Production Runs", subtitle with total count
- **Actions:** "New Run" button → `/production/new`
- **Table columns:** Run #, Date, Stage (badge: "Stage 1 Blowing" / "Stage 2 Filling"), Output Item (SKU + name), Output Qty, Input Value (INR), Unit Cost (INR), Status (badge: posted/reversed)
- **Empty state:** "No production runs yet" with action to create one
- Each row links to `/production/[id]`

### 4.3 New Run Page (`/production/new`)

- **Layout:** Max-width 900px, Panel-based form
- **Back link:** ← Production Runs
- **Header:** "New Production Run"

**Form fields (Panel "Run Details"):**
- **Stage** — Select 1 or 2 (radio or dropdown). Changes the output item filter:
  - Stage 1: filter items by `type = 'raw_material' | 'wip'`
  - Stage 2: filter items by `type = 'wip' | 'finished_good'`
- **Output Item** — Select from filtered items (SKU — name)
- **Output Quantity** — Number input (mono), default 1
- **Run Date** — Date input, default today
- **Abnormal Wastage (₹)** — Optional number input (mono), default 0
- **Notes** — Optional textarea

**Validation:** Output item required, qty > 0, stage required

**Submit:** Button "Post Production Run" → calls `postProductionRun` action → on success, redirect to detail page.

No input lines shown to the user — the BOM auto-explodes. This is the recommended simple flow. A future enhancement could show an "Inputs Preview" after selection.

### 4.4 Detail Page (`/production/[id]`)

- **Header:** Run #, output item name, stage badge, status badge
- **Summary cards (3-column grid):**
  - Output Qty, Unit Cost, Input Value, Abnormal Wastage
- **Inputs table (Panel):** Item (SKU + name), Qty, Unit Cost, Value, Line #
- **Notes panel** (if notes present)
- **Metadata:** Run date, created by

## 5. Permissions

| Action | Required Permission | Notes |
|--------|-------------------|-------|
| View production runs | `production.run` | Nav item + RLS (already seeded in RLS: `read_all_auth`) |
| Post production run | `production.run` | Via `post_production_run` definer RPC (permission gated at RPC level if needed) |

The `production.run` permission must be seeded into the `permissions` table and assigned to
roles in `role_permissions` (e.g., manager, accountant). See baseline matrix in the
master build plan.

**Navigate via:** `nav.ts` → Manufacturing → "Production Runs" (perm: `production.run`)

## 6. Acceptance Criteria

### Phase 1 — Data Layer
- [ ] `listRuns()` returns all runs with computed summaries
- [ ] `getRun()` returns full detail with joined inputs
- [ ] `postProductionRun()` calls `post_production_run` RPC and returns the run id

### Phase 2 — UI
- [ ] List page shows all runs with stage/status badges
- [ ] New run form posts a production run (auto-explodes BOM)
- [ ] Detail page shows run header, inputs table, and cost summary
- [ ] Stage-aware item filtering (stage 1 → raw/wip, stage 2 → wip/finished_good)

## 7. Future Phases (Not in Scope)

| Feature | When |
|---------|------|
| Show auto-resolved inputs before posting (preview) | Phase 2.5 |
| Reverse/cancel a production run | Phase 4 |
| Process costing UI | Phase 3 |
| Production planning / job cards | Phase 3 |
