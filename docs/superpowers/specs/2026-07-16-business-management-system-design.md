# Business Management System — Complete Design Spec

**Date:** 2026-07-16
**Business Type:** Water bottle manufacturing + sales (Retail/Wholesale)
**Stack:** Next.js + Supabase (PostgreSQL, Auth, RLS)
**Platform:** Web app + Mobile (PWA), same features everywhere
**Languages:** English + Tamil + Telugu + Kannada + Malayalam

---

## 1. Business Profile

| Field | Detail |
|---|---|
| Industry | Water bottle manufacturing + trading |
| Products | 3–10 finished SKUs, each with variants (500ml, 1L, 2L, etc.) |
| Customers | Distributors, retail shops, institutions, direct consumers |
| Warehouses | Multiple locations |
| Manufacturing | 2-stage: Preforms → Empty bottles (blowing), then Empty bottles + caps + labels + water → Filled packed bottles (filling) |

---

## 2. Entity Architecture

### 2.1 Customer-Store Hierarchy

The system is **store-centric**, not customer-centric.

```
CUSTOMER (parent account, login credentials)
   │
   ├── STORE A (GSTIN: 33XXXXX...)
   │     ├── Orders
   │     ├── Invoices
   │     ├── Payments
   │     ├── Outstanding balance
   │     ├── Delivery address
   │     └── Scheme eligibility
   │
   └── STORE B (GSTIN: 33YYYYY...)
         └── (same structure)
```

- Invoices, GSTIN, outstanding, payments — all tracked **per store**
- Customer portal shows store switcher dropdown in header
- Stores are created by admin; customer can request new store via portal

### 2.2 User Roles

| Role | Stock Holding | Cash Holding | Capabilities |
|---|---|---|---|
| **Admin** | No | No (sees/adjusts all) | Full access, auto-approve toggle, adjust any balance |
| **Manager** | No | Yes | Operations, scheme approval, order priority override, adjust balances |
| **Operator** | No (manages WH) | Yes (walk-in cash) | Warehouse stock, walk-in sales, transfer WH↔Users |
| **Agent** | Yes (stock for delivery) | Yes (collections) | Fulfill orders, collect payments, transfer to manager, route sessions |
| **Sales Staff** | Maybe | Yes | Create orders, record payments |
| **Marketer** | No | Yes (if records payment) | Create orders, no stock handling |
| **Customer** | No | No (ledger only) | Portal: view orders/invoices/payments/schemes |

---

## 3. Handover System

### 3.1 Core Concept: Every User Has a Holding Balance

Every user who records a sale, records a payment, or receives a transfer gets that amount in their **holding balance**. They are responsible for handing it up to the manager.

### 3.2 Transfer Protocol (Universal)

```
Sender creates request:
  ├─ From (auto-filled)
  ├─ To
  ├─ Items: [SKU, qty]  (for stock)
  ├─ Amount              (for cash)
  ├─ Reference Order ID  (optional)
  └─ Note

States: Pending → Accepted / Rejected / Cancelled
```

- Sender can cancel anytime before response
- Accepted → balances move atomically
- Rejected → nothing moves. Sender retains stock/cash.
- No partial accepts — all or nothing
- Every transfer timestamped with who, what, when
- Admin/Manager can see all holdings and transfers in real-time

### 3.3 Stock Flow

```
                ┌──────────────────┐
                │    WAREHOUSE     │
                │  (central pool)  │
                └────────┬─────────┘
                         │
          ┌──────────────┼──────────────┐
          │              │              │
          ▼              ▼              ▼
   Walk-in Sale     Transfer to     Return from
   (Operator)     Agent (Order)    Agent/User
   ──────────     ─────────────    ────────────
   WH stock -X    WH stock -X      WH stock +X
   (no operator   Agent stock +X   Agent stock -X
    stock hold)
                   ↓
             Agent fulfills Sale
             Agent stock -X
             Customer receives
```

- **Operator**: No stock holding. When operator records walk-in sale → warehouse stock decreases directly. Operator cash holding increases.
- **Agent**: Has stock holding. Stock transferred from WH to Agent. Agent records sale → stock deducted from agent's holding.
- **User-to-user transfers**: Any user can transfer stock to any other user (accept/reject applies).

### 3.4 Cash Flow

```
Customer pays sale:
  ├─ Cash/UPI to Agent    → Agent holding +X
  ├─ UPI to Agent's UPI   → Agent holding +X (responsibility)
  └─ Direct bank transfer → Manager records separately

Agent → Manager Transfer:
  Agent initiates transfer of ₹X
    ├─ Cash: manager physically verifies
    ├─ UPI: agent uploads receipt
    └─ Manager reviews → Accept / Reject

Manager → Bank/Admin:
  Same accept/reject protocol

USER BALANCE = Total collected − Total handed over − Approved expenses

Positive = user owes company
Negative = company owes user
```

### 3.5 Operator Sale Example

```
Sale: Item A × 2 = ₹200
Customer X outstanding before: ₹100
Payment: Cash ₹50 + UPI ₹100 = ₹150 collected

Results:
  Warehouse stock:          -2 units
  Operator holding:         +₹150
  Customer X ledger:        ₹100 + ₹200 - ₹150 = ₹150 outstanding
  Operator is responsible for ₹150 → must transfer to manager
```

### 3.6 Agent Sale Example

```
Agent stock holding before: 50 units (from WH transfer)
Sale: Item A × 10 = ₹1000
Payment: Cash ₹1000

Results:
  Agent stock holding:   50 - 10 = 40 units
  Agent cash holding:    +₹1000
  Customer ledger:       updates accordingly
```

### 3.7 Expense Handover

```
User submits expense:
  ├─ Category (fuel, repair, etc.)
  ├─ Amount
  ├─ Bill/receipt upload (photo)
  └─ Note

Manager/Admin reviews → Approve / Reject

When approved → automatically reduces user's payable balance.
If balance goes negative → company owes user (reimbursement).
Expense is recorded in company books.
```

### 3.8 Customer Ledger (Separate System)

```
Customer ledger tracks:
  ├─ Sales (invoices)     → increases their due
  ├─ Payments received    → decreases their due
  ├─ Returns              → adjust due
  ├─ Scheme credits       → decreases their due
  └─ Running balance = Total due

Completely independent of user holdings.
Reconciliation: Σ(customer payments) ≈ Σ(user cash holdings movement)
```

### 3.9 Reconciliation Dashboard

```
┌─────────────────────────────────────────────────────┐
│  STOCK RECONCILIATION                                │
│  Warehouse: 5,000 units                             │
│  Agents holding: 1,200 units                        │
│  In transit (pending transfer): 300 units           │
│  ────────────────────────────────────────           │
│  TOTAL should = system stock: 6,500 units ✓         │
│                                                      │
│  CASH RECONCILIATION                                 │
│  Operators: +₹12,000                                │
│  Agents: +₹45,000                                   │
│  Manager: +₹10,000                                  │
│  Bank deposits (today): -₹60,000                    │
│  ────────────────────────────────────────           │
│  Net outstanding: ₹7,000 (to be handed up)          │
│                                                      │
│  PENDING TRANSFERS: 5 pending                       │
│  PENDING EXPENSES: 2 awaiting approval              │
└─────────────────────────────────────────────────────┘
```

---

## 4. Order Lifecycle

### 4.1 States & Transitions

```
                    ┌──────────┐
                    │ PENDING  │ ← Created by marketer, customer, agent, walk-in
                    └────┬─────┘
                         │ Approve (auto if admin toggle on)
                         ▼
                    ┌──────────┐
                    │ APPROVED │
                    └────┬─────┘
                         │ Generate & Print
                         ▼
               ┌──────────────────┐
               │ CHALLAN PRINTED  │ ← 2 copies: customer + office
               │ (Delivery Note)  │ ← Agent carries this with goods
               └────────┬─────────┘
                        │ Delivered + payment collected
                        ▼
              ┌──────────────────┐
              │ FULFILLED / SOLD │ ← Sale recorded, stock deducted,
              │ (Order Closed)   │   payment recorded, invoice generated
              └──────────────────┘

  Any state → CANCELLED (by admin/manager)
```

### 4.2 Order Creation Sources

- Marketers (via app)
- Customers (via portal)
- Walk-in customers (by operator)
- Agents/Delivery persons (on the spot)

### 4.3 Order Fields

- Customer + Store (auto-determined)
- Items: [SKU, quantity]
- Priority (default normal, urgent flag available)
- Delivery date (optional)
- Notes
- Created by (user who placed it)

### 4.4 Auto-Approval

- Admin can toggle "auto-approve" on/off
- When ON → orders auto-approve, skip approval step
- When OFF → manager must approve each order
- Admin always auto-approves

### 4.5 Visibility & Edit

- All users can view all orders
- Users can edit only their own orders
- Admin/Manager can edit any order
- When order is edited after approval → re-approval may be needed (configurable)

### 4.6 Delivery Challan Print (Generated at "Challan Printed" state)

Fields:
- Company logo + company details (name, address, GSTIN, phone)
- Customer name, address, phone, GSTIN
- Order items: SKU, description, qty, rate, amount
- Total amount in words
- Payment collection fields: Cash ☐ UPI ☐ Card ☐ Cheque ☐ Bank Transfer
- Customer signature line
- Agent signature line
- E-way bill number (if applicable)
- Copy indicator: "Customer Copy" / "Office Copy" (2 copies printed)

### 4.7 Fulfillment (Mobile)

1. Agent opens order, clicks "Fulfill"
2. Sale recording screen appears, pre-filled with order items
3. Agent can adjust quantities (delivered qty may differ from ordered)
4. Enters payments collected: Cash, UPI, Card, Cheque, Bank Transfer
5. Records sale → triggers:
   - Agent's stock holding: -Qty delivered
   - Agent's cash holding: +Amount collected
   - Customer ledger: updates
   - Order marked Fulfilled
   - Tax Invoice (if official) or Sale Receipt generated
6. If quantities remain (partial) → follow-up order auto-created for remainder

### 4.8 Official vs Unofficial Toggle

On sale recording, agent marks:
- **Official (GST)**: Full GST invoice, e-invoice JSON, e-way bill calc, goes to GST returns
- **Unofficial (non-GST)**: Simple receipt, no tax breakdown, NOT in GST returns

Internal business reports include BOTH. GST reports include ONLY official.

---

## 5. BOM (Bill of Materials)

### 5.1 Purpose

The BOM module bridges product design, production, purchasing, and costing. It defines the structural recipe for every manufactured item without coupling to specific suppliers, so the same recipe works regardless of which vendor's material is used.

### 5.2 Item Master

Every material or product in the system is an **item**. Items have a `type` and optional `category`.

**Item types:**
| Type | Description | Examples |
|---|---|---|
| `raw_material` | Purchased inputs | Preforms, caps, labels, shrink wrap, water treatment chemicals |
| `intermediate` | Produced in Stage 1, consumed in Stage 2 | Empty bottles |
| `finished_good` | Sellable output (filled & packed) | 500ml case, 1L case, 20L jar |

**Item fields:** `id`, `sku_code`, `name`, `description`, `type`, `category`, `unit_of_measure`, `bottles_per_case`, `hsn_code`, `gst_rate`, `barcode`, `status` (active/inactive/discontinued), `is_raw_material` (boolean flag for pricing logic)

**Categories:** Free-form classification — admin can create/edit as needed (e.g., "Preforms", "Closures", "Labels", "Packaging", "Chemicals"). Categories are used for grouping in purchasing and reports.

### 5.3 Multi-Level BOM Structure

BOMs are recursive: a finished good references intermediates, which reference raw materials. Depth is unlimited.

```
500ml Bottle Case (24pk)           ← finished_good
├─ 24 × 500ml Empty Bottle         ← intermediate
│  └─ 1 × 500ml Preform            ← raw_material
├─ 24 × Label (500ml)              ← raw_material
├─ 24 × Cap (28mm)                 ← raw_material
├─ 1 × Shrink Wrap (per case)      ← raw_material (packaging)
└─ 1 × Corrugated Box (24pk)       ← raw_material (packaging)
```

**BOM lines table:** Each row defines a parent-child relationship.
```
bom_lines
  id
  parent_item_id      → items.id
  child_item_id       → items.id
  quantity_per        DECIMAL (e.g., 24 for bottles per case, 1 for preforms per bottle)
  unit_of_measure     (pieces, kg, grams, rolls, meters)
  scrap_percent       DECIMAL (e.g., 2.5 for 2.5% wastage factor)
  effective_from      DATE
  effective_to        DATE (null = current)
  alternate_group_id  → optional, for substitutes
  priority            INT (within alternate group)
  created_by          → users.id
  created_at
  updated_at
```

**Worked example:**
| Parent | Child | Qty/Per | UOM | Scrap % |
|---|---|---|---|---|
| 500ml Empty Bottle | 500ml Preform | 1 | piece | 2 |
| 500ml Case (24pk) | 500ml Empty Bottle | 24 | piece | 0.5 |
| 500ml Case (24pk) | 500ml Label | 24 | piece | 1 |
| 500ml Case (24pk) | 28mm Cap | 24 | piece | 0.5 |
| 500ml Case (24pk) | Shrink Wrap | 1 | grams | 3 |
| 500ml Case (24pk) | Corrugated Box (24pk) | 1 | piece | 0 |

### 5.4 BOM Versions

Each BOM line carries an effective date range. A new version supersedes the old on its `effective_from` date.

- **Active BOM** = lines where `effective_from <= today AND (effective_to IS NULL OR effective_to >= today)`
- **Historical BOM** = lines with `effective_to < today` — retained for cost traceability
- Admin creates a new version by bumping `effective_from` on old lines to `effective_to` and inserting new lines

### 5.5 Approval Vendor List (AVL) — NOT Inside BOM

Suppliers are never referenced in BOM lines. Instead, each item has an **Approved Vendor List** that decouples sourcing from the recipe.

```
item_suppliers (AVL)
  id
  item_id             → items.id
  supplier_id         → suppliers.id
  unit_price          DECIMAL
  currency            TEXT default 'INR'
  lead_time_days      INT
  min_order_qty       DECIMAL
  preferred           BOOLEAN (only one preferred per item)
  is_active           BOOLEAN
  created_at
```

This means:
- Adding a new preform supplier = one row in `item_suppliers` — no BOM change
- Price update = update the supplier's row — costing engine picks it up
- Same ingredient, multiple price points — no duplication of BOM

### 5.6 Alternate / Substitute Groups

When two genuinely different items can fill the same BOM slot (e.g., a bottle can use either a standard cap or a tamper-evident cap), they belong to an **alternate group**.

```
alternate_groups
  id, name

alternate_group_members
  id, group_id, item_id, priority, is_default
```

A BOM line optionally references `alternate_group_id` instead of a single `child_item_id`. Production can then consume any member of the group (system recommends the highest-priority member in stock).

### 5.7 Where-Used & Explosion

**Where-used report** (given a raw material, find all parents):
```sql
-- Recursive CTE traverses BOM tree upward
-- Returns: every finished good and intermediate affected by this item
```

**BOM explosion** (given a finished good and production qty, calculate all raw material needs):
```sql
-- Recursive CTE traverses BOM tree downward
-- Applies scrap% at each level
-- Returns: item_id, gross_qty, net_qty (after scrap)
```

**Cost rollup** (standard cost per finished good):
```
For each raw material in exploded BOM:
  unit_cost = AVL.preferred_price ?? AVL.lowest_price ?? AVL.weighted_avg
  total += unit_cost × exploded_qty
```
Admin selects costing method (preferred / lowest / weighted avg) at calculation time.

### 5.8 Validation Rules

- **Circular reference check:** Item cannot be its own ancestor at any depth
- **Effective date overlap:** New BOM version cannot overlap active window of existing version
- **No dangling children:** Cannot deactivate an item that is referenced as `child_item_id` in any active BOM line
- **AVL pricing:** Cost rollup fails gracefully if an item has zero approved suppliers (warns but still rolls up — just shows ₹0 for that component)

### 5.9 Navigation

| Menu | What admin sees |
|---|---|
| **Items** | Item master list, search/filter by type & category → item detail (info, BOM tab, Used-In tab, Suppliers tab) |
| **BOM / Recipes** | List of all items that have BOMs → BOM tree editor (expandable, version-switcher) |
| **Suppliers** | Supplier master list → supplier detail (contact, items supplied, performance) |
| **Costing** | Cost rollup calculator, standard cost report, where-used lookup |

### 5.10 Primary Workflow

1. Create raw material items (preform, cap, label, shrink) with type & category
2. Add suppliers to each raw material via AVL (item detail → Suppliers tab)
3. Create intermediate item (empty bottle) and build its BOM: 1 preform + scrap%
4. Create finished good (bottle case) and build its BOM: 24 empty bottles + 24 labels + 24 caps + packaging
5. Run cost rollup to see standard cost per case using preferred-supplier pricing
6. When a new preform supplier is onboarded → add a row to that item's AVL — no BOM edit needed
7. When cap specs change → create new raw material item and revise the BOM line, or set up an alternate group if both remain valid

### 5.11 Permissions & Audit

- **Admin / Procurement** only: edit BOM structure, AVL pricing
- **Others**: read-only
- Audit trail: all BOM line changes and AVL price changes logged to `audit_log` with before/after snapshots

---

## 6. Production Planning

### 6.1 Core Concept: Order-Driven Rolling Plan

The plan shows **how many bottles of each SKU to produce each day** until all pending orders are fulfilled, plus buffer stock. It recalculates automatically on:
- New order created
- Order deleted/cancelled
- Order priority changed
- EOD actual production recorded

Operations are at the **order-quantity level, not order level** — a single large order can be split across multiple days. The plan never treats an order as atomic; it allocates as much of an order's remaining quantity as fits today's available capacity, and the rest carries forward to the next day.

### 6.2 Algorithm (Revised)

```
FUNCTION recalculate_plan():
  ACQUIRE production_plan_recalc_lock (serialized — prevents race conditions)

  orders = GET pending+approved orders WHERE qty_remaining > 0
           ORDER BY priority_tier ASC, created_at ASC

  FOR each day D FROM Day-0 TO horizon_end:
    available_hours[stage1] = calendar_exception_override(D, 1) OR shift_hours(D)
    available_hours[stage2] = calendar_exception_override(D, 2) OR shift_hours(D)

    IF yesterday's last SKU != today's first allocated SKU:
      available_hours[stage1] -= changeover_time_s1
      available_hours[stage2] -= changeover_time_s2

    stage2_input_available = opening_wip_buffer
                           + SUM(Stage 1 planned output, Day-1..D)
                           - SUM(Stage 2 planned consumption, Day-1..D-1)

    FOR each order IN orders (priority-first, SKU-grouping as tie-breaker only):
      qty_fits = MIN(
        order.qty_remaining,
        hours_to_qty(available_hours[stage1], BPH),
        hours_to_qty(available_hours[stage2], BPM),
        material_available_qty(order.sku, D),    — hard constraint
        stage2_input_available                    — hard constraint
      )

      IF qty_fits > 0:
        ALLOCATE qty_fits of order → Day D
        order.qty_allocated += qty_fits
        available_hours[stage1] -= qty_to_hours(qty_fits, BPH)
        available_hours[stage2] -= qty_to_hours(qty_fits, BPM)
        stage2_input_available -= qty_fits
      # ELSE: qty_remaining stays unchanged → carries to Day D+1

    # After real orders, fill buffer stock with leftover capacity
    FOR each SKU WHERE stock_qty < min_buffer_qty:
      buffer_shortfall = min_buffer_qty - stock_qty
      qty_fits = MIN(buffer_shortfall, remaining_capacity..., material_available...)
      IF qty_fits > 0:
        ALLOCATE buffer run (order=null, SKU, qty_fits, is_buffer=true)

  RELEASE production_plan_recalc_lock
```

### 6.3 Key Rules (Revised)

- **Day-0 is locked** — today's production cannot change (see 6.9 Day-0 Lock State Machine)
- **Priority order**: Urgent flag → Distributor → Retail/Institutional → FCFS
- **SKU grouping is a tie-breaker only** — applied within the same priority tier. An urgent order for a new SKU always preempts changeover-avoidance for a lower-priority order. Every changeover is logged so a manager can see when priority forced an extra changeover.
- **Changeover time** configurable per stage, deducted when the first SKU of the day differs from the previous day's last SKU. Mid-shift changeover possible for urgent orders.
- **Material check** is a **hard constraint** — preforms, caps, labels, shrink checked against current + planned stock. If insufficient, qty_fits is capped to available material.
- **WIP buffer check** is also a **hard constraint** — Stage 2's available input on Day N = opening WIP + Stage 1 planned output through Day N - Stage 2 planned consumption through Day N-1. If Stage 2 demand exceeds cumulative WIP supply, qty_fits is capped. The UI shows "⚠️ needs Stage 1 to run earlier" as guidance, but the system never allows an infeasible plan.
- **Buffer stock** is a first-class algorithmic output. Per-SKU `min_buffer_qty` configuration. After all real orders are allocated for a day, any remaining capacity is used to top up SKUs below their buffer target.
- **Calendar exceptions** override default shift hours for holidays, planned downtime, or breakdowns.

### 6.4 Wastage Formulas

Explicit formulas — every `production_eod` entry computes these:

```
Stage 1 wastage_units = preforms_used − bottles_produced
Stage 1 wastage_kg    = wastage_units × preform_unit_weight_kg

Stage 2 wastage_units = bottles_input_to_stage2 − bottles_filled
  (bottles_input_to_stage2 = WIP buffer draw for this run)

Cap wastage_units     = caps_used − bottles_filled
Shrink wastage_units  = shrink_used − (bottles_filled / units_per_shrink_pack)
```

These feed directly into the Wastage Dashboard (6.8).

### 6.5 Visualization

```
┌──────────────────────────────────────────────────────────────────┐
│ PRODUCTION PLAN  (Orders: 14 pending • Horizon: 18 days)        │
├──────────────────────────────────────────────────────────────────┤
│ Jul 17 (TODAY) — Day 0  [LOCKED]                                │
│  STAGE 1: 500ml bottles — 7 hrs    [ORDER #102]                │
│  STAGE 2: 1L filled — 8 hrs        [ORDER #105]                │
├──────────────────────────────────────────────────────────────────┤
│ Jul 18 — Day 1  [Single shift • 8 hrs]                         │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ STAGE 1 (Blowing)  1800 BPH  14,400 bottles capacity       ││
│  │ ┌──────────────────┬──────┬──────────────────────────────┐ ││
│  │ │ #102: 500ml      │ CO   │ #108: 1L                     │ ││
│  │ │ 7 hrs (12,600)   │ 30m  │ 1 hr (1,800)                 │ ││
│  │ └──────────────────┴──────┴──────────────────────────────┘ ││
│  │                                                             ││
│  │ STAGE 2 (Filling)  300 BPM  144,000 bottles capacity      ││
│  │ ┌─────────────────────────────────────────────────────────┐ ││
│  │ │ #106: 500ml — 8 hrs full shift                          │ ││
│  │ │ ⚠️ Caps low! Only 5,000 available                       │ ││
│  │ └─────────────────────────────────────────────────────────┘ ││
│  └─────────────────────────────────────────────────────────────┘│
├──────────────────────────────────────────────────────────────────┤
│ Jul 19 — Day 2  [Double shift • 16 hrs]                        │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ STAGE 1: #108 (cont.) → #110: 500ml → #112: 2L            ││
│  │ STAGE 2: #102 → #108                                       ││
│  └─────────────────────────────────────────────────────────────┘│
├──────────────────────────────────────────────────────────────────┤
│ ⚙️  [Single shift ▼]  [Custom hours...]  [Recalculate]         │
│ ℹ️  ● Preforms OK  ⚠️ Caps low  ✗ Labels out                  │
└──────────────────────────────────────────────────────────────────┘
```

### 6.6 EOD Production Recording (Atomic Transaction)

```
┌────────────────────────────────────────────┐
│ RECORD TODAY'S PRODUCTION                  │
│ Date: Jul 17                               │
│                                            │
│ STAGE 1 (Blowing):                         │
│   Preforms used: 25,000                   │
│   Bottles produced: 24,000                │
│   → Wastage: 1,000 (4%)                   │
│   Preform waste (kg): 50                  │
│                                            │
│ STAGE 2 (Filling):                        │
│   SKU: 500ml Water Bottle                 │
│   Bottles filled: 22,000                  │
│   Caps used: 22,100  (100 wasted)         │
│   Shrink rolls used: 2.5                  │
│   → Bottle wastage: 50 units              │
│   → PET waste: 15 kg                      │
│                                            │
│ [SAVE] — executes as a single transaction: │
│  1. Post production journal entry          │
│     (material consumption → FG → wastage) │
│  2. Update stock_position quantities       │
│  3. Mark plan_day as completed             │
│  4. Enqueue forward recalculation job      │
│  If ANY step fails → entire TX rolls back  │
└────────────────────────────────────────────┘
```

### 6.7 Shift Configuration & Calendar Exceptions

**Shift configuration** per day:
- Single shift: default hours (configurable, e.g., 8 hrs)
- Double shift: extended hours (configurable, e.g., 16 hrs)
- Custom timings: user override for what-if scenarios
- System calculates daily capacity as rate × shift hours

**Calendar exceptions** override shift hours for specific dates:
```
production_calendar_exceptions
  id, date, stage (1|2|both), available_hours_override, reason
```
Examples: holiday (0 hrs), machine breakdown mid-day (4 hrs instead of 8), maintenance shutdown. The algorithm checks exceptions before defaulting to standard shift hours.

### 6.8 Wastage Dashboard

| Material | Typical Range | Your Actual | Variance |
|---|---|---|---|
| Preform → Bottle | 1–3% | 4% | ⚠️ +1% |
| Filling breakage | 0.5–2% | 0.23% | ✅ |
| Caps | 0.5–1% | 0.45% | ✅ |
| Shrink wrap | 2–5% | — | Set baseline |

### 6.9 Day-0 Lock State Machine

The rolling plan produces a **proposed plan** for Days 1+ and a **locked plan** for Day 0 (today). The lock sits on top of atomic EOD transactions and a serialized recalculation lock, so state transitions can never race.

#### States

```
DAY 0 (Today):
  Locked ═══► In Progress ═══► Completed
     ↑              │
     │              └── Manager override possible
     └── Auto-lock at 12:00 AM (midnight)

DAY 1+ (Future):
  Planned (recalculated each time orders change)
```

| State | Description | Editable? | Triggers |
|---|---|---|---|
| `planned` | Future day. Plan recalculates freely. | Full | New order, order change, midnight rollover |
| `locked` | Today's plan frozen. No auto-recalculation. | None (except manager override) | Midnight auto-lock, or manual lock by manager |
| `in_progress` | Production started. EOD form being filled. | EOD form only (operator edits actuals) | First EOD save of the day |
| `completed` | EOD form submitted atomically. | Read-only (manager back-date override) | EOD form submission |

#### Midnight Rollover

```
At 12:00 AM:
  Day-(1) becomes Day-0 → locked
  Previous Day-0 → completed (if EOD submitted) or locked (forces deadline)
  Plan recalculates: horizon extends by 1
```

#### Lock Rules

1. **Auto-lock** at midnight — Day-1 becomes Day-0 and locks
2. **Manual lock** — manager locks a future day early; prevents recalculation
3. **Manager override** — can unlock Day-0 with logged reason; plan recalculates if orders changed
4. **No override during EOD** — cannot unlock while in_progress
5. **Back-dated entry** — manager posts correction for past dates; changes inventory/accounting forward but does NOT alter past locked states (follows reversing-entry pattern from accounting design)

#### State Transitions

```
planned → locked: midnight auto, or manual lock → snapshot allocations, freeze

locked → in_progress: first EOD save → planned values pre-filled

locked → planned (unlock): manager override only → logged, recalculates

in_progress → completed: EOD submitted atomically (see 6.6) → stock posted, recalc enqueued

completed → locked (reopen): manager back-date only → correction journal entry, not mutation
```

### 6.10 Concurrency: Recalculation Lock

Recalculation runs inside a serialized job. Four triggers (new order, cancelled order, priority change, EOD save) can fire near-simultaneously — without a lock they would race to write conflicting plan states.

```
production_plan_recalc_lock
  plan_id FK, locked_at, locked_by_job_id
```

Implementation is a standard job-queue pattern:
- Acquire advisory lock before starting recalculation
- If a trigger fires while recalculation is in-flight, coalesce (queue behind or skip — run once after the last trigger)
- Release lock after plan is updated

### 6.11 Schema

```
production_plans
  id, horizon_start_date, horizon_end_date, created_at

production_plan_days
  id, plan_id FK, plan_date,
  status (planned|locked|in_progress|completed),
  stage1_available_hours, stage2_available_hours,
  stage1_changeover_minutes, stage2_changeover_minutes,
  locked_at, locked_by, completed_at, completed_by,
  reopened_at, reopened_by, reopen_reason

production_plan_allocations
  id, plan_day_id FK, order_id FK (nullable — null = buffer allocation),
  sku_item_id FK,
  qty_allocated, stage1_hours, stage2_hours,
  is_buffer_allocation boolean,
  material_status (ok|low|blocked),
  sequence_index

sku_buffer_targets
  sku_item_id FK, min_buffer_qty

production_calendar_exceptions
  id, date, stage (1|2|both), available_hours_override, reason

production_plan_recalc_lock
  plan_id FK, locked_at, locked_by_job_id

eod_entries
  id, plan_day_id FK, stage (1|2),
  preforms_used, bottles_produced,
  sku_item_id, bottles_filled, caps_used, shrink_used,
  wastage_units, wastage_kg,
  posted_journal_entry_id FK,
  submitted_at, submitted_by
```

Orders table addition:
```
orders
  ... existing fields ...
  qty_total, qty_allocated, qty_remaining (derived: qty_total - qty_allocated)
```

---

## 7. Scheme / Rebate System

### 6.1 Core Flow

```
Admin creates Scheme (monthly period)
       │
       ▼
Customer buys during month at REGULAR price (before price)
       │
       ▼
Month ends → System checks each customer's total volume
       │
       ▼
Target met? → Eligible for approval
       │                │
      Yes               No → No benefit
       │
       ▼
Approval request sent to Manager
       │
       ▼
Approve / Reject
       │
  ┌────┴────┐
  ▼         ▼
Credit      Rejected
Customer    → Nothing
Account
```

### 6.2 Scheme Definition

```
SCHEME: "July Monsoon Offer"
  Period: Jul 1 – Jul 31
  Target: Total 500+ cases across all SKUs (per store)

  Tiers:
    Tier 1 (500+ cases):
      500ml Water:   ₹100 → ₹90   (₹10/case rebate)
      1L Water:      ₹180 → ₹165  (₹15/case rebate)
      2L Jar:        ₹300 → ₹275  (₹25/case rebate)

    Tier 2 (1000+ cases):
      500ml Water:   ₹100 → ₹85   (₹15/case rebate)
      1L Water:      ₹180 → ₹155  (₹25/case rebate)
      2L Jar:        ₹300 → ₹260  (₹40/case rebate)

  Targets: Total cases across all SKUs
  Discount: Per-SKU before/after price
  Can be % or flat amount per case
```

### 6.3 Eligibility & Assignment

- Schemes can be **global** (all customers) or **per-customer-group** or **per-customer**
- Default scheme + custom overrides supported
- Target tracked **per store**
- Customer portal shows progress bar: current volume vs target
- Multiple active schemes possible simultaneously

### 6.4 Monthly Calculation

```
Month-end auto-calculation per store:

  For each SKU with tier pricing met:
    Rebate = Total qty sold that month × (Before price − After price)

  Total rebate = Sum across all SKUs

Example:
  500ml: 400 cases × (₹100 − ₹90) = ₹4,000
  1L:    150 cases × (₹180 − ₹165) = ₹2,250
  ─────────────────────────────────────
  Total rebate: ₹6,250
```

### 6.5 Approval Workflow

```
System flags eligible customers at month end

Manager sees pending approvals list:
  ┌──────────┬─────────┬────────┬──────────────┐
  │ Store    │ Volume  │ Rebate │ Status       │
  ├──────────┼─────────┼────────┼──────────────┤
  │ Store A  │ 550 cs  │ ₹6,250 │ ⏳ Pending   │
  │ Store B  │ 1,200 cs│ ₹18,000│ ⏳ Pending   │
  │ Store C  │ 300 cs  │ —      │ ❌ Not met   │
  └──────────┴─────────┴────────┴──────────────┘

Approve → Credit Note generated, customer's outstanding reduced
Reject  → Reason required, nothing credited
```

### 6.6 Rebate Settlement

- Rebate is credited to customer's ledger as a **Credit Note**
- Reduces outstanding balance
- Can be used against future purchases
- No cash/UPI payout option
- Returns that affect scheme eligibility are handled manually by manager

### 6.7 Reports

| Report | Shows |
|---|---|
| Scheme Performance | Which customers met target, total rebate per scheme |
| Customer Rebate History | Per customer: all months, rebate earned, credit used |
| Pending Approvals | All unapproved scheme benefits |
| Scheme Cost Analysis | Total rebate as % of revenue from scheme customers |

---

## 8. GST Compliance

### 7.1 Dual System

Every sale has an **Official (GST)** / **Unofficial (non-GST)** toggle:

```
                 ALL SALES
                     │
            ┌────────┴────────┐
            ▼                  ▼
       OFFICIAL (GST)     UNOFFICIAL (non-GST)
       ──────────────     ───────────────────
       • GST Invoice      • Simple receipt
       • E-invoice JSON   • No e-invoice
       • E-way bill calc  • No e-way bill
       • Goes to GSTR     • NOT in GSTR
       • HSN + GST rates  • No tax breakdown
            │                  │
            └──────┬───────────┘
                   ▼
           INTERNAL REPORTS
           (Both count)
```

### 7.2 Invoice — Single Flexible Format

- Same layout for both official and unofficial
- Official: Shows GSTIN, HSN, CGST/SGST/IGST breakdown, IRN, QR code
- Unofficial: Single total line, no tax breakup
- Toggle determines which fields appear

### 7.3 Per-SKU Tax Configuration

| Field | Description |
|---|---|
| HSN Code | e.g., 220110 for water, 392330 for preforms |
| GST Rate | e.g., 18%, 12%, 5%, 0% |
| Type | GST or exempt |

### 7.4 E-invoice

- System generates compliant JSON for official B2B sales
- JSON downloaded by user, manually uploaded to IRP portal
- User enters IRN back into system after IRP returns it
- IRN appears on invoice print + QR code

### 7.5 E-way Bill

- System calculates values needed: invoice value, qty, HSN, from/to addresses
- E-way bill number field on challan/invoice
- User generates e-way bill on GST portal, enters number back
- Number appears on delivery challan and invoice prints

### 7.6 GST Reports

| Report | Source Data | Purpose |
|---|---|---|
| Sales Register | ALL sales (official + unofficial) | Internal business tracking |
| GST Sales Register | Official sales only | GSTR-1 preparation |
| GSTR-1 Summary | Official B2B + B2C sales | Monthly filing |
| GSTR-3B Summary | Tax payable vs Input Tax Credit | Monthly filing |
| HSN Summary | Qty and value by HSN code | GSTR-1 requirement |
| Purchase Register | All purchases | Input credit tracking |
| E-invoice Pending | Official sales without IRN entered | Missing IRN tracking |

### 8.7 Dual Accounting

```
OFFICIAL SALE:
  Sale Entry: ₹10,000 + GST ₹1,800 = ₹11,800
  → Posts to: Sales Account (₹10,000)
  → Posts to: Output CGST (₹900), Output SGST (₹900)
  → GST Reports: Included
  → Business Reports: Included

UNOFFICIAL SALE:
  Sale Entry: ₹11,800 (single line, no tax breakup)
  → Posts to: Sales Account (₹11,800)
  → GST Reports: Excluded
  → Business Reports: Included
```

---

## 9. Customer Portal (Store-Centric)

### 8.1 Login → Portal View

```
┌────────────────────────────────────────────────────┐
│  🏪 Welcome, Krishna Distributors                  │
│                                                     │
│  Store: [City A Store ▼]    [Add Store Request]    │
│                                                     │
├────────────────────────────────────────────────────┤
│  DASHBOARD — City A Store                          │
│                                                     │
│  📊 Outstanding: ₹45,000     Due Date: 5 Aug       │
│  📦 Active Orders: 3          🚚 In Transit: 1     │
│  📄 Last Invoice: INV/24-25/142 — ₹12,800          │
│                                                     │
│  🎯 July Monsoon Scheme                            │
│  Target: 500 cases     Current: 350 / 500          │
│  ████████████████░░░░░░░░  70%                     │
│  Potential Rebate: ₹4,375                          │
│  Status: 🟢 In Progress                            │
│                                                     │
│  ┌──────────┬──────────┬──────────┬──────────┐     │
│  │ ORDERS   │INVOICES  │PAYMENTS  │SCHEMES   │     │
│  │View all  │Download  │History   │Rebate    │     │
│  │orders    │invoices  │+ Pay now │details   │     │
│  └──────────┴──────────┴──────────┴──────────┘     │
└────────────────────────────────────────────────────┘
```

### 8.2 Portal Sections

| Section | Content |
|---|---|
| **Dashboard** | Outstanding, active orders, scheme progress bar, last invoice |
| **Orders** | List of all orders for selected store, status, amount |
| **Invoices** | Download/print per invoice |
| **Payments** | Payment history + "Make Payment" capability |
| **Outstanding** | Running balance with aging (current, 30+ days) |
| **Schemes** | Active schemes, targets, progress bars, rebate status after approval |
| **Request Store** | Form to request new store addition (admin approves) |

### 8.3 Scheme Progress Bar States

| State | Display |
|---|---|
| In progress | Progress bar with target, current volume, potential rebate |
| Target achieved (pending approval) | 100% bar, "Awaiting Approval" status, rebate amount shown |
| Approved | "Credited on [date]", rebate amount confirmed |
| Not met | Bar shows achieved %, "Target not met" |

---

## 10. General Features

### 9.1 User Roles & Permissions Summary

| Feature | Admin | Manager | Operator | Agent | Sales Staff | Marketer | Customer |
|---|---|---|---|---|---|---|---|
| View all orders | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Own store only |
| Create orders | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Edit any order | ✓ | ✓ | ✗ | Own only | Own only | Own only | ✗ |
| Approve orders | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Auto-approve toggle | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Record sales | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Record payments | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Online only |
| Transfer stock | ✓ | ✓ | WH↔Users | Anyone | Anyone | ✗ | ✗ |
| Transfer cash | ✓ | ✓ | Anyone | Anyone | Anyone | Anyone | ✗ |
| Adjust balances | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Approve expenses | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Approve schemes | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Production plan | View | View + edit | Enter EOD | ✗ | ✗ | ✗ | ✗ |
| View reports | All | All | Limited | Own | Own | ✗ | Own store |

### 9.2 Expenses

- Any employee can submit an expense with:
  - Category (fuel, repair, salary, rent, power, transport, etc.)
  - Amount
  - Bill/receipt photo upload
  - Note
  - Payment method (optional — defaults to cash from user's holding)
- Manager/Admin reviews → Approve / Reject
- All user-initiated outflows (expenses, purchase payments from user cash) follow the **same pattern**:

```
Upon approval:
  Dr  [Expense Ledger or Supplier Ledger]    ₹amount
      Cr  User Cash in Hand (user)                      ₹amount
  → User's holding balance decreases
  → If user has insufficient balance: balance goes negative
    (company owes user — negative holding = receivable from company)
```

This is identical to the accounting journal pattern for any outflow from a user's holding (expense, purchase payment, transfer to another user). See accounting section 9.3.2 for the complete list.

### 9.3 Accounting Engine (Auto Double-Entry)

Every business transaction (sale, purchase, expense, production, payment, handover, scheme) auto-posts double-entry journal lines. Reports are always computed live from opening balances + journal lines — never from cached running totals.

#### 9.3.1 Table Structure

```
account_groups
  id
  name
  group_type              enum: asset | liability | income | expense | equity
  parent_group_id         nullable FK → account_groups.id (nested hierarchy)
  affect_gross_profit     boolean — drives Gross Profit calculation
  is_system               boolean — fixed groups admin cannot delete

account_ledgers
  id
  group_id                FK → account_groups.id
  name
  ledger_type             enum: customer | supplier | user | bank | stock | general
  reference_id            nullable
  reference_table         nullable enum: customers | suppliers | users | bank_accounts
  is_active
  created_at

fy_periods
  id
  fy_label                e.g. "2025-26"
  start_date
  end_date
  is_locked               boolean — true once FY rollover has run
  locked_at

fy_opening_balances
  id
  fy_id                   FK → fy_periods.id
  ledger_id               FK → account_ledgers.id
  dr_balance              numeric
  cr_balance              numeric

journal_entries
  id
  entry_no                FY-scoped sequential number
  fy_id                   FK → fy_periods.id
  entry_date
  narration
  reference_type          enum: sale | purchase | payment | expense | production
                                | handover | receipt | contra | opening | closing
  reference_id            nullable — links to source record
  created_by
  created_at
  is_audited              boolean — true once locked
  reversed_by_entry_id    nullable FK → journal_entries.id
  reverses_entry_id       nullable FK → journal_entries.id

journal_lines
  id
  journal_entry_id        FK → journal_entries.id
  ledger_id               FK → account_ledgers.id
  dr_amount               numeric, default 0
  cr_amount               numeric, default 0
  stock_item_id           nullable FK → items.id
  stock_qty               nullable numeric
```

**Hard Constraints:**
- `SUM(dr_amount) = SUM(cr_amount)` per journal entry — unbalanced entries rejected at write time
- If `stock_item_id` is set, `stock_qty` must also be non-null, non-zero
- If `is_audited = true`, no `journal_lines` row may be updated/deleted — corrections via reversing entry only
- Entries can only post to an **open** FY (`is_locked = false`)

#### 9.3.2 Auto-Posting Rules

**Sale (Official GST):**
```
Dr  Customer Ledger (store)         ₹11,800
    Cr  Sales                               ₹10,000
    Cr  Output CGST Payable                   ₹900
    Cr  Output SGST Payable                   ₹900

COGS (auto, at same time):
Dr  Cost of Goods Sold               ₹7,000
    Cr  Finished Goods Inventory               ₹7,000
```

**Sale (Unofficial, non-GST):**
```
Dr  Customer Ledger (store)         ₹11,800
    Cr  Sales                               ₹11,800

Dr  Cost of Goods Sold               ₹7,000
    Cr  Finished Goods Inventory               ₹7,000
```

**Payment collected by User (Cash/UPI):**
```
Dr  User Cash in Hand (user)       ₹11,800
    Cr  Customer Ledger (store)               ₹11,800
```

**Bank Deposit (User deposits cash to bank):**
```
Dr  Bank Account (bank)            ₹11,800
    Cr  User Cash in Hand (user)              ₹11,800
```

**Handover — Cash (User A → User B):**
```
Dr  User Cash in Hand (User B)     ₹5,000
    Cr  User Cash in Hand (User A)             ₹5,000
```

**RM Purchase (approved):**
```
Dr  Raw Materials Inventory         ₹15,000
Dr  Input CGST                          ₹900
Dr  Input SGST                          ₹900
    Cr  Supplier Ledger (vendor)               ₹16,800

If user paid from their holding:
Dr  Supplier Ledger (vendor)       ₹5,000
    Cr  User Cash in Hand (user)                ₹5,000
```

**Stage 1 Production (EOD — Preforms → Empty Bottles @ WA of consumed RM):**
```
Dr  Work-in-Progress Inventory       ₹24,000
    Cr  Raw Materials Inventory                  ₹24,000

Dr  Manufacturing Wastage               ₹500
    Cr  Work-in-Progress Inventory                  ₹500

Dr  FG Inventory (Empty Bottles)   ₹23,500
    Cr  Work-in-Progress Inventory               ₹23,500
```

**Stage 2 Production (EOD — Fill + Pack @ WA of consumed materials):**
```
Dr  Work-in-Progress Inventory       ₹30,000
    Cr  FG Inventory (Empty Bottles)            ₹24,000
    Cr  Raw Materials Inventory                   ₹6,000

Dr  Manufacturing Wastage               ₹300
    Cr  Work-in-Progress Inventory                  ₹300

Dr  FG Inventory (Filled Cases)    ₹29,700
    Cr  Work-in-Progress Inventory               ₹29,700
```

**Scheme Rebate (Credit Note to Customer):**
```
Dr  Scheme Rebates (Direct Expense)  ₹5,000
    Cr  Customer Ledger (store)                   ₹5,000
```

**Sales Return:**
```
Dr  FG Inventory (original COGS)     ₹7,000
    Cr  Cost of Goods Sold                       ₹7,000

Dr  Sales (or Sales Returns A/c)    ₹11,800
    Cr  Customer Ledger (store)                  ₹11,800
```

**Expense (User pays from holding):**
```
Dr  [Expense Ledger]                ₹2,000
    Cr  User Cash in Hand (user)                  ₹2,000
```

**Stock Adjustment (Damage/Theft):**
```
Dr  Stock Adjustment (Expense)      ₹1,000
    Cr  [RM / WIP / FG Inventory]                 ₹1,000
```

#### 9.3.3 Report Logic

All reports use recursive CTEs on `parent_group_id` to aggregate ledger balances up through the group hierarchy.

**Trial Balance (as-of date X):**
```sql
WITH ledger_balances AS (
  SELECT
    l.ledger_id,
    fob.dr_balance + COALESCE(SUM(jl.dr_amount), 0) AS total_dr,
    fob.cr_balance + COALESCE(SUM(jl.cr_amount), 0) AS total_cr
  FROM account_ledgers l
  JOIN fy_periods fy ON fy.start_date <= X AND fy.end_date >= X
  LEFT JOIN fy_opening_balances fob
    ON fob.ledger_id = l.id AND fob.fy_id = fy.id
  LEFT JOIN journal_lines jl ON jl.ledger_id = l.id
  LEFT JOIN journal_entries je
    ON je.id = jl.journal_entry_id
   AND je.entry_date BETWEEN fy.start_date AND X
  GROUP BY l.ledger_id, fob.dr_balance, fob.cr_balance
)
SELECT ledger_id, total_dr - total_cr AS balance FROM ledger_balances
```

**P&L (date range within one FY):**
```
Income  = SUM(cr_amount − dr_amount) for ledgers under Income groups
Expense = SUM(dr_amount − cr_amount) for ledgers under Expense groups

Gross Profit = Income(affect_gross_profit=true) − Expense(affect_gross_profit=true)
Net Profit   = Total Income − Total Expense
```

**Balance Sheet (as-of date X):**
```
For each ledger under group_type IN (asset, liability, equity):
  balance = Trial Balance value as of X

Report each ledger under its OWN group_type section.
A negative balance shown as reduction within its section — never moved
to the opposite section.

Equity = Capital ledgers + Reserves & Surplus + Current FY P&L (live)
```

**Key rule:** Classification is always by `account_groups.group_type`, never by sign of balance. A supplier in debit (advance paid) stays under Liabilities as a negative figure.

#### 9.3.4 FY Rollover Procedure

1. Confirm all entries for closing FY are posted and `is_audited = true`
2. Compute closing Trial Balance as of `fy.end_date`
3. Post a real auditable journal entry (`reference_type = 'closing'`) transferring net P&L to Reserves & Surplus
4. Insert `fy_opening_balances` rows for the new FY — Asset/Liability/Equity carry forward, Income/Expense reset to zero
5. Set `fy_periods.is_locked = true` on the closed FY

Back-dated entries to a locked FY are impossible — corrections must be reversing entries in the current open FY.

### 9.4 Invoice Numbering

- FY-based series: e.g., `INV/24-25/001`
- Configurable prefix per invoice type
- Auto-increment, resets each financial year

### 9.5 Inventory Features

- Products with variants (size/type)
- Fixed barcode per SKU
- Multiple warehouses with per-location stock
- Batch tracking on finished products only
- Reorder level alerts (set min stock per SKU)
- Stock transfers between warehouses
- Stock adjustments with reason (admin/manager only)
- Stock movements tracked: purchases IN, production IN, sales OUT, returns IN/OUT, transfers

### 9.6 Purchasing

- Direct purchase from suppliers
- Purchase order (optional, can add later)
- Purchase returns (debit notes)
- Supplier ledger tracking

### 9.7 Payments

Standardized payment method codes (stored in `payment_methods` table, referenced by `payments.method_id`):

| Code | Enum | Where the money goes |
|---|---|---|
| `cash` | Cash | Collected by user → user's holding balance |
| `upi_agent` | UPI (to agent's UPI) | Agent's responsibility → agent's holding balance |
| `upi_company` | UPI (to company UPI) | Direct to company bank → manager records separately in `payments` |
| `card` | Card | Direct to company bank → manager records separately |
| `cheque` | Cheque | Collected by user → user's holding until cleared |
| `bank_transfer` | Bank Transfer | Direct to company bank → manager records separately |
| `advance` | Advance | Reduces customer's outstanding (no cash movement) |

All payment records go into the `payments` table with `method_id` linking to the enum. This replaces the old JSON `payment_breakdown` on the sales table.

### 9.8 Returns

- **Sales returns**: Stock goes back to user's holding (if same user returns) or to WH (if admin/manager processes)
- **Purchase returns**: Debit note, supplier ledger adjusts
- **Production waste**: Recorded in EOD production, deducted from stock, posted to wastage account

### 9.9 Notifications (In-App)

| Event | Who gets notified |
|---|---|
| New order created | Admin, Manager, Operator |
| Order marked urgent | Admin, Manager (highlighted) |
| Transfer request received | Target user |
| Transfer accepted/rejected | Sender |
| Expense submitted for approval | Manager, Admin |
| Expense approved/rejected | Submitter |
| Scheme approval pending | Manager, Admin |
| Scheme approved/rejected | Customer (portal) |
| Stock below reorder level | Admin, Manager, Operator |
| EOD production not entered | Operator (reminder) |
| New customer store request | Admin, Manager |

### 9.10 Integrations

| Integration | Method |
|---|---|
| **WhatsApp** | QR-based unofficial API (e.g., whatsapp-web.js) — send invoice/challan to customer |
| **SMS** | HTTP API (open source provider) — order/delivery notifications |
| **Printer (A4)** | Browser print for invoices, challans, reports |
| **Thermal printer** | Browser print (future: WebUSB/Bluetooth ESC/POS) |
| **Barcode scanning** | Camera-based scanning at POS and stock receipt |

---

## 11. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js (App Router) + TailwindCSS + shadcn/ui |
| Mobile | PWA (same Next.js codebase, works offline) |
| Backend | Supabase (PostgreSQL) |
| Auth | Supabase Auth (email/password + magic link for customers) |
| Authorization | Row Level Security (RLS) — role-based per table |
| Database | Supabase PostgreSQL |
| Storage | Supabase Storage (expense bills, UPI receipts, product images) |
| i18n | next-intl (English + Tamil + Telugu + Kannada + Malayalam) |
| State | Server Components + React Query for client state |
| Real-time | Supabase Realtime (notifications, live updates) |
| Charts | Recharts / Tremor for dashboard |
| Printing | Browser print (react-to-print for thermal POS) |

### 10.1 Database Schema Overview (Tables)

```
customers
  id, name, phone, email, gstin, address, status, created_at

customer_stores
  id, customer_id, name, gstin, address, phone, status,
  route_id (nullable → routes.id), created_at

customer_store_routes (junction — history of route assignments)
  id, customer_store_id, route_id, assigned_at, unassigned_at

routes
  id, name, is_default, status (active|inactive), created_by, created_at

route_sessions
  id, route_id, agent_id → users.id,
  status (pending|active|paused|completed|cancelled),
  started_at, paused_at, resumed_at, ended_at,
  stores_planned, stores_completed, total_distance_km, total_duration_min

users (auth.users + profiles)
  id, role (admin|manager|operator|agent|sales|marketer), 
  name, phone, is_active

items (unified item master — replaces products + raw_materials)
  id, sku_code, name, description, type (raw_material|intermediate|finished_good),
  category, unit_of_measure, bottles_per_case (nullable, for finished goods only),
  hsn_code, gst_rate, barcode, status (active|inactive|discontinued),
  is_raw_material (boolean), created_at

item_categories
  id, name, description, created_at

bom_lines
  id, parent_item_id → items.id, child_item_id → items.id,
  quantity_per, unit_of_measure, scrap_percent,
  effective_from, effective_to, alternate_group_id, priority,
  created_by, created_at, updated_at

item_suppliers (AVL — Approved Vendor List)
  id, item_id → items.id, supplier_id → suppliers.id,
  unit_price, currency, lead_time_days, min_order_qty,
  preferred (boolean), is_active, created_at

alternate_groups
  id, name, created_at

alternate_group_members
  id, group_id, item_id, priority, is_default

suppliers
  id, name, contact, gstin, address, status, created_at

warehouses
  id, name, address, status

visits
  id, route_session_id → route_sessions.id, customer_store_id → customer_stores.id,
  agent_id → users.id, visited_at,
  visit_type (fulfill_order|collect_payment|record_sale|mark_visited),
  no_business_reason, no_business_note,
  lat, lng, duration_min, created_at

stock (inventory balance)
  id, warehouse_id, item_id, batch_no, quantity, created_at

item_costs (weighted average valuation)
  id, item_id → items.id, quantity, total_value, updated_at

account_groups
  id, name, group_type (asset|liability|income|expense|equity), parent_group_id,
  affect_gross_profit, is_system

account_ledgers
  id, group_id, name, ledger_type (customer|supplier|user|bank|stock|general),
  reference_id, reference_table (customers|suppliers|users|bank_accounts), is_active

fy_periods
  id, fy_label, start_date, end_date, is_locked, locked_at

fy_opening_balances
  id, fy_id, ledger_id, dr_balance, cr_balance

journal_entries
  id, entry_no (FY-scoped), fy_id, entry_date, narration,
  reference_type (sale|purchase|payment|expense|production|handover|receipt|contra|opening|closing),
  reference_id, created_by, created_at, is_audited,
  reversed_by_entry_id, reverses_entry_id

journal_lines
  id, journal_entry_id, ledger_id, dr_amount, cr_amount,
  stock_item_id → items.id, stock_qty

user_stock_holdings
  id, user_id, item_id, batch_no, quantity (what user physically has)

user_cash_holdings
  id, user_id, amount (current holding balance)

purchases
  id, purchase_no, supplier_id, total_amount,
  paid_amount, payment_method_id (nullable → payment_methods.id),
  bill_url, status (pending_approval|approved|rejected),
  approved_by, approved_at, created_by, created_at

purchase_items
  id, purchase_id, item_id, quantity, rate, amount

transfers
  id, type (stock|cash), from_user_id, to_user_id, 
  status (pending|accepted|rejected|cancelled), 
  items (JSON), amount, reference_order_id, note, 
  created_at, responded_at

orders
  id, order_no (FY-based), customer_store_id, created_by_user_id,
  priority, urgent_flag, status (pending|approved|challan_printed|fulfilled|cancelled),
  total_amount, notes, visit_id (nullable → visits.id), created_at

order_items (sales_lines)
  id, order_id, item_id, quantity, rate, amount, unit_cogs

delivery_challans
  id, order_id, challan_no, status (printed|in_transit|delivered),
  eway_bill_no, agent_id, printed_at

sales (invoices)
  id, invoice_no (FY-based), order_id, customer_store_id,
  is_official (boolean), irn, eway_bill_no,
  items (JSON), taxable_value, cgst, sgst, igst, total,
  created_by_user_id, created_at

payment_methods (enum)
  id, code (cash|upi_agent|upi_company|card|cheque|bank_transfer|advance),
  name, is_active

payments
  id, sale_id (nullable), customer_store_id, amount,
  method_id → payment_methods.id,
  reference_no (nullable — UPI txn ID, cheque no, etc.),
  collected_by_user_id, visit_id (nullable → visits.id),
  deposited_at, note, created_at

customer_ledger
  id, customer_store_id, transaction_type (sale|payment|credit_note|debit_note|scheme),
  reference_id, amount, balance_after, created_at

credit_notes
  id, customer_store_id, amount, reason,
  reference_sale_id (nullable — for returns), scheme_eligibility_id (nullable),
  status (pending|approved|rejected), approved_by, approved_at,
  created_by, created_at

debit_notes
  id, supplier_id, amount, reason,
  reference_purchase_id, status (pending|approved|rejected),
  approved_by, approved_at, created_by, created_at

production_plans
  id, horizon_start_date, horizon_end_date, created_at

production_plan_days
  id, plan_id FK, plan_date,
  status (planned|locked|in_progress|completed),
  stage1_available_hours, stage2_available_hours,
  stage1_changeover_minutes, stage2_changeover_minutes,
  locked_at, locked_by, completed_at, completed_by,
  reopened_at, reopened_by, reopen_reason

production_plan_allocations
  id, plan_day_id FK, order_id FK, sku_item_id FK,
  qty_allocated, stage1_hours, stage2_hours,
  is_buffer_allocation, material_status, sequence_index

eod_entries
  id, plan_day_id FK, stage (1|2),
  preforms_used, bottles_produced,
  sku_item_id, bottles_filled, caps_used, shrink_used,
  wastage_units, wastage_kg,
  posted_journal_entry_id FK,
  submitted_at, submitted_by

sku_buffer_targets
  sku_item_id FK, min_buffer_qty

production_calendar_exceptions
  id, date, stage (1|2|both), available_hours_override, reason

schemes
  id, name, period_start, period_end, target_type (total_cases),
  target_value, tiers (JSON), status (active|closed)

scheme_eligibility
  id, scheme_id, customer_store_id, total_volume, tier_achieved,
  rebate_amount, status (pending_approval|approved|rejected),
  approved_by, approved_at, credit_note_id

price_history
  id, item_id, supplier_id (nullable), unit_price, quantity, 
  reference_type, reference_id, changed_at

expenses
  id, user_id, category, amount, bill_url, note,
  status (pending|approved|rejected), approved_by, approved_at,
  payment_method_id (nullable → payment_methods.id)

notifications
  id, user_id, type, title, message, link, is_read, created_at
```

---

## 12. Integration Details

### 12.1 WhatsApp

- Using unofficial QR-based API (e.g., whatsapp-web.js or similar)
- Agent/Admin scans QR code to link WhatsApp
- Sends: Invoice PDF, Delivery Challan, Payment Reminders, Order Confirmations
- Templates: configurable per document type

### 12.2 SMS (HTTP API)

- Open source provider with HTTP API
- Sends: Order confirmation, dispatch notification, delivery notification, payment reminder
- Configurable templates

### 12.3 Printing

- **A4 Printer**: Browser print for invoices, challans, reports — standard CSS print styles
- **Thermal Printer**: (future phase) WebUSB or WebBluetooth for ESC/POS protocol
- **Barcode Labels**: (future phase) Print barcode labels for products

---

## 13. Key Design Decisions

| Decision | Rationale |
|---|---|
| **Store-centric** over customer-centric | Customer can have multiple stores with separate GSTINs, invoices, balances |
| **User holdings** (every user has balance) | Physical cash/stock custody tracking — accept/reject at each handover |
| **Dual GST system** | Official sales for compliance, unofficial for cash sales — both counted in internal reports |
| **Day-0 locked** in production plan | Today's production can't change once started. Practical for real factories. |
| **PWA over native mobile** | Single codebase, lower cost, same features everywhere, sufficient for business use |
| **Credit notes for schemes** | Clean audit trail, reduces outstanding, no cash payout complexity |
| **Manual e-invoice upload** | Avoids IRP API integration complexity. User uploads JSON manually. |
| **No partial accepts** in transfers | Accept or reject all — eliminates complexity of partial custody tracking |
| **Daily form live editing** | Operator can edit throughout the day. Manager can back-date. Changes ripple forward. |
| **Free-form routes** | Any agent can start any route. Enables flexibility for dynamic delivery needs. |
| **Route sessions tracked** | Start/end per session enables agent productivity reporting. |
| **Machine/sensor data + human entry** | Practical hybrid — sensors for production count, human for wastage and closing stock. |

---

## 14. Purchasing & Supplier Management

### 14.1 Raw Material Categories

Raw materials are organized by **category**, not individual SKU:

| Category | Example Suppliers |
|---|---|
| 500ml Preforms | Vendor A (₹3), Vendor B (₹3.2), Vendor C (₹2.8) |
| 1L Preforms | Vendor A (₹5), Vendor D (₹4.8) |
| 500ml Caps | Vendor E (₹0.5), Vendor F (₹0.45) |
| Labels (roll) | Vendor H (₹200/roll) |
| Shrink Wrap (roll) | Vendor I (₹350/roll) |

BOM references the **category**. At purchase time, user picks which vendor's item was bought.

### 14.2 Purchase Flow

```
User creates Purchase Request:
  ├─ Date
  ├─ Vendor (from dropdown, associated with material)
  ├─ Items: [Category → Item, Qty, Rate, Amount]
  ├─ Total Bill Amount (auto-calc)
  ├─ Amount Paid Now (cash/UPI) — can be 0 or partial
  ├─ Bill Photo Upload
  └─ Submit for Approval

Manager/Admin reviews → Approve / Reject

When Approved:
  → Warehouse stock +Qty (for each item)
  → Vendor ledger +Total Bill Amount (amount due to vendor)
  → If user paid > 0: User's holding balance −Amount Paid
    (user spent his collected cash on behalf of company)
  → Remaining balance = vendor outstanding
```

### 14.3 Purchase Form

```
┌────────────────────────────────────────────────────┐
│ NEW PURCHASE — Raw Materials                        │
├────────────────────────────────────────────────────┤
│ Vendor: [Select Vendor ▼]                          │
│                                                     │
│ Items:                                              │
│ ┌──────────┬──────────┬──────┬───────┬──────────┐ │
│ │ Category │ Item     │ Qty  │ Rate  │ Amount   │ │
│ ├──────────┼──────────┼──────┼───────┼──────────┤ │
│ │ Preforms │ 500ml    │ 5000 │ 3.00  │ 15,000  │ │
│ │ Caps     │ 500ml Cap│ 5000 │ 0.50  │ 2,500   │ │
│ │ Labels   │ 500ml    │ 10   │ 200   │ 2,000   │ │
│ │          │ Label    │      │       │          │ │
│ └──────────┴──────────┴──────┴───────┴──────────┘ │
│  [+ Add Item]                                       │
│                                                     │
│ Total Bill Amount:             ₹19,500              │
│                                                     │
│ Payment:                                            │
│  Amount Paid Now: [₹  5,000]  via [Cash ▼]          │
│  Balance Due to Vendor:        ₹14,500              │
│                                                     │
│ Bill Photo: [📎 Upload Image]                       │
│                                                     │
│ [Submit for Approval]                               │
└────────────────────────────────────────────────────┘
```

### 14.4 Approval List

```
┌────────────────────────────────────────────────────┐
│ PENDING PURCHASE APPROVALS                          │
├──────────┬──────────┬─────────┬──────────┬─────────┤
│ Date     │ Vendor   │ Amount  │ Paid Now │ Status  │
├──────────┼──────────┼─────────┼──────────┼─────────┤
│ 16 Jul   │ Vendor A │ ₹19,500 │ ₹5,000   │ ⏳ View │
│ 15 Jul   │ Vendor D │ ₹45,000 │ ₹0       │ ⏳ View │
└──────────┴──────────┴─────────┴──────────┴─────────┘
```

### 14.5 Vendor Management

```
VENDOR RECORD:
  ├─ Name / Contact / GSTIN
  ├─ Materials supplied (linked categories)
  ├─ Running ledger (purchases + payments)
  └─ Purchase history

VENDOR LEDGER:
  ┌──────────┬──────────────┬──────────┬───────────────┐
  │ Date     │ Transaction  │ Amount   │ Balance       │
  ├──────────┼──────────────┼──────────┼───────────────┤
  │ 1 Jul    │ Opening      │          │ ₹30,000       │
  │ 5 Jul    │ Purchase     │ +₹15,000 │ ₹45,000       │
  │ 10 Jul   │ Payment      │ -₹20,000 │ ₹25,000       │
  │ 16 Jul   │ Purchase     │ +₹19,500 │ ₹44,500       │
  │ 16 Jul   │ Payment     │ -₹5,000  │ ₹39,500       │
  └──────────┴──────────────┴──────────┴───────────────┘
```

### 14.6 Purchase Returns (Debit Notes)

```
User creates Purchase Return:
  ├─ Vendor
  ├─ Items + quantities being returned
  ├─ Reason (damaged, wrong item)
  ├─ Photo (optional)
  └─ Submit

Manager/Admin approves:
  → Warehouse stock −Qty
  → Vendor ledger −Amount
  → Debit Note generated
```

### 14.7 Purchase Reports

| Report | Shows |
|---|---|
| Purchase Register | All purchases by date/vendor |
| Vendor Outstanding | What we owe each vendor |
| Material Purchase Summary | Qty & rate history per raw material category |
| Price Trend | Rate changes over time per supplier per material |

---

## 15. Reports & Dashboards

### 14.1 Executive Dashboard (Home Screen)

Role-based view. Admin/Manager see everything, others see their scope.

```
┌─────────────────────────────────────────────────────────────────┐
│  📊 DASHBOARD         Wed, 16 Jul 2026                         │
├─────────────────────────────────────────────────────────────────┤
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────┐│
│ │ SALES TODAY  │ │ COLLECTIONS  │ │ PRODUCTION   │ │ PENDING  ││
│ │   ₹45,200    │ │   ₹32,500   │ │   22,000 btl │ │ ORDERS:5 ││
│ └──────────────┘ └──────────────┘ └──────────────┘ └──────────┘│
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ ⏳ PENDING ACTIONS                          3 items         │ │
│ │ • Purchase approval — Vendor A — ₹19,500                   │ │
│ │ • Expense approval — Agent K — ₹500 (fuel)                 │ │
│ │ • Transfer pending — Agent M → Manager — ₹6,000            │ │
│ │ • Reorder alert — Preforms 500ml — only 2,000 left         │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌──────────────────────────────┬──────────────────────────────┐ │
│ │ HOLDINGS (End of Day)        │ STOCK SUMMARY               │ │
│ │ Operators:    ₹12,000       │ WH Finished:  5,000 cases   │ │
│ │ Agents:       ₹45,000       │ WH Raw:       25,000 units  │ │
│ │ Manager:      ₹10,000       │ Agent holding: 1,200 cases  │ │
│ │ Bank:       ₹2,50,000       │                              │ │
│ └──────────────────────────────┴──────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 14.2 Daily Summary Report (End of Day Sheet)

```
┌─────────────────────────────────────────────────────────────────┐
│  📋 END OF DAY SUMMARY — 16 Jul 2026                           │
│  Batch Codes: B260716-001 to B260716-005                       │
├─────────────────────────────────────────────────────────────────┤
│ 💰 SALES                                                        │
│  Total: ₹45,200 (34 txns) | Official: ₹32,000 | Unofficial: ₹13,200│
│  By SKU: 500ml: ₹28,000 | 1L: ₹12,200 | 2L: ₹5,000            │
│                                                                 │
│ 📦 PURCHASES: Vendor A — ₹15,000 | Vendor E — ₹2,500           │
│ 🏭 PRODUCTION: Stage 1: 24,000 btls | Stage 2: 22,000 btls    │
│ 💳 PAYMENTS: Cash ₹18K | UPI ₹10.5K | Card ₹4K | Bank ₹7K     │
│ 💸 EXPENSES: Fuel ₹500 | Electricity ₹2,500                    │
│                                                                 │
│ 👥 USER HOLDINGS: Operator ₹12K | Agent K ₹8.5K | Agent S ₹36.5K│
│ 📊 CLOSING STOCK: 500ml: 3,200 cs | 1L: 1,500 cs | 2L: 300 cs │
│ 👤 ATTENDANCE: ✅ Raj ✅ Kumar ✅ Suresh ❌ Rahul               │
└─────────────────────────────────────────────────────────────────┘
[📥 PDF] [📥 Excel]
```

### 14.3 Drill-Down Navigation

Every number on every report is clickable:

| Click | Opens |
|---|---|
| Sales Today: ₹45,200 | List of all transactions → click → full invoice |
| Purchase: ₹19,500 | Purchase record with bill → vendor ledger |
| Agent Holding: ₹8,500 | Agent's holding detail → transfer history |
| Closing Stock: 3,200 | Stock movement report → filter by SKU |

### 14.4 Full Report Suite

**Financial:** P&L, Balance Sheet, Cash Flow, Trial Balance, Day Book, Ledger

**Sales:** Sales Register (all), GST Sales Register, Customer Outstanding (aging), Sales by SKU, Sales by Customer, Sales by Agent

**Purchase:** Purchase Register, Vendor Outstanding, Material Purchase Summary, Price Trend

**Production:** Plan vs Actual, Daily Production Log, Wastage Analysis, Batch Trace, Material Consumption

**Inventory:** Stock Summary, Stock Movement, Reorder Alerts, Stock Aging

**Handover:** User Holdings Summary, Transfer Log, Pending Transfers, Reconciliation Report

**GST:** GSTR-1 Summary, GSTR-3B Summary, E-invoice Pending, ITC Register

**Scheme:** Scheme Performance, Pending Approvals, Rebate History

### 14.5 Report Controls (Universal)

```
Period: [Date Range ▼]  Type: [All ▼]  Customer: [All ▼]
[📥 PDF] [📥 Excel] [🖨️ Print]
```

---

## 16. CRM

### 15.1 Lead Management

```
Lead Source: Marketer / Referral / Inbound / Walk-in
     │
     ├─ Convert to Customer (creates customer + first store)
     │
     └─ Lost / Not Qualified

Lead Fields:
  ├─ Name / Company
  ├─ Phone / Email
  ├─ Source
  ├─ Assigned To (marketer)
  ├─ Status: New → Contacted → Qualified → Converted / Lost
  ├─ Notes
  └─ Follow-up Date
```

### 15.2 Customer Store 360° View

```
┌────────────────────────────────────────────────────┐
│  🏪 Krishna Store — City A                         │
├────────────────────────────────────────────────────┤
│  OVERVIEW │ ORDERS │ INVOICES │ LEDGER │ ACTIVITY │
├────────────────────────────────────────────────────┤
│  Outstanding: ₹45,000    MTD Sales: ₹1,20,000     │
│                                                     │
│  🎯 July Scheme: 350/500 cases (70%)              │
│  ████████████████░░░░░░░░                         │
│  Last Order: 100 cases on 15 Jul                   │
│                                                     │
│  📞 Next Follow-up: Tomorrow (call)               │
│  👤 Assigned: Rajesh (Marketer)                   │
│  ⏳ Complaints: 1 open                             │
└────────────────────────────────────────────────────┘
```

### 15.3 Interaction Log

```
┌──────────┬──────────┬──────────┬─────────────────────┐
│ Date     │ Type     │ By       │ Note                │
├──────────┼──────────┼──────────┼─────────────────────┤
│ 16 Jul   │ Call     │ Rajesh   │ Will order 100 cs   │
│ 14 Jul   │ Visit    │ Rajesh   │ Showed new scheme   │
│ 10 Jul   │ WhatsApp │ System   │ 70% to target 🎯   │
│ 8 Jul    │ Order    │ Customer │ Ordered 150 cases   │
└──────────┴──────────┴──────────┴─────────────────────┘
[➕ Log New Interaction]
```

### 15.4 Auto Follow-up Reminders

```
┌──────────┬──────────┬──────────┬──────────┬────────┐
│ Store    │ Due      │ Scheme   │ Last     │ Action │
├──────────┼──────────┼──────────┼──────────┼────────┤
│ Store A  │ Call     │ 70% 🟡  │ 5 days   │ [Call] │
│ Store B  │ Visit    │ 40% 🔴  │ 12 days  │ [Visit]│
│ Store C  │ Follow-up│ New lead │ —        │ [Call] │
│ Store D  │ No order │ At risk │ 7 days   │ [Msg]  │
└──────────┴──────────┴──────────┴──────────┴────────┘
```

### 15.5 Automated Customer Notifications

| Trigger | Channel | Message |
|---|---|---|
| Scheme 50% | WhatsApp | "You're 50% to July target! Order more." |
| Scheme 80% | WhatsApp | "Almost there! Just 20% more." |
| Scheme achieved | WhatsApp | "🎉 Target achieved! Rebate pending approval." |
| No order in 7 days | WhatsApp | "Need a refill? Place your order." |
| Outstanding > 30 days | WhatsApp/SMS | "₹45,000 due. Please clear." |
| Order dispatched | WhatsApp | "Order #102 dispatched." |

### 15.6 Complaint Tracking (Light)

```
Status: Open → In Progress → Resolved / Rejected
Resolution: Replacement / Credit Note / Rejected
```

### 15.7 Marketing Campaigns

```
Campaign: Name + Target audience + Message + Channel (WhatsApp/SMS) + Schedule
Report: Sent / Read / Orders attributed / Revenue
```

### 15.8 CRM Reports

| Report | Description |
|---|---|
| Lead Funnel | New → Contacted → Converted by source/marketer |
| Store Activity | Last interaction per store, sorted by staleness |
| Marketer Performance | Orders generated, follow-up compliance |
| Scheme Progress (CRM) | All stores + scheme status for marketer prioritization |
| Campaign Analytics | Sent, read, conversion rate per campaign |
| Complaint Summary | Open complaints, resolution time |

---

## 17. Inventory & Warehouse Operations

### 16.1 Daily Production Form (EOD Entry)

Either operator or manager can fill this anytime during the day. Operator can edit freely before day ends. Manager can back-date entries for past dates — changes ripple through inventory from that date onward.

```
┌────────────────────────────────────────────────────────────┐
│  📋 DAILY PRODUCTION FORM — 16 Jul 2026                    │
│  Status: 🟡 Draft (last saved 2:30 PM by Operator Raj)    │
│  (Finalizes automatically at midnight, or can Submit now)  │
│                                                             │
│  Filled by: [Operator ▼]                                   │
│                                                             │
│  WIP BUFFER (Empty bottles between S1 & S2):               │
│    Opening WIP bottles:          [  8,000  ]                │
│    Stage 1 bottles in:           [  24,000  ]               │
│    Stage 2 bottles out:          [  22,000  ]               │
│    Closing WIP bottles:          [  10,000  ]               │
│                                                             │
│  STAGE 1 (Blowing):                                        │
│    Bottles blown today (machine): [  24,000  ]             │
│    Preform waste (kg):           [  50  ]                  │
│                                                             │
│  STAGE 2 (Filling):                                        │
│    Printer closing number:       [  145,000  ]             │
│      (Yesterday: 123,000 → Today filled: 22,000)           │
│    Bottle waste (kg):            [  15  ]                   │
│    Bottles filled (from printer diff): [  22,000  ]        │
│                                                             │
│  RAW MATERIAL CLOSING STOCK:                                │
│    Preforms — bags LEFT:        [  45  ]                   │
│    Caps — boxes LEFT:           [  18  ]                   │
│    Labels — rolls LEFT:         [  6  ]                    │
│    Shrink rolls LEFT:           [  12  ]                   │
│    [Other RM items...]                                      │
│                                                             │
│  PACKING:                                                   │
│    Shrink wrap waste (grams):    [  200  ]                  │
│    Closing stock — Cases on floor: [  3,200  ]             │
│                                                             │
│  BATCH CODES PRODUCED:                                      │
│    [B260716-001] [B260716-002] [B260716-003] [+ Add]       │
│                                                             │
│  ATTENDANCE:                                                │
│    ✅ Operator Raj: Present                                 │
│    ✅ Agent Kumar: Out for delivery                         │
│    ✅ Agent Suresh: Present                                 │
│    ❌ Marketer Rahul: Leave                                 │
│    [+ Add Person]                                           │
│                                                             │
│  NOTES:                                                     │
│  [Machine 2 had 10 min downtime. Nothing major.]           │
│                                                             │
│  [SAVE DRAFT]  [SUBMIT]  [📜 Version History]              │
└────────────────────────────────────────────────────────────┘
```

**On submit, system calculates:**
```
WIP balance          = Opening WIP + Stage 1 Output − Stage 2 Consumption
Expected FG closing  = Opening FG + Production + Sales Returns + Transfer In
                       − Sales − Transfer Out − Adjustment Out + Adjustment In
Physical FG closing  = Operator's entry (Cases on floor)
FG Variance          = Physical − Expected

Expected RM closing  = Opening RM + Purchases In + Transfer In − Stage 1 Consumption
                       − Transfer Out − Adjustment Out + Adjustment In + Return In
Physical RM closing  = Operator's entry (per RM item)
RM Variance          = Physical − Expected

If FG variance > threshold → alert manager
If RM variance > threshold → alert manager
If Closing WIP < minimum buffer → warn operator
```

**Version history:** Every edit logged (who, what, when, previous value).

### 16.2 WIP Buffer & Wastage Calculation

**WIP (Work in Progress)** — Empty bottles between Stage 1 and Stage 2:
```
Opening WIP (auto) = Yesterday's Closing WIP
Stage 1 adds       = Bottles blown today
Stage 2 consumes   = Bottles filled today (from printer reading)
Closing WIP        = Opening + Stage 1 adds − Stage 2 consumes
```

**Wastage:**
| Entry | Calculation |
|---|---|
| Stage 1 wastage (units) | Bottles blown from machine − Expected (from preforms consumed) |
| Stage 1 wastage (kg) | Operator enters directly |
| Stage 2 bottles filled | Today's printer number − Yesterday's printer number |
| Stage 2 wastage (units) | Bottles filled from printer − Cases on floor × bottles_per_case |
| Shrink waste (grams) | Operator enters directly |

**WIP alerting:** If Closing WIP drops below a configurable minimum buffer (e.g., 5,000 bottles), system warns the operator that Stage 1 must start early next shift to avoid starving Stage 2.

### 16.3 Machine/Sensor Integration

| Source | Data | Integration |
|---|---|---|
| Blowing machine | Bottles blown per hour/day | Manual entry from display (future: API) |
| Filling printer | Serial number (cumulative) | Manual entry of closing number |
| Case sensor | Cases packed count | Optional cloud API → Supabase |

### 16.4 Stock Tracking by Location

```
WAREHOUSE A (Factory):
  ├─ Finished Goods: 500ml, 1L, 2L
  ├─ Raw Materials: Preforms, Caps, Labels, Shrink
  └─ WIP Buffer: Empty bottles between Stage 1 and Stage 2

WAREHOUSE B (City Godown):
  ├─ Finished Goods only
  └─ Stock transfers from WH A

Total company stock = Σ(all warehouses)

WIP Buffer tracked separately:
  Opening WIP + Stage 1 Output − Stage 2 Consumption = Closing WIP
  WIP valuation: at Empty Bottle weighted average (see 16.9)
```

### 16.5 Inter-Warehouse Transfers (Same Handover Pattern)

```
Manager A sends transfer request:
  ├─ From: Warehouse A
  ├─ To: Warehouse B
  ├─ Items: [SKU, Qty]
  └─ Note

If Manager B has access to WH B → Accept / Reject
If same manager has access to both → auto-approved

States: Pending → Accepted / Rejected / Cancelled

When accepted:
  WH A stock −Qty
  WH B stock +Qty
```

### 16.6 Stock Adjustments (Admin Only)

```
Admin creates adjustment:
  ├─ Warehouse
  ├─ Items: [SKU, Qty change (+/−)]
  ├─ Reason: Damage / Theft / Count Variance / Write-off / Correction
  ├─ Note
  └─ Posts directly (self-approved)

Full audit trail: who, what, when, why, previous qty, new qty.
```

### 16.7 Reorder Alerts

Per-SKU configuration:
```
┌────────────────────────────────────────────────────┐
│  REORDER LEVEL SETTINGS                             │
├──────────┬────────────┬──────────┬─────────────────┤
│ SKU      │ Min Level  │ Max Level│ Preferred Vendor│
├──────────┼────────────┼──────────┼─────────────────┤
│ 500ml    │ 50,000     │ 100,000  │ Vendor A        │
│ Preforms │ units      │ units    │                  │
│ 500ml    │ 50,000     │ 100,000  │ Vendor E        │
│ Caps     │ units      │ units    │                  │
│ 500ml    │ 2,000 cs   │ 5,000 cs │ —               │
│ Finished │            │          │                  │
└──────────┴────────────┴──────────┴─────────────────┘

When stock ≤ Min Level:
  → Alert on dashboard
  → Notification to Operator & Manager
  → Suggest PO for raw materials
  → Suggest production run for finished goods
```

### 16.8 Stock Reports

| Report | Description |
|---|---|
| Stock Summary | Current qty per SKU per warehouse |
| Stock Movement | All in/out/transfer transactions for a SKU over period |
| Daily Stock Report | Opening + In − Out = Closing (from daily form) |
| Variance Report | Expected vs Physical stock (from EOD counting) |
| Reorder Alerts | SKUs below minimum across all warehouses |
| Stock Aging | How long stock in warehouse (slow movers) |
| Batch Trace | Batch code → production date → RM used → orders fulfilled |
| Inter-WH Transfer Log | All transfers between warehouses with status |

### 16.9 Inventory Valuation (Weighted Average)

#### Core Model

One global Weighted Average (WA) per item across all warehouses. Warehouse is tracked for stock quantity only — valuation is company-wide.

```
item_costs
  id
  item_id            → items.id
  quantity           DECIMAL (total stock across all warehouses)
  total_value        DECIMAL (total inventory value = qty × WA)
  updated_at

WA = total_value / quantity  (when qty > 0)
```

#### WA Update Rules

| Movement | Effect | WA Impact |
|---|---|---|
| Purchase IN | Value += purchase_amt, Qty += purchase_qty | WA recalculates (blends new cost) |
| Production IN (FG/Intermediate) | Value += production_cost, Qty += output_qty | WA recalculates |
| Sales Return IN | Value += qty × original_sale_COGS, Qty += return_qty | WA recalculates (reverses original cost) |
| Sales OUT (COGS) | Value −= qty × WA, Qty −= sale_qty | WA unchanged |
| Production OUT (RM consumed) | Value −= qty × WA, Qty −= consumed_qty | WA unchanged |
| Inter-WH Transfer | Value unchanged (qty moves between warehouses) | WA unchanged |
| Adjustment IN | Value += qty × WA, Qty += adj_qty | WA unchanged |
| Adjustment OUT | Value −= qty × WA, Qty −= adj_qty | WA unchanged |

#### Sales Return — Exact Original COGS Reversal

Returns must reverse the exact COGS from the original sale, not the current WA:

```
Dr  FG Inventory                     [qty × original sale's unit_cogs]
    Cr  COGS                         [qty × original sale's unit_cogs]
```

Each sale line stores the unit COGS at time of sale:

```
sales_lines (or order_items)
  ... existing fields ...
  unit_cogs           DECIMAL (WA at time of sale — stored, not computed live)
```

#### Production Costing with WA

Stage 1 (Blowing — Preforms → Empty Bottles):
```
Preforms consumed: 24,000 units at WA ₹2.93 = ₹70,320
Output: 23,500 good bottles
Empty Bottle new WA = ₹70,320 / 23,500 = ₹2.99/bottle
Wastage: 500 bottles × ₹2.99 = ₹1,495 → Mfg Wastage account
```

Stage 2 (Filling — Bottles + Caps + Labels → Filled Cases):
```
Empty bottles: 23,500 × ₹2.99 = ₹70,320
Caps: 24,000 × ₹0.48 = ₹11,520
Labels: 24,000 × ₹0.12 = ₹2,880
Packaging: ₹1,500
Total: ₹86,220
Output: 978 cases
Filled Case new WA = ₹86,220 / 978 = ₹88.16/case
```

#### Edge Cases

| Scenario | Rule |
|---|---|
| Negative stock | Blocked — cannot sell/consume more than available qty |
| Zero stock + new purchase | Fresh WA = purchase rate |
| Qty reaches zero | WA resets to 0. Next inbound sets fresh WA. |
| Inter-warehouse transfer | Qty moves at no value change. Cost = WA at time of transfer. |
| BOM Standard Cost vs WA | BOM standard cost is for planning/estimation. Actual accounting uses WA. The two are independent — variance not tracked. |

---

## 18. Routes

### 17.1 Route Definition

```
ROUTE RECORD:
  ├─ Name (e.g., "City North — Monday")
  ├─ Status: Active / Inactive
  ├─ Default Route? (for auto-assignment on signup)
  ├─ Agents assigned to this route
  └─ Created by: Admin/Manager

ROUTE-STORE ASSIGNMENT (junction):
  ├─ customer_store_id + route_id
  ├─ assigned_at / unassigned_at (history preserved)
  └─ A store can be on multiple routes, but only one active route at a time
```

Routes created by Admin/Manager. Stores are assigned via `customer_store_routes` junction table — a store's current route is the latest active assignment. `customer_stores.route_id` caches the current route for quick lookup in dropdowns and filters.

### 17.2 Store Assignment Logic

```
Staff creates store for customer:
  → Route dropdown: [Select Route ▼] or [Apply Default]

Customer self-signs up (first store only):
  → Default route auto-applied (based on store type/area)

Store Types:
  ┌──────────────┬─────────────────────────────┐
  │ Type         │ Default Route (example)     │
  ├──────────────┼─────────────────────────────┤
  │ Distributor  │ Bulk Supply Route           │
  │ Retail       │ City Retail Route           │
  │ Institutional│ Institutional Route          │
  │ Direct       │ Direct Delivery Route        │
  └──────────────┴─────────────────────────────┘

Customers can create their first store on signup.
Additional stores must be created by staff.
```

### 17.3 Agent Mobile View — Route Session

```
┌────────────────────────────────────────────────────┐
│  🗺️ MY ROUTES                    Agent: Kumar     │
├────────────────────────────────────────────────────┤
│  Active Sessions: 1                                 │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │ 🟢 City North — Started 9:15 AM              │  │
│  │  6 stores | 3 orders pending                 │  │
│  │                                              │  │
│  │  ┌─────────┬──────────┬────────┬──────────┐ │  │
│  │  │ Store   │ Orders   │ Status │ Action   │ │  │
│  │  ├─────────┼──────────┼────────┼──────────┤ │  │
│  │  │ Store A │ 1 order  │ ⏳     │ Navigate │ │  │
│  │  │ Store B │ —        │ ⏳     │ Mark     │ │  │
│  │  │ Store C │ 2 orders │ ⏳     │ Navigate │ │  │
│  │  │ Store D │ —        │ ✅    │ Visited  │ │  │
│  │  │ Store E │ —        │ ⏳     │ Mark     │ │  │
│  │  └─────────┴──────────┴────────┴──────────┘ │  │
│  │                                              │  │
│  │  📍 [Show Map View]                         │  │
│  │  [🛑 End Route]                              │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  [+ Start New Route]                                │
└────────────────────────────────────────────────────┘
```

### 17.4 Map View (Auto-Optimized)

```
┌────────────────────────────────────────────────────┐
│  🗺️ City North Route — Suggested Path              │
│                                                     │
│         🏪 Store D (visited ✅)                    │
│        /                                            │
│   🏪 Store A ── 🏪 Store B ── 🏪 Store C          │
│       (you)              \                          │
│                          🏪 Store E ── 🏪 Store F  │
│                                                     │
│  🟢 You are here        📍 Suggested next: Store A │
│                                                     │
│  [Navigate to Store A]  [Reorder ▼]                 │
└────────────────────────────────────────────────────┘
```

System suggests optimal path. Agent can reorder freely.

### 17.5 Visit Actions

When agent arrives at store:

```
┌────────────────────────────────────────────────────┐
│  🏪 Store A — Krishna Store, City North            │
├────────────────────────────────────────────────────┤
│  What do you want to do?                            │
│                                                     │
│  📦 Fulfill Order    (1 pending order)             │
│  💰 Collect Payment  (Outstanding: ₹12,000)        │
│  📝 Record Sale      (New walk-in order)           │
│  👋 Mark Visited     (No business today)           │
│                                                     │
│  ── If "Mark Visited" ──                            │
│  Why no business?                                   │
│  ○ Other brand in stock                            │
│  ○ Sufficient stock already                        │
│  ○ Store closed                                     │
│  ○ Owner not available                              │
│  ○ Other: [______________]                         │
│                                                     │
│  Notes: [_____________]                             │
│                                                     │
│  [Confirm Visit]                                    │
└────────────────────────────────────────────────────┘
```

### 17.6 Multiple Simultaneous Routes

Agent can run multiple route sessions simultaneously:

```
┌────────────────────────────────────────────────────┐
│  🗺️ Active Sessions                                 │
│                                                     │
│  🟢 City North — Started 9:15 AM (5/6 stores done) │
│  🟢 Industrial Area — Started 2:00 PM (1/4 done)   │
│                                                     │
│  [Switch to Industrial Area]                        │
│  [End City North Session]                           │
└────────────────────────────────────────────────────┘
```

Each start/end is a **session** — tracked for agent productivity.

### 17.7 Route Session State Machine

```
route_sessions
  id, route_id, agent_id (→ users.id),
  status (pending|active|paused|completed|cancelled),
  started_at, paused_at, resumed_at, ended_at,
  stores_planned (INT), stores_completed (INT),
  total_distance_km, total_duration_min

Transitions:
  pending  → active    : Agent starts the route
  active   → paused    : Agent pauses (lunch, break)
  paused   → active    : Agent resumes
  active   → completed : Agent ends route (all visited or skipped)
  active   → cancelled : Manager/admin cancels mid-route
```

### 17.8 Visit Tracking

```
visits
  id
  route_session_id      → route_sessions.id
  customer_store_id     → customer_stores.id
  agent_id              → users.id
  visited_at            TIMESTAMP
  visit_type            enum: fulfill_order | collect_payment | record_sale | mark_visited
  no_business_reason    nullable enum: other_brand_in_stock | sufficient_stock
                                     | store_closed | owner_not_available | other
  no_business_note      nullable
  lat                   nullable DECIMAL(10,7)
  lng                   nullable DECIMAL(10,7)
  duration_min          INT — auto-calculated
  created_at
```

Actions link back to visits via FK:

```
fulfillments
  id, visit_id → visits.id, order_id, items_delivered (JSON), status, delivered_at

payments
  id → now includes visit_id FK (nullable)

orders
  id → now includes visit_id FK (nullable, for walk-in sales recorded during route)
```

### 17.9 Offline Behavior

```
Before starting route:
  → Device caches route + store list + store coordinates + pending orders
  → All data stays available offline

During route (offline):
  → Agent navigates, marks visits, fulfills orders
  → All actions queued locally with temp IDs
  → GPS lat/lng captured from device

On reconnection:
  → Queued actions sync in order: visit → fulfillment → order → payment
  → Temp IDs replaced with real IDs
  → Last-write-wins for visit notes

Payments require signal — cannot record payment collection offline
(prevents double-spend / reconciliation issues).
```

### 17.10 Route Reports

| Report | Description |
|---|---|
| Route Coverage | % of assigned stores visited per route per day/week |
| Visit Reasons | Breakdown: sale vs payment vs visit vs no-show |
| No-Business Analysis | Why stores declined (other brand, stock, closed) |
| Agent Productivity | Sessions/day, stores/session, time/store |
| Missed Stores | Stores not visited in expected cycle — alerts manager |
| Route Efficiency | Actual time vs optimal route time |

### 17.11 Route Dashboard (Admin/Manager)

```
┌────────────────────────────────────────────────────┐
│  🗺️ ROUTE COVERAGE — Today, 16 Jul               │
├──────────┬──────────┬──────────┬───────────────────┤
│ Route    │ Stores   │ Visited  │ Coverage          │
├──────────┼──────────┼──────────┼───────────────────┤
│ City Nth │ 6        │ 5        │ ████████████░ 83% │
│ City Sth │ 8        │ 3        │ █████░░░░░░░ 38% │
│ Industrial│ 4        │ 1        │ ██░░░░░░░░░░ 25% │
├──────────┼──────────┼──────────┼───────────────────┤
│ ⚠️ Missed: Store C (not visited in 5 days)         │
└────────────────────────────────────────────────────┘

---

## 19. Attendance & HR

### 18.1 Employee Pay Configuration

Per-employee setup:

```
┌────────────────────────────────────────────────────┐
│  EMPLOYEE PAY SETTINGS — Kumar (Agent)             │
├────────────────────────────────────────────────────┤
│  Pay Type: [Daily Wage ▼]                          │
│                                                     │
│  Default Rates:                                     │
│  ┌──────────┬──────────┬──────────────────────────┐│
│  │ Shift    │ Hours    │ Amount                   ││
│  ├──────────┼──────────┼──────────────────────────┤│
│  │ Single   │ 8 hrs    │ ₹500                     ││
│  │ Double   │ 16 hrs   │ ₹1,200                   ││
│  │ Overtime │ Per extra│ ₹75/hr                   ││
│  │          │ hour     │                          ││
│  └──────────┴──────────┴──────────────────────────┘│
│                                                     │
│  ──OR for Monthly Salary──                         │
│  Pay Type: [Monthly Salary ▼]                      │
│  Base Salary: ₹15,000/month                        │
│  Overtime: ₹75/hr (extra beyond standard hours)    │
│                                                     │
│  [Save]                                             │
└────────────────────────────────────────────────────┘
```

### 18.2 Daily Attendance Entry

Part of the Daily Production Form:

```
┌────────────────────────────────────────────────────┐
│  👤 ATTENDANCE & PAYROLL — 16 Jul 2026             │
│  Shift: [Single ▼]  Timings: 8:00 AM — 4:00 PM   │
│                                                     │
│  Present Staff:                                     │
│  ┌──────────┬──────────┬──────────┬──────────┬────┐│
│  │ Name     │ Role     │ Check-in │ Hours    │ Pay││
│  ├──────────┼──────────┼──────────┼──────────┼────┤│
│  │ ✅ Raj   │ Operator │ 7:55 AM  │ 8 hrs    │₹500││
│  │ ✅ Kumar │ Agent    │ 8:10 AM  │ 8 hrs    │₹500││
│  │ ✅ Suresh│ Agent    │ 8:00 AM  │ 10 hrs   │₹650││
│  │          │          │          │(2 OT)    │    ││
│  │ ❌ Rahul │ Marketer │ —        │ —        │ —  ││
│  │ ☐ Manoj │ Delivery │ [8:15]   │ [8 hrs]  │[500]││
│  └──────────┴──────────┴──────────┴──────────┴────┘│
│                                                     │
│  ➕ [Add Person]  (for daily-wage workers not in    │
│     permanent employee list)                        │
│                                                     │
│  Day Total (Payroll): ₹1,650                        │
│                                                     │
│  [SAVE DRAFT]  [COMMIT]                             │
└────────────────────────────────────────────────────┘
```

- Check-in time auto-filled or manually entered
- Overtime: if hours > shift standard, OT rate applies — amount auto-updates
- User can manually override any cell before commit
- Editable anytime before EOD

### 18.3 Monthly Payroll Calculation

```
┌────────────────────────────────────────────────────┐
│  💰 PAYROLL — July 2026                             │
├──────────┬──────────┬──────────┬─────────┬─────────┤
│ Employee │ Type     │ Days     │ OT hrs  │ Net Pay │
├──────────┼──────────┼──────────┼─────────┼─────────┤
│ Raj      │ Daily    │ 26 days  │ 5 hrs   │ ₹13,375│
│ Kumar    │ Daily    │ 24 days  │ 12 hrs  │ ₹12,900│
│ Suresh   │ Monthly  │ —        │ 8 hrs   │ ₹15,600│
│ Rahul    │ Monthly  │ —        │ 0       │ ₹12,000│
├──────────┼──────────┼──────────┼─────────┼─────────┤
│          │          │          │ TOTAL   │ ₹53,875│
└──────────┴──────────┴──────────┴─────────┴─────────┘

[View Details]  [📥 Excel]  [Mark as Paid]

Calculation logic:
  Daily wage:  Days present x daily rate + OT hours x OT rate
  Monthly:     Base salary / total working days x days present + OT
  OT:          Only if actual hours > standard shift hours
```

### 18.4 Payroll Payment

When marked "Paid":
- Amount recorded as expense (category: Salary)
- If paid from manager's pocket → manager's holding balance reduces (expense handover flow)
- If paid from company bank → recorded as bank payment

### 18.5 Reports

| Report | Description |
|---|---|
| Attendance Register | Day-wise: who was present/absent for any period |
| Monthly Payroll | Auto-calculated from attendance entries |
| Overtime Summary | OT hours per employee per period |
| Payroll Expense | Total salary paid per month with breakdown |

---

## 19. Deep Dive #4: Bank Reconciliation

### 19.1 Problem Statement

The company has one or more bank accounts. Payments flow in via bank transfer, UPI (company UPI), card swipe, and cheque. Some payments are recorded in the system at the time of collection (e.g., operator records a `upi_company` payment on a sale) and some are not (e.g., a direct bank transfer where the manager enters it later). The bank statement from the bank lists all inflows and outflows, but:

- Not every bank entry has a matching system record (bank charges, interest, unknown deposits)
- Not every system record has appeared in the bank yet (uncleared cheques, pending UPI settlements)
- The same real-world payment may be recorded differently across systems

Goal: match bank statement lines to system records, flag discrepancies, and produce a reconciled balance.

**Key design decision:** Reconciliation is ad-hoc — the manager uploads a statement whenever convenient (weekly, fortnightly, monthly, or even skipping some periods). There is no forced frequency. The system must handle overlapping periods, gaps, and back-dated uploads gracefully.

### 19.2 Data Model

#### 19.2.1 bank_accounts

```
bank_accounts
  id
  ledger_id               FK → account_ledgers.id
  bank_name
  account_number          masked (last 4 digits only in UI)
  ifsc_code
  account_type            enum: savings | current | cash_credit
  opening_balance         numeric (as of fy start)
  is_active               boolean
  created_at
```

Each `bank_account` has exactly one `account_ledger` (ledger_type = bank). The ledger holds all journal entries for this account.

#### 19.2.2 bank_transactions (from manual CSV import)

```
bank_transactions
  id
  bank_account_id         FK → bank_accounts.id
  txn_date                date (from bank statement)
  narration               string (bank's description)
  ref_no                  nullable — cheque no, UPI ref, etc.
  dr_amount               numeric — money leaving the account
  cr_amount               numeric — money entering the account
  balance_after           numeric (from statement)
  import_batch_id         FK → bank_statement_imports.id
  reconciled_status       enum: unmatched | auto_matched | manually_matched | flagged
  matched_payment_id      nullable FK → payments.id
  matched_journal_line_id nullable FK → journal_lines.id
  match_confidence        nullable numeric 0-1
  matched_at              timestamptz
  matched_by              FK → users.id
  notes                   nullable
  created_at
```

#### 19.2.3 bank_statement_imports (track each CSV upload)

Manager uploads statements ad-hoc. Periods may overlap with previous imports or have gaps — the system never assumes continuity. Each import's balance comparison is independent.

```
bank_statement_imports
  id
  bank_account_id         FK → bank_accounts.id
  filename                original filename
  row_count               total rows in CSV
  matched_count           auto-matched rows
  unmatched_count         rows with no match
  flagged_count           rows manually flagged
  status                  enum: pending_review | reconciled | partially_reconciled
  period_start            date
  period_end              date
  opening_balance         numeric (first row balance_before)
  closing_balance         numeric (last row balance_after)
  system_balance_on_date  numeric — computed from journal lines as of period_end
  difference              numeric — closing_balance − system_balance_on_date
  imported_by             FK → users.id
  imported_at             timestamptz
  reviewed_by             FK → users.id (nullable)
  reviewed_at             timestamptz (nullable)
```

#### 19.2.4 Reconciliation adjustments (for entries that exist in bank but not in system)

```
reconciliation_adjustments
  id
  import_batch_id          FK → bank_statement_imports.id
  bank_transaction_id      FK → bank_transactions.id
  adjustment_type          enum: bank_charges | bank_interest | unknown_deposit | unknown_withdrawal | correction
  amount                   numeric
  narration                string
  journal_entry_id         nullable FK → journal_entries.id (once posted)
  status                   enum: pending | posted | skipped
  created_at
```

### 19.3 CSV Import Flow

#### 19.3.1 Expected CSV Columns

The system supports a configurable column mapping UI. Default mapping expects:

| Column | Description | Example |
|--------|-------------|---------|
| `Date` | Transaction date (DD/MM/YYYY or YYYY-MM-DD) | 15/07/2026 |
| `Narration` | Bank description | UPI/1234XXX/John/Ref-abc |
| `Ref No` | Cheque number / UPI ref / transaction ID | CHQ-001234 |
| `Debit` | Outflow amount (empty if credit) | 5000.00 |
| `Credit` | Inflow amount (empty if debit) | |
| `Balance` | Balance after this transaction | 125000.00 |

The user maps these columns via a one-time setup screen per bank account (saved as `bank_csv_column_mapping` table).

#### 19.3.2 Import Steps

1. User uploads CSV file
2. System parses & validates rows (empty rows skipped, date parsed, amounts as numbers)
3. `bank_statement_imports` record created with status `pending_review`
4. `bank_transactions` rows inserted for each valid row
5. Auto-matching runs (see 19.4)
6. UI shows summary: `Matched X / Total Y | Unmatched Z | System Diff: ₹N`
7. The import is **independent** of previous imports — overlapping transactions are deduplicated by the unique constraint (see 19.10.1), and unmatched entries from older imports remain as-is until explicitly re-reconciled

#### 19.3.3 Column Mapping (one-time setup)

```
bank_csv_column_mapping
  id
  bank_account_id          FK → bank_accounts.id
  date_column              string  — column index or name
  narration_column         string
  ref_no_column            string  — nullable
  debit_column             string
  credit_column            string
  balance_column           string  — nullable (optional)
  date_format              string  — DD/MM/YYYY or YYYY-MM-DD
  skip_rows                integer — header rows to skip
  decimal_separator        enum: dot | comma
  created_at
```

### 19.4 Auto-Matching Logic

The system attempts to match each `bank_transactions` row to a system `payments` record or `journal_lines` entry.

#### 19.4.1 Direct Payment Match (highest priority)

Match a bank transaction to `payments` where `method_id` IN (`bank_transfer`, `upi_company`, `card`):

```
IF bank_txn.cr_amount > 0 AND bank_txn.ref_no IS NOT NULL:
  1. Try exact ref_no match:
     → payments.reference_no = bank_txn.ref_no
     AND ABS(payments.amount - bank_txn.cr_amount) <= 1
     → confidence = 1.0, auto-match

  2. Try amount + date proximity match:
     → payments.amount ≈ bank_txn.cr_amount (diff ≤ 1)
     AND ABS(payments.created_at::date - bank_txn.txn_date) <= 3
     → confidence = 0.8, flag for manual review
```

#### 19.4.2 Journal Line Match (for non-payment entries)

For bank outflows (dr_amount > 0) that are not linked to a payment:

```
IF bank_txn.dr_amount > 0:
  Match to journal_lines WHERE ledger_id = bank_account.ledger_id
  AND cr_amount ≈ bank_txn.dr_amount (diff ≤ 1)
  AND entry_date proximity ≤ 3 days
  → confidence = 0.7, flag for manual review
```

#### 19.4.3 Cheque Clearance Match

For cheques, the system tracks the lifecycle separately in `cheque_registry`:

```
IF bank_txn.ref_no matches a cheque number in cheque_registry:
  AND bank_txn.dr_amount ≈ cheque_registry.amount
  → mark cheque as cleared, link bank_txn to the original payment
```

#### 19.4.4 Bulk UPI Settlement Matching

UPI company payments often arrive as a single bulk settlement from the payment gateway (Razorpay/Paytm), not individual transactions:

```
Bulk settlement:
  bank_txn.cr_amount = lump sum (e.g. ₹12,450)
  Narration: "UPI SETTLEMENT — 15 Jul 2026"

  System:
  1. Find all payments where method_id = 'upi_company'
     AND deposited_at IS NULL (or deposited_at BETWEEN settlement_date-1 AND settlement_date)
  2. SUM their amounts = ₹12,450
  3. If sums match → batch-match all those payments
  4. Set deposited_at = txn_date on each matched payment
  5. Link bank_txn to all matched payment IDs via junction table
```

#### 19.4.5 Non-Match Handling

Rows that fail auto-matching remain `unmatched`. The user can:

- **Skip** — leave unmatched (e.g., credit card payment from another system)
- **Flag** — mark as an adjustment to post (bank charges, interest)
- **Manual match** — pick a system payment/ledger from a dropdown
- **Create payment** — for bank inflows that represent an unrecorded customer payment

### 19.5 Cheque Lifecycle (within reconciliation)

Because the user opted for cheque handling as part of bank reconciliation (not a separate sub-system), the cheque lifecycle is lightweight:

#### 19.5.1 cheque_registry

```
cheque_registry
  id
  cheque_no               string
  bank_account_id         FK → bank_accounts.id
  type                    enum: issued (we gave) | received (customer gave)
  amount                  numeric
  drawn_on                date — cheque date
  customer_store_id       nullable FK for received cheques
  supplier_id             nullable FK for issued cheques
  status                  enum: in_hand | deposited | cleared | bounced
  payment_id              nullable FK → payments.id (the payment record)
  deposited_at            timestamptz (nullable)
  cleared_at              timestamptz (nullable — set by reconciliation match)
  bounced_at              timestamptz (nullable)
  bounce_reason           nullable string
  created_at
```

#### 19.5.2 Lifecycle

```
Received Cheque:
  1. Customer pays by cheque → payment recorded with method_id = 'cheque'
     → cheque_registry row created with status = 'in_hand'
     → Customer ledger reduced (payment recorded)
  2. Agent/Manager deposits cheque at bank
     → cheque_registry.status = 'deposited'
  3. Bank statement shows cheque clearance:
     → Auto-match finds ref_no match → status = 'cleared', cleared_at = now
  4. If bank statement shows debit (cheque returned):
     → User flags the returned entry → cheque_registry.status = 'bounced'
     → System auto-creates reversing journal entry:
       Dr  Customer Ledger (store)            ₹amount
           Cr  Bank Account                                ₹amount
       → Outstanding is restored

Issued Cheque (to supplier):
  1. Payment to supplier via cheque → recorded in payments with method_id = 'cheque'
     → cheque_registry row with type = 'issued'
  2. Bank statement shows debit → matched → status = 'cleared'
  3. If not cleared after 30 days — alert shown on dashboard
```

### 19.6 Reconciliation Workflow

#### 19.6.1 Screen: Import Bank Statement

```
┌─────────────────────────────────────────────────────────────┐
│  BANK RECONCILIATION — HDFC Current Account (xxxx1234)       │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  📥 [Import Statement]  (CSV / Excel)                        │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ Period: 01 Jul 2026 — 15 Jul 2026                       │ │
│  │ Statement Balance: ₹2,85,000                            │ │
│  │ System Balance:     ₹2,87,350                           │ │
│  │ Difference:         -₹2,350                             │ │
│  │                                                         │ │
│  │ Unmatched Entries: 3                                    │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
│  RECENT IMPORTS:                                              │
│  ┌──────────┬──────────┬────────┬───────────┬───────────┐    │
│  │ Period   │ Imported │ Total  │ Matched   │ Actions   │    │
│  ├──────────┼──────────┼────────┼───────────┼───────────┤    │
│  │ 1-15 Jul │ 16 Jul   │ 45     │ 42 (93%)  │ [Review]  │    │
│  │ 16-30 Jun│ 1 Jul    │ 52     │ 52 (100%) │ [View]    │    │
│  └──────────┴──────────┴────────┴───────────┴───────────┘    │
└─────────────────────────────────────────────────────────────┘
```

#### 19.6.2 Screen: Review Unmatched Entries

```
┌─────────────────────────────────────────────────────────────┐
│  UNMATCHED ENTRIES — HDFC Current Account                    │
├──────┬───────────┬─────────────┬──────────┬────────┬────────┤
│ Date │ Narration │ Debit       │ Credit   │ Action │ Status │
├──────┼───────────┼─────────────┼──────────┼────────┼────────┤
│ 14   │ Bank      │ ₹500        │ —        │ [Post] │ ⚠️ Flag│
│ Jul  │ Charges   │             │          │        │        │
├──────┼───────────┼─────────────┼──────────┼────────┼────────┤
│ 13   │ UPI Ref   │ —           │ ₹12,450  │ [Match]│ 🔍 Un- │
│ Jul  │ ABC123    │             │          │ ▼      │ matched│
├──────┼───────────┼─────────────┼──────────┼────────┼────────┤
│ 10   │ Chq-0051  │ ₹25,000     │ —        │ [Match]│ 🧾 From │
│ Jul  │           │             │          │ ▼      │ Cheque  │
└──────┴───────────┴─────────────┴──────────┴────────┴────────┘
```

Actions per unmatched row:

| Action | What it does |
|--------|-------------|
| **Post as Adjustment** | Creates a `reconciliation_adjustment` with `status = pending`. User picks journal entry template (bank charges → Dr Bank Charges, Cr Bank; interest → Dr Bank, Cr Interest Income). |
| **Match to Payment** | Opens a search dialog to find a system payment by ID, amount, or customer. |
| **Match to Journal** | Opens a search dialog to find a journal line. |
| **Skip** | Mark as `unmatched` permanently — exclude from diff calculation next time. |
| **Create Payment** | Opens payment form to record this as a new system payment (e.g., customer paid directly). |

#### 19.6.3 Reconciliation Finalization

When the user is satisfied:

1. All unmatched entries are either matched, posted as adjustments, or skipped
2. User clicks **"Finalize Reconciliation"**
3. For each `reconciliation_adjustment` with `status = pending`:
   - System posts a journal entry (Dr/Cr to appropriate ledgers)
   - `adjustment.status` → `posted`
   - `journal_entry_id` set
4. `bank_statement_imports.status` → `reconciled` or `partially_reconciled`
5. `reviewed_by`, `reviewed_at` set

### 19.7 Adjustment Journal Templates

| Adjustment Type | Journal Entry |
|----------------|--------------|
| **Bank Charges** | Dr Bank Charges (Expense), Cr Bank Account |
| **Bank Interest** | Dr Bank Account, Cr Interest Income |
| **Unknown Deposit** | Dr Bank Account, Cr Suspense Account (ledger_type = general, group = Current Liabilities) — user resolves later |
| **Unknown Withdrawal** | Dr Suspense Account, Cr Bank Account |
| **Cheque Bounce** | Dr Customer Ledger (store), Cr Bank Account (reverses original payment) |

### 19.8 Reports

#### 19.8.1 Bank Reconciliation Statement

```
┌─────────────────────────────────────────────────────────────┐
│  BANK RECONCILIATION STATEMENT                               │
│  Account: HDFC Current Account (xxxx1234)                    │
│  As of: 15 Jul 2026                                          │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Balance as per Bank Statement         ₹2,85,000             │
│                                                               │
│  ADD:  Payments recorded in books not yet in bank            │
│    • Cheque issued to Vendor A (Chq-0089)     ₹15,000       │
│    • Cheque issued to Vendor B (Chq-0090)     ₹8,000        │
│                                               ─────         │
│                                               ₹23,000       │
│                                                               │
│  LESS: Deposits in bank not yet in books                     │
│    • UPI payment customer ABC (pending settlement) ₹2,500   │
│    • Bank interest                                ₹350      │
│                                               ─────         │
│                                               -₹2,850       │
│                                                               │
│  Balance as per Books                      ₹3,05,150        │
│                                                               │
│  Reconciled Difference: ₹0 ✓                                │
└─────────────────────────────────────────────────────────────┘
```

#### 19.8.2 Payment Reconciliation Register

```
┌──────────┬──────────┬──────────┬──────────┬──────────┬─────────┐
│ Date     │ Payment  │ Customer │ Amount   │ Bank Txn │ Status  │
│          │ ID       │ / Vendor │          │ Date     │         │
├──────────┼──────────┼──────────┼──────────┼──────────┼─────────┤
│ 13 Jul   │ PAY-045  │ Store A  │ ₹12,450  │ 14 Jul   │ ✅ Matched│
│ 12 Jul   │ PAY-044  │ Store B  │ ₹5,000   │ —        │ ⏳ Pending│
│ 10 Jul   │ PAY-042  │ Vendor X │ ₹25,000  │ —        │ 🧾 Cheque │
└──────────┴──────────┴──────────┴──────────┴──────────┴─────────┘
```

#### 19.8.3 Reconciliation Summary Dashboard Widget

```
┌──────────────────────────────────────────────┐
│  🏦 BANK RECONCILIATION STATUS               │
├──────────────────────────────────────────────┤
│  HDFC Current:    ✅ Reconciled (15 Jul)     │
│  ICICI CC:        ⚠️ 3 unmatched (30 Jun)    │
│  SBI Loan:        🔒 Not due this month      │
└──────────────────────────────────────────────┘
```

### 19.9 Accounting Integration

Every payment recorded with `method_id` in (`bank_transfer`, `upi_company`, `card`, `cheque`) already posts a journal entry crediting the bank ledger (see §9.3.2). The reconciliation process validates that these system entries match reality.

**Timing differences** are normal:

1. **Payment recorded, bank not yet received (uncleared cheque)**
   - System shows bank balance = ₹X (after posting payment as received)
   - Actual bank balance = ₹X + cheque_amount (cheque not yet cleared)
   - Reconciliation statement lists this as an adjustment

2. **Bank received, payment not yet recorded**
   - Customer transferred directly to bank
   - Manager hasn't entered the payment yet
   - Unmatched bank transaction → user creates payment record → matched

3. **Bank charges / interest**
   - Bank statement shows deduction/credit
   - No system record → posted as adjustment journal entry

### 19.10 Edge Cases

#### 19.10.1 Duplicate CSV Import

- `bank_transactions` has a unique constraint on `(bank_account_id, txn_date, ref_no, dr_amount, cr_amount)` for rows with `ref_no`
- For rows without ref_no: `(bank_account_id, txn_date, narration, dr_amount, cr_amount)`
- If a row already exists from a previous import, it's skipped with a warning

#### 19.10.2 Edited/Deleted System Records After Match

- If a `payment` record linked to a matched `bank_transaction` is updated/deleted:
  - The match is broken (bank_transaction.reconciled_status → `unmatched`)
  - An audit note is added
  - Re-match must happen on next reconciliation

#### 19.10.3 Back-Dated Payments

- A payment recorded after the bank statement date won't be in the bank data
- It appears as an outstanding item in the reconciliation statement (added to book balance)
- It will match automatically in the next reconciliation period when the bank statement includes it

#### 19.10.4 Partial Matching

- If a bank transaction amount doesn't exactly match any single payment (e.g., bulk UPI settlement):
  - System attempts sum-of-payments match (19.4.4)
  - If sum doesn't match exactly: user manually splits the match across multiple payments
  - A junction table `bank_txn_payment_matches` supports N:M relationships

```
bank_txn_payment_matches
  bank_transaction_id    FK → bank_transactions.id
  payment_id             FK → payments.id
  amount_applied         numeric (part of the bank_txn amount allocated to this payment)
  matched_by             FK → users.id
  matched_at             timestamptz
```

---

## 20. Deep Dive #5: Job Cards — Plan to Execution

### 20.1 Purpose

The rolling plan (Section 6) produces allocations — what SKUs to run on which day, in what sequence. But operators on the floor need a concrete **run-sheet**: which SKU first, what quantity, on which machine. Job cards bridge this gap.

One job card per shift per stage. It lists all allocations for that shift in planned sequence, and the operator records actuals against each allocation directly on the card.

### 20.2 Data Model

`
job_cards
  id
  plan_day_id             FK → production_plan_days.id
  stage                   int (1 or 2)
  shift_label             string e.g. "Morning" / "Evening" (configurable per factory)
  operator_id             FK → users.id (nullable — assigned or self-claim)
  status                  enum: generated | active | completed | cancelled
  started_at              timestamptz (nullable — when operator starts the shift)
  ended_at                timestamptz (nullable — when operator ends the shift)
  downtime_minutes        int (total unplanned downtime this shift — entered by operator)
  downtime_reason         nullable string
  notes                   nullable string
  generated_at            timestamptz (when the system created this card)
  created_at
`

`
job_card_allocations
  id
  job_card_id             FK → job_cards.id
  plan_allocation_id      FK → production_plan_allocations.id
  sku_item_id             FK → items.id
  seq_index               int (display order within the card)
  planned_qty             int (from the plan allocation)
  planned_hours           decimal (from the plan allocation)
  planned_material_qty    decimal (nullable — FG/intermediate qty only, from BOM immediate children)
  actual_qty              int (nullable — filled by operator)
  actual_hours            decimal (nullable — filled by operator)
  actual_wastage_units    int (nullable — filled by operator)
  actual_downtime_minutes int (nullable — machine downtime during this run)
  status                  enum: pending | running | completed | skipped
  started_at              timestamptz (nullable)
  ended_at                timestamptz (nullable)
`

No job_card_materials table — operator sees only FG/Intermediate qty per the agreed scope.

### 20.3 Generation

At midnight (or when the day locks):

1. System reads production_plan_allocations for the day, ordered by sequence_index
2. If shift config == single shift → one job_cards row for the day
3. If shift config == double shift → split allocations across morning/evening cards (configurable allocation split % or time-based)
4. For each allocation, insert a job_card_allocations row with planned values
5. Status = generated
6. If an operator is pre-assigned in shift roster — set operator_id — otherwise unassigned

`
At 12:00 AM:
  FOR each stage (1,2):
    shift_count = (day's total_hours > single_shift_hours) ? 2 : 1
    IF shift_count == 1:
      INSERT ONE job_card with all allocations
    ELSE:
      SPLIT allocations: morning half, evening half
      INSERT TWO job_cards
`

### 20.4 Operator Workflow

`
┌─────────────────────────────────────────────────────────────┐
│  🏭 JOB CARD — Stage 1 (Blowing)                           │
│  Shift: Morning (6:00 AM – 2:00 PM)     📅 17 Jul 2026      │
│  Operator: [ Select ▼ ] or Assigned: Raj                   │
│                                                              │
│  ┌──┬────────────┬───────┬────────┬──────┬────────┬──────┐  │
│  │ #│ SKU        │ Plan  │ Actual │ Waste│ Time   │ Done │  │
│  ├──┼────────────┼───────┼────────┼──────┼────────┼──────┤  │
│  │ 1│ 500ml Bott │12,600 │ —      │ —    │ 7h→   │ ⏳   │  │
│  │ 2│ 1L Bottle  │ 1,800 │ —      │ —    │ 1h→   │ ⏳   │  │
│  └──┴────────────┴───────┴────────┴──────┴────────┴──────┘  │
│                                                              │
│  [▶ Start Shift]  [⏸ End Run #1]  [⏹ End Shift]           │
│                                                              │
│  Total Downtime: [ 30 ] min   Reason: [ Power cut ▼ ]       │
│                                                              │
│  ℹ Material Requirements (from BOM, immediate children):    │
│    • Run #1: 12,600 × 500ml Preforms                        │
│    • Run #2: 1,800 × 1L Preforms                            │
└─────────────────────────────────────────────────────────────┘
`

Flow:
1. Operator views today's job card(s) — unfilled, status generated
2. Clicks **"Claim"** (if unassigned) or assigned automatically
3. Clicks **"Start Shift"** → job_cards.status = active, started_at = now
4. For each allocation in sequence:
   - Clicks **"Start Run"** → allocation.status = unning, started_at = now
   - Runs production
   - Clicks **"End Run"** → enters actual_qty, actual_wastage, actual_hours (auto-calculated from start/end time, editable), actual_downtime
   - allocation.status = completed
5. After all runs done → **"End Shift"** → job_cards.status = completed, nded_at = now
6. Operator can pause between runs (lunch, break) — downtime accumulated

### 20.5 EOD Integration

The EOD form (Section 16.1) pre-fills from job card actuals:

| EOD Field | Source |
|-----------|--------|
| Stage 1: preforms_used | SUM of job_card_allocations.actual_qty (each run's actual output) |
| Stage 1: bottles_produced | SUM of job_card_allocations.actual_qty |
| Stage 1: wastage_units | SUM of job_card_allocations.actual_wastage_units |
| Stage 2: bottles_filled (per SKU) | job_card_allocations.actual_qty grouped by sku_item_id |
| Stage 2: caps_used | computed from bottles_filled + wastage |
| Downtime (total) | SUM of downtime_minutes across cards |

The operator does **not** re-enter the data — job cards are the source of truth for the shift's actuals. The EOD form becomes a review + supplement step (add closing stock, manual adjustments).

If the EOD form is submitted without job cards (e.g., manager bypass), the old free-form entry path remains available as a fallback.

### 20.6 Double Shift Handling

`
┌──────────────────────────────────────────────────────┐
│ Shifts for 17 Jul 2026 — Stage 2 (Filling)           │
├──────────────────────────────────────────────────────┤
│                                                       │
│  ☀️ MORNING (6AM-2PM) — Operator: Raj               │
│  ┌────┬──────────┬────────┬────────┬────────────────┐ │
│  │ #  │ SKU      │ Plan   │ Actual │ Status         │ │
│  ├────┼──────────┼────────┼────────┼────────────────┤ │
│  │ 1  │ 500ml    │ 10,000 │ 9,800  │ ✅ Completed    │ │
│  │ 2  │ 1L       │ 2,000  │ 2,000  │ ✅ Completed    │ │
│  └────┴──────────┴────────┴────────┴────────────────┘ │
│                                                       │
│  🌙 EVENING (2PM-10PM) — Operator: Suresh            │
│  ┌────┬──────────┬────────┬────────┬────────────────┐ │
│  │ #  │ SKU      │ Plan   │ Actual │ Status         │ │
│  ├────┼──────────┼────────┼────────┼────────────────┤ │
│  │ 3  │ 2L       │ 1,500  │ —      │ ▶ Running      │ │
│  │ 4  │ 500ml    │ 8,000  │ —      │ ⏳ Pending     │ │
│  └────┴──────────┴────────┴────────┴────────────────┘ │
└──────────────────────────────────────────────────────┘
`

### 20.7 Permissions

| Role | Job Card Actions |
|------|-----------------|
| **Operator** | View assigned cards, claim unassigned, start/end shift, fill actuals |
| **Manager** | View all cards, reassign operator, override actuals, cancel card, bypass to free-form EOD |
| **Admin** | Same as manager |
| **Others** | Read-only (production dashboard) |

### 20.8 Edge Cases

#### 20.8.1 Shift Not Started

If no operator claims/opens the job card by end of day:
- The card remains generated — EOD form falls back to free-form entry
- Manager gets a notification at 8 PM: "Stage 1 job card not started — enter EOD manually"
- Next day's plan recalculation uses actual EOD data, not job card data

#### 20.8.2 Partial Completion

Operator runs 3 of 5 allocations and leaves (end of shift, machine breakdown):
- Remaining allocations stay pending
- Manager can assign leftover allocations to the next shift's card
- EOD form shows partial actuals from job card + requires manual entry for the gap

#### 20.8.3 Downtime Recording

Two levels:
- **Run-level**: downtime_minutes on job_card_allocations — machine stopped during a specific run
- **Shift-level**: downtime_minutes on job_cards — changeover waiting, material shortage, power cut affecting whole shift

The manager's production report (Section 15.2) breaks down:
- Planned uptime vs actual uptime = SUM(planned_hours) − SUM(actual_downtime)
- Overall Equipment Effectiveness (OEE) = (actual_qty / planned_qty) × (uptime / planned_hours)

#### 20.8.4 Reassigning Mid-Shift

If Operator A falls sick mid-shift:
- Manager clicks **"Reassign"** → sets operator_id to Operator B
- A's work so far is preserved (allocation completed statuses remain)
- B continues on the remaining pending allocations
- A's card shows nded_at = reassign time

#### 20.8.5 Plan Changes After Generation

If a plan allocation changes after job cards are generated (manager override unlocks Day-0):
- All affected job_card_allocations get a warning badge: ⚠️ "Plan changed"
- Operator sees updated planned_qty/planned_hours
- Operator confirms with ✅ "Acknowledge" button
- Unacknowledged changes highlighted in manager's dashboard
