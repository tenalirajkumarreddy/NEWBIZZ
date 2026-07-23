# BOM Implementation Plan — Review Against Actual Schema & Code

**Date:** 2026-07-23
**Reviewed against:** `0017_bom.sql` · Master Build Plan §6.1 · Nav/Permissions · DB Types

---

## Critical Corrections

### 1. BOM Data Model — Plan vs Actual (0017_bom.sql)

The plan's **§2.1 Entity Relationship** describes a different schema than what migration 0017 created.

#### `boms` table — Plan is wrong:

| Column | Plan says | Actual 0017 has | Fix |
|--------|-----------|-----------------|-----|
| `version_label` | ✅ | ❌ Doesn't exist | Remove from plan |
| `stage` | ❌ Missing | `int not null default 1` | **Add** — central to two-stage (1=blowing, 2=filling) |
| `output_qty` | ❌ Missing | `numeric(14,3) not null default 1` — yield per batch | **Add** — used by `explode_bom` to scale |
| `status` | ❌ Missing | `text not null default 'active'` | **Add** — lifecycle management |

**Impact:** If UI is built against the plan's schema, it won't match the DB. The plan should match `0017_bom.sql` exactly.

#### `bom_lines` table — Plan is wrong:

| Column | Plan says | Actual 0017 has | Fix |
|--------|-----------|-----------------|-----|
| `parent_item_id` | ✅ | ❌ No such column | **Remove** — parent is on `boms`, lines reference `bom_id` |
| `bom_id` | ❌ Missing | `uuid not null references boms(id)` | **Add** |
| `uom` | `text` | ❌ Doesn't exist — UOM comes from child item's `base_unit_id` | **Remove** (or plan to add later) |
| `effective_from` | `date` | ❌ Not on lines (on header) | **Remove** |
| `effective_to` | `date` | ❌ Not on lines (on header) | **Remove** |
| `priority` | `int` | ❌ Doesn't exist on bom_lines | **Remove** |
| `line_no` | ❌ Missing | `int not null default 1` | **Add** |
| `created_by` | ✅ | ❌ Not on lines (on header) | **Remove** |
| `updated_at` | ✅ | ❌ Not on lines | **Remove** |

---

### 2. RPCs — Plan lists as "to build" but already exist

Plan §3.2 lists these as future work:

| RPC | Status | Note |
|-----|--------|------|
| `create_bom` | ✅ Exists as `upsert_bom(p_header jsonb, p_lines jsonb)` | Full validation: overlap guard, cycle check, audit_log |
| `update_bom` | ⚠️ Partial — `upsert_bom` only creates new | No update-in-place RPC yet; use `close + create new` pattern |
| `resolve_bom_child` | ✅ Exists (line 85-96) | Resolves alternate group to default member |
| `active_bom_for` | ✅ Exists (line 102-122) | Finds active BOM for item+date, raises on overlap |

The plan should reference these by their actual names and signatures.

---

### 3. `explode_bom` — Plan says "multi-level", actual is single-level

**Plan §3.1:** "Recursively explodes sub-assemblies (items that have their own BOMs)"

**Actual `0017_bom.sql:199-220`:** Single-level only. The comment explicitly says:
> "One level down (the two-stage model uses one BOM per stage, so a single level is the natural granularity)"

This is the correct design decision — each stage has its own BOM, so two-stage explosion is just two sequential calls. The plan should say **single-level** to match reality.

Also, plan says `explode_bom` returns `scrap_percent` in output. Actual returns only `(child_item_id, gross_qty)` — scrap is already baked into `gross_qty`.

---

### 4. `bom_standard_cost` — Plan says AVL, actual uses WA

**Plan:** "For each component, fetching current... AVL preferred price"

**Actual `0017_bom.sql:230-242`:** Uses weighted-average cost from `stock`:
```sql
select round(sum(s.qty_on_hand*s.avg_cost)/nullif(sum(s.qty_on_hand),0),4)
  from stock s where s.item_id = e.child_item_id
```

Comment explicitly says AVL is not built yet. Plan must reflect this.

---

### 5. Missing Dependencies

Plan §1.3 lists `UOM Conversions (§1.10)` and `AVL / Suppliers (§5.3)` as dependencies.

**Neither exists in the database:**
- `item_uom_conversions` table — **not migrated**. Grep across all migrations and `database.types.ts` confirms absence.
- `item_suppliers` (AVL) table — **not migrated**. Only `suppliers` table exists.

The BOM plan must either:
(a) Acknowledge these don't exist and state the fallback behavior, or
(b) Include their implementation as pre-requisite steps before BOM UI work

---

### 6. Stage-Aware Validation

Plan §4.3 says: "Parent item must be manufacturable — type must be `finished_good` or `wip`"

Migration 0017 tracks `stage` but the plan doesn't. Stage-aware rules needed:
- **Stage 1** (blowing): parent should be `wip` (empty bottles)
- **Stage 2** (filling): parent should be `finished_good` (filled cases)
- These are informational/guide in the DB (stage is just int), but the UI should enforce them

---

### 7. Permission: `bom.view` not in baseline matrix

Plan §8 says view requires `bom.view`. Nav.ts uses `perm: "bom.view"`. But the baseline permission matrix (§2.3 of master build plan) doesn't list `bom.view`:

The baseline matrix has: `order.create`, `order.approve`, `order.edit_any`, `sale.record`, `payment.record`, `stock.transfer`, `cash.transfer`, `balance.adjust`, `expense.approve`, `scheme.approve`, `purchase.approve`, `production.eod`, `report.view`, `config.edit`, `user.manage`.

`bom.view` needs to be added to the baseline matrix seed data, or the nav should use a different existing permission. Otherwise the nav item will be invisible to everyone.

---

### 8. `status` Lifecycle

Plan doesn't discuss BOM `status` transitions. Actual schema has `status text not null default 'active'`. Plan should define:
- Active → Expired (auto when `effective_to < today`)
- Active → Inactive (manual deactivation)
- Whether inactive BOMs appear in `active_bom_for()` (currently filters on `status = 'active'`)

---

### 9. Missing `touch_updated_at()` Trigger

Plan doesn't mention the `boms_touch` trigger that updates `updated_at` on BOM changes. Minor, but data readers should be aware.

---

## What the Plan Gets Right

1. **Alternate groups** — schema matches 0017 exactly ✓
2. **XOR child reference** — `bom_lines` constraint `check (child_item_id is not null or alternate_group_id is not null)` ✓
3. **No circular references** — `upsert_bom` checks `if v_child = v_parent` (immediate cycle guard) ✓
4. **Overlap-free windows** — `upsert_bom` uses `daterange overlap` operator ✓
5. **Standard cost vs WA independence** — correctly states BOM cost is planning-only ✓
6. **Two-stage awareness** — conceptual model is correct, just missing `stage` in schema description ✓
7. **Write permission** — `purchase.manage` matches 0017 RLS ✓
8. **Page structure** (`/bom`, `/bom/new`, `/bom/[id]`, alternate groups) — reasonable layout ✓
9. **Application layer patterns** (data readers, server actions) — follow existing catalog.ts pattern ✓

---

## Summary of Required Plan Updates

| Section | Issue | Severity |
|---------|-------|----------|
| §2.1 Entity Relationship | Schema doesn't match `0017_bom.sql` | **High** |
| §3.1 Existing Functions | `explode_bom` is single-level, not multi-level | **High** |
| §3.2 Functions to Build | `create_bom` already exists as `upsert_bom` | **High** |
| §1.3 Dependencies | UOM conversions + AVL don't exist yet | **Medium** |
| §4.3 Validation Rules | Missing `stage`-aware parent type validation | **Medium** |
| §6 Two-Stage Flow | Doesn't reference `stage` column | **Medium** |
| §8 Permissions | `bom.view` not in baseline matrix seed | **Medium** |
| §2.2 Constraints | Missing `status` lifecycle discussion | **Low** |
| §4.1 Data Readers | Interface for `BomLineDetail` has `parentItemId` on lines | **High** |
