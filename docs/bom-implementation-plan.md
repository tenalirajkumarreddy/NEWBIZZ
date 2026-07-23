# BOM / Recipes Module — Implementation Documentation

**Date:** 2026-07-23
**Business:** Water bottle manufacturing (2-stage: Blowing → Filling)
**Stack:** Next.js (App Router) + Supabase (PostgreSQL, Auth, RLS)
**Status:** Planning / Pre-implementation

---

## 1. Overview

### 1.1 Purpose

The Bill of Materials (BOM) module is the **recipe engine** for manufactured items. It describes *what goes into what* — the structured, versioned tree of components required to produce each finished or intermediate good. It is:

- **Master Data** — no ledger/stock impact; describes composition only
- **Versioned** — effective-dated windows; only one active BOM per item at any time
- **Two-stage aware** — Stage 1 (blowing) BOM produces empty bottles (wip); Stage 2 (filling) BOM consumes empty bottles and produces filled cases (finished_good)
- **Supplier-decoupled** — BOM references items (or alternate groups), NOT suppliers; suppliers come from AVL (§5.3 of master plan, not yet built)

### 1.2 Key Design Decisions

| Decision | Rationale | Source |
|----------|-----------|--------|
| BOM lines reference **items**, not categories | Audit 2.5 fix: category is reporting only | Design Spec Audit + Master Build Plan §6.1 |
| Standard cost = planning only; actuals = WA | BOM cost is estimation; production runs use weighted-average | Master Build Plan §6.1 |
| Effective-dated versioning with overlap rejection | Ensures one active recipe per item at any time | Migration 0017 |
| Alternate groups for interchangeable components | e.g., "28mm cap: vendor A or vendor B" | Migration 0017 |
| Scrap percentage per BOM line | Captures normal process loss in cost estimation | Master Build Plan §6.1 |
| Single-level explosion | Two-stage model uses one BOM per stage; multi-level achieved by sequential calls | Migration 0017 |
| Stage field on BOM header | 1=blowing, 2=filling — enables per-stage validation and UI grouping | Migration 0017 |

### 1.3 Dependencies

| Module | Dependency | Notes |
|--------|-----------|-------|
| Items & UOM (§4.1) | Required | Every BOM child/parent must exist in items master. Item types: `raw_material`, `wip`, `finished_good`, `consumable`, `service`. Parent must be `wip` or `finished_good`. |
| Production Runs (§6.4) | Consumer | EOD can auto-explode BOM if no explicit inputs |
| Production Planning (§6.2) | Consumer | Plan uses BOM to compute material requirements |

**Not-yet-built dependencies** (plan for fallback):

| Dependency | Status | Fallback |
|------------|--------|----------|
| UOM Conversions (`item_uom_conversions`, §1.10) | ❌ Not migrated | BOM quantities are in child item's base UOM (`stock_uom`). Conversions needed only if purchase/consumption UOM differs. |
| AVL / Suppliers (`item_suppliers`, §5.3) | ❌ Not migrated | `bom_standard_cost` uses current WA cost from `stock` as stand-in. AVL preferred pricing will replace when the table lands. |

---

## 2. Data Model

### 2.1 Entity Relationship (matches migration 0017)

```
alternate_groups (swappable component groups)
  ├── id (PK)
  ├── name (text, unique)
  └── notes (text)

alternate_group_members (items in an alternate group)
  ├── id (PK)
  ├── group_id → alternate_groups.id (CASCADE delete)
  ├── item_id → items.id
  ├── priority (int, lower = preferred)
  ├── is_default (boolean)
  └── UNIQUE(group_id, item_id)

boms (recipe version header)
  ├── id (PK)
  ├── parent_item_id → items.id
  ├── stage (int, 1=blowing, 2=filling)
  ├── output_qty (numeric(14,3), yield per batch in base units)
  ├── effective_from (date)
  ├── effective_to (date, nullable)
  ├── notes (text)
  ├── status (text, default 'active')
  ├── created_by → users.id
  ├── created_at
  └── updated_at (via trigger)

bom_lines (component rows)
  ├── id (PK)
  ├── bom_id → boms.id (CASCADE delete)
  ├── child_item_id → items.id (nullable — XOR with alternate_group_id)
  ├── alternate_group_id → alternate_groups.id (nullable)
  ├── quantity_per (numeric(14,4)) — gross-of-scrap qty per output_qty batch
  ├── scrap_percent (numeric(6,3), default 0)
  ├── line_no (int)
  └── created_at
```

### 2.2 Constraints & Invariants

1. **XOR child reference**: A BOM line must reference EITHER a `child_item_id` OR an `alternate_group_id`, never both (DB constraint)
2. **No circular references**: `upsert_bom` RPC rejects if `child_item_id = parent_item_id` (immediate cycle). Multi-level cycles prevented by application logic + `explode_bom` raising on infinite loop.
3. **Overlap-free windows**: For the same `parent_item_id`, no two active BOMs may have overlapping `[effective_from, effective_to)` ranges (enforced by `upsert_bom` RPC via `daterange &&` operator)
4. **Default member**: An alternate group has at most one default member (`unique index where is_default`)
5. **Active item**: Cannot reference a `discontinued` or `inactive` item in an active BOM (application-enforced)
6. **Status lifecycle**: `active` → can be closed by setting `effective_to`. `status` field supports manual deactivation. `active_bom_for()` only queries where `status = 'active'`.

### 2.3 Existing Database Schema (Migration 0017)

All tables and RPCs below are **already implemented** in `app/supabase/migrations/0017_bom.sql`:

| Object | Type | Purpose |
|--------|------|---------|
| `alternate_groups` | Table | Swappable component groups |
| `alternate_group_members` | Table | Members of alternate groups |
| `boms` | Table | BOM recipe versions (with `stage`, `output_qty`, `status`) |
| `bom_lines` | Table | Component lines (with `bom_id` FK, `line_no`, XOR child/group) |
| `resolve_bom_child(p_line)` | RPC | Resolves a BOM line to a concrete item (group → default member) |
| `active_bom_for(p_item, p_as_of)` | RPC | Finds the active BOM for an item on a date (raises on overlap) |
| `upsert_bom(p_header, p_lines)` | RPC | Creates a BOM with validation (overlap, cycle, audit_log) |
| `explode_bom(p_item, p_output_units, p_as_of)` | RPC | Single-level component demand with scrap + batch yield applied |
| `bom_standard_cost(p_item, p_output_units, p_as_of)` | RPC | Planning cost estimate at current WA cost |
| RLS Policies | 4 read + 4 manage | `purchase.manage` permission for writes |

**Note:** There is no update-in-place RPC. To modify a BOM, close the current version (`effective_to = yesterday`) and create a new one via `upsert_bom`.

---

## 3. RPC & Server-Side Functions

### 3.1 Existing Functions

#### `resolve_bom_child(p_line bom_lines) → uuid`

Resolves a BOM line to a concrete item ID. If the line references a concrete `child_item_id`, returns it directly. If it references an `alternate_group_id`, returns the group's default member (or lowest priority if no default).

#### `active_bom_for(p_item uuid, p_as_of date default current_date) → uuid`

Returns the active BOM ID for a given item on a given date. Only considers BOMs with `status = 'active'` whose `[effective_from, effective_to)` window covers `p_as_of`. Raises an exception if more than one active BOM matches (should never happen).

#### `upsert_bom(p_header jsonb, p_lines jsonb) → uuid`

Creates a new BOM version. Parameters:
- `p_header`: `{ parent_item_id, stage?, output_qty?, effective_from?, effective_to?, notes? }`
- `p_lines`: `[{ child_item_id?|alternate_group_id?, quantity_per, scrap_percent?, line_no? }]`

Validates: parent exists, no self-reference cycle, no date-range overlap, at least one line. Writes audit_log. Returns new BOM ID.

#### `explode_bom(p_item uuid, p_output_units numeric default 1, p_as_of date default current_date)`

Returns: `TABLE(child_item_id uuid, gross_qty numeric)`

**Single-level** explosion that:
1. Finds the active BOM for `p_item` on `p_as_of`
2. Resolves alternate groups to their default member
3. Computes `gross_qty = quantity_per * (1 + scrap_percent/100) * (p_output_units / output_qty)`
4. Returns all component rows ordered by `line_no`

This is single-level by design — each manufacturing stage has its own BOM. To compute total material demand for a filled case, call `explode_bom('FG-20L')` for Stage 2 and `explode_bom('BOT-EMPTY')` for Stage 1 separately.

**Edge cases handled:**
- No active BOM for item → raises exception
- Alternate groups → resolved to `is_default` member

#### `bom_standard_cost(p_item uuid, p_output_units numeric default 1, p_as_of date default current_date) → numeric`

Returns total estimated planning cost by:
1. Exploding the BOM via `explode_bom`
2. For each component, fetching current **weighted-average cost** from `stock` (stand-in until AVL table lands)
3. Summing `gross_qty * unit_wac` for all components

If a component has no stock record, its cost contribution is ₹0 (no error, just zero).

### 3.2 Functions to Build

| RPC | Purpose | Priority |
|-----|---------|----------|
| `close_bom(p_bom_id, p_effective_to)` | Set `effective_to` on a BOM, closing its version window | Phase 2 |
| `where_used(p_item_id, p_as_of)` | Upward explosion — find all BOMs consuming this item as a child | Phase 2 |
| `copy_bom(p_source_bom_id, p_new_effective_from)` | Clone a BOM version for the next period, incrementing dates | Phase 3 |

`create_bom`, `update_bom`, and `delete_bom` are **not needed** — `upsert_bom` handles creation and the close+create pattern handles updates. Direct deletes are not permitted (immutable recipes referenced by production runs should not vanish).

---

## 4. Application Layer Design

### 4.1 Data Readers (`app/src/lib/data/bom.ts`)

Following the existing pattern in `app/src/lib/data/catalog.ts`:

```typescript
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrap } from "./types";
import type { Database } from "@/lib/supabase/database.types";

type Tables = Database["public"]["Tables"];

export type ItemType = Database["public"]["Enums"]["item_type"];

// --------------------------------------------------------- BOM list

export interface BomListRow {
  id: string;
  parentItemId: string;
  parentSku: string;
  parentName: string;
  stage: number;
  outputQty: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  lineCount: number;
  status: string;
  createdBy: string;
  createdAt: string;
}

export async function listBoms(opts?: {
  status?: string;
  parentItemId?: string;
}): Promise<BomListRow[]>;

// --------------------------------------------------------- BOM detail

export interface BomLineDetail {
  id: string;
  lineNo: number;
  childItemId: string | null;
  childSku: string | null;
  childName: string | null;
  childType: ItemType | null;
  alternateGroupId: string | null;
  alternateGroupName: string | null;
  quantityPer: number;
  scrapPercent: number;
  standardCost: number;
  isSubAssembly: boolean;
}

export interface BomDetail {
  id: string;
  parentItemId: string;
  parentSku: string;
  parentName: string;
  parentType: ItemType;
  stage: number;
  outputQty: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  notes: string | null;
  status: string;
  lines: BomLineDetail[];
  standardCost: number | null;
  createdBy: string;
  createdAt: string;
}

export async function getBom(id: string): Promise<BomDetail | null>;
export async function getBomForItem(
  itemId: string,
  asOf?: string,
): Promise<BomDetail | null>;

// --------------------------------------------------------- Alternate groups

export interface AlternateGroupRow {
  id: string;
  name: string;
  notes: string | null;
  members: AlternateGroupMemberRow[];
}

export interface AlternateGroupMemberRow {
  id: string;
  itemId: string;
  itemSku: string;
  itemName: string;
  priority: number;
  isDefault: boolean;
}

export async function listAlternateGroups(): Promise<AlternateGroupRow[]>;
export async function getAlternateGroup(
  id: string,
): Promise<AlternateGroupRow | null>;

// --------------------------------------------------------- RPC wrappers

export interface BomExplosionRow {
  childItemId: string;
  childSku: string;
  childName: string;
  grossQty: number;
}

export async function explodeBom(
  itemId: string,
  outputUnits?: number,
  asOf?: string,
): Promise<BomExplosionRow[]>;

export async function whereUsed(
  itemId: string,
): Promise<WhereUsedRow[]>;

export async function bomStandardCost(
  itemId: string,
  outputUnits?: number,
  asOf?: string,
): Promise<number>;
```

### 4.2 Server Actions (`app/src/lib/actions/bom.ts`)

```typescript
"use server";

export interface CreateBomInput {
  parentItemId: string;
  stage?: number;
  outputQty?: number;
  effectiveFrom?: string;
  effectiveTo?: string | null;
  notes?: string;
  lines: {
    childItemId?: string;
    alternateGroupId?: string;
    quantityPer: number;
    scrapPercent?: number;
  }[];
}

export async function createBom(
  input: CreateBomInput,
): Promise<ActionResult<{ bomId: string }>>;
// Wraps the existing upsert_bom RPC.

export async function closeBom(
  id: string,
  effectiveTo: string,
): Promise<ActionResult>;
// Calls a to-build close_bom RPC (or direct UPDATE for now).

// Alternate Groups
export async function createAlternateGroup(
  input: { name: string; notes?: string },
): Promise<ActionResult<{ groupId: string }>>;

export async function upsertAlternateGroupMember(
  groupId: string,
  input: { itemId: string; priority?: number; isDefault?: boolean },
): Promise<ActionResult>;

export async function removeAlternateGroupMember(
  groupId: string,
  itemId: string,
): Promise<ActionResult>;
```

### 4.3 Validation Rules

1. **Parent item must be manufacturable** — type must be `finished_good` or `wip`
2. **Stage-aware**: Stage 1 expects `wip` parent; Stage 2 expects `finished_good` parent
3. **No circular references** — validate via `explode_bom` check (or `upsert_bom`'s own guard)
4. **Overlap check** — handled by `upsert_bom` RPC
5. **At least one component** — handled by `upsert_bom` RPC
6. **Quantity sanity** — `quantity_per > 0` (DB constraint)
7. **Scrap range** — `0 ≤ scrap_percent` (DB constraint; reasonable upper limit enforced in UI)
8. **Line uniqueness** — same child cannot appear twice in the same BOM (application-enforced)

---

## 5. User Interface Design

### 5.1 Page Structure

```
app/src/app/(app)/bom/
├── page.tsx              — BOM List (tab: Active | Future | Expired | All)
├── new/                  — Create BOM (wizard with item selector + component builder)
│   └── page.tsx
├── [id]/
│   ├── page.tsx          — BOM Detail (exploded tree, cost rollup, metadata, stage badge)
│   ├── edit/
│   │   └── page.tsx      — Close current + create replacement version
│   └── clone/
│       └── page.tsx      — Clone BOM as new version (increment effective_from)
├── alternate-groups/
│   ├── page.tsx          — Alternate Groups list
│   ├── new/
│   │   └── page.tsx      — Create alternate group
│   └── [id]/
│       └── page.tsx      — Edit alternate group members
└── where-used/
    └── [itemId]/
        └── page.tsx      — Where-used view for a specific item
```

### 5.2 UI Components to Build

| Component | Purpose | Reuse |
|-----------|---------|-------|
| `BomTable` | List view of BOMs | Extends `Table` + `THead` + `TBody` |
| `BomTree` | Visual component list with stage grouping | Custom |
| `BomLineEditor` | Inline form for adding/editing BOM lines | Uses `Field`, selects for items |
| `AlternateGroupSelector` | Pick or create an alternate group | Modal/Drawer pattern |
| `CostBreakdown` | Cost composition display | Uses existing `Panel` + `Money` |
| `ItemSearchSelect` | Searchable item picker with type filter | Reusable across modules |

### 5.3 Stage-Specific UI Details

- **BOM list**: Show a `Stage` badge (1=Blowing, 2=Filling) per BOM row
- **BOM detail**: Group components by stage in the exploded view
- **New BOM**: Stage selector (1 or 2) with guidance text about expected parent type
- **Parent item selector**: Filter items by type — Stage 1 shows `wip` items, Stage 2 shows `finished_good` items

---

## 6. Workflows

### 6.1 Creating a New BOM

```
1. User selects "New BOM" from the list page
2. Step 1: Select parent item (filtered to wip/finished_good, further filtered by stage)
3. Step 2: Set stage (1 or 2), effective dates, batch output_qty
4. Step 3: Add components:
   a. Search/add items as child components
   b. For each child: set quantity_per, scrap%, optionally assign to alternate group
   c. Validate: no duplicate children, active items only
5. Step 4: Review + Save → calls upsert_bom RPC
```

### 6.2 Managing BOM Versions

- Only one active version per parent item at any calendar date
- To update a BOM: close current version + create new version (the close+clone pattern)
- Status lifecycle: `active` → set `effective_to` or manual deactivation → effectively expired
- Version history: track via `created_at` and date windows, not a separate table

### 6.3 Two-Stage Manufacture Flow

```
Stage 1 (Blowing):
  BOM for Empty Bottle (BOT-EMPTY, type=wip, stage=1)
    consumes: Preform (PREF-20L)
  EOD: Preforms → Empty bottles at WAC

Stage 2 (Filling):
  BOM for Filled Case (FG-20L, type=finished_good, stage=2)
    consumes: Empty Bottles (BOT-EMPTY) + Caps + Labels + Water + Box
  EOD: Empty bottles + materials → Filled cases at WAC
```

Each stage has its own BOM. Explosion is single-level; two-stage explosion = two sequential `explode_bom` calls.

### 6.4 Alternate Group Resolution

```
When a BOM line references an alternate_group_id instead of a concrete child_item_id:
1. explode_bom RPC resolves to the group's is_default member
2. BOM detail UI shows a badge "via [Group Name]" on the component row
3. Alternate group management is separate from BOM editing:
   - Create/edit alternate groups independently
   - Assign items to groups with priority + default flag
   - BOM lines reference the group, not the concrete items
4. Advantage: Swap suppliers/items without editing BOMs
```

---

## 7. Integration Points

### 7.1 With Production Module

| Integration | Mechanism | Timing |
|-------------|-----------|--------|
| Auto-resolve inputs for EOD | `post_production_run` calls `explode_bom` if no explicit inputs | Phase 2/3 |
| Material requirements for planning | Plan recalc reads BOM to compute material needed | Phase 3 |
| Standard cost vs actual variance | Compare BOM std cost vs production WA cost per run | Phase 4 |

### 7.2 With Purchasing Module

The purchasing team uses BOM information to:
- Forecast material needs from production plan
- Purchases reference **items** and **suppliers** (AVL), not BOM lines
- BOM standard cost currently uses WA as stand-in; will use AVL preferred price when that table is built

### 7.3 With Inventory Valuation

- BOM standard cost is **independent** of WA inventory valuation
- WA is the live costing method for stock movement
- BOM cost is a planning/estimation tool only
- Variance reporting compares planned BOM cost vs actual WA cost per production run

### 7.4 With Item Master

- `explode_bom` can be used from the Item Detail page to show "What does this item make?" and "What makes this item?"
- Item type (`wip`, `finished_good`) controls whether it appears as a parent in BOM selectors

---

## 8. Permissions & Access Control

| Action | Required Permission | Notes |
|--------|-------------------|-------|
| View BOMs / alternate groups | `bom.view` (any auth'd user via RLS) | RLS allows SELECT for all authenticated users |
| Create / edit BOMs | `purchase.manage` | RLS gated (`has_permission('purchase.manage')`) |
| Close BOM | `purchase.manage` | Same as edit |
| Manage alternate groups | `purchase.manage` | RLS gated |
| View standard cost | `bom.view` | Cost is planning data |
| View where-used | `bom.view` | Read-only |

**Note:** `bom.view` must be seeded into the `permissions` table and assigned to roles in `role_permissions` (see master build plan §2.3 baseline matrix). Without this, the nav item (`perm: "bom.view"`) will be invisible to all users.

**Navigate via:** `nav.ts` → Manufacturing section → "BOM / Recipes" (perm: `bom.view`)

---

## 9. Acceptance Criteria

### Phase 1 — Data Layer
- [ ] `listBoms()` returns all BOMs with computed status (active/future/expired)
- [ ] `getBom()` returns full detail with lines and standard cost
- [ ] `getBomForItem()` returns the active BOM for a given item on a given date
- [ ] `explodeBom()` returns correct single-level explosion with scrap and batch yield
- [ ] `whereUsed()` returns all BOMs consuming a given item
- [ ] `bomStandardCost()` returns planning cost at current WA (never errors on missing stock)

### Phase 2 — UI
- [ ] BOM list page shows all BOMs with tabs (Active/Future/Expired/All)
- [ ] BOM create form validates parent by stage (Stage 1 → wip, Stage 2 → finished_good)
- [ ] BOM detail shows exploded component list with cost breakdown
- [ ] Alternate group management CRUD works independently of BOMs
- [ ] Close + clone workflow for version replacement
- [ ] Where-used view accessible from item context

### Phase 3 — Integration
- [ ] Production EOD can resolve input quantities via `explode_bom`
- [ ] Production planning reads BOM for material requirements
