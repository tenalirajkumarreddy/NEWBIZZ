# Business Management System — Master Build Plan (v1)

**Date:** 2026-07-17
**Business:** Water-bottle manufacturing + retail/wholesale distribution (South India)
**Stack:** Next.js (App Router) + Supabase (PostgreSQL, Auth, RLS, Storage, Realtime, Edge Functions) + PWA
**Status:** Authoritative build plan. Supersedes `2026-07-16-business-management-system-design.md` wherever they conflict.

---

## 0. How to Use This Document

This is a **build-ready master plan** written to be handed, section by section, to an AI coding assistant (or a solo developer). It folds in:
- the original design spec (`2026-07-16-business-management-system-design.md`),
- every correction from the audit (`2026-07-17-design-spec-audit.md`), and
- every missing module from the completeness map (`2026-07-17-missing-modules-completeness.md`),

**except** the four items you chose to exclude (see §0.3).

### 0.1 Reading order
1. **§1 Core Architecture & Invariants** — read first and keep open. Every module obeys these rules. Most of the audit's critical issues are resolved here, once, globally.
2. **§2 Roles & Permissions** — the authorization model all modules reference.
3. **§3–§7 Phases 0–4** — the modules, in build order. Each module uses a fixed template (§0.4).
4. **§8 Consolidated Data Dictionary** — every table in one place.
5. **§9 Build Order & Dependencies** — the solo/AI sequencing.
6. **§10 Traceability Matrix** — proves every audit finding + missing module is addressed (or excluded).

### 0.2 How each phase maps to value
- **Phase 0 — Foundation:** you can *set the system up* (company, users, security, data migration). Ships nothing customer-visible but unblocks everything.
- **Phase 1 — Sell & Collect:** the system can take an order, deliver, invoice, collect cash, and track who owes what. First *usable* product.
- **Phase 2 — Accounting & Purchasing:** books close correctly; you buy materials and run GST.
- **Phase 3 — Manufacturing:** you plan and record production, cost it, and value inventory.
- **Phase 4 — Field Force & Growth:** routes, CRM, schemes, banking, payroll, messaging.

Each phase is **independently shippable** and useful on its own.

### 0.3 Scope exclusions (explicitly NOT built)
Per your decision, these are out of scope. Recorded here so no downstream module assumes them.

| Code | Excluded item | Consequence to honor in the build |
|------|---------------|-----------------------------------|
| **A1** | Returnable jar / deposit tracking | 20L jars are modeled as ordinary finished goods. No empties ledger, no deposit accounting. If added later it is a new module — do **not** stub it into stock. |
| **A2** | Quality control / lab testing | Batches have **no QC hold/release gate**. A produced batch is immediately sellable. Batch codes still exist for traceability only. |
| **B5** | Quotation / Proforma | Orders are created directly; there is no quote→order conversion step. |
| **C4** | TDS / TCS | No withholding/collection-at-source logic. Vendor/customer payments post at gross. |

Everything else from all three source documents **is** in scope.

### 0.4 Module template
Every module in §3–§7 uses this structure, so an AI builder gets a consistent contract:

- **Purpose** — what it does and why it exists.
- **Depends on** — modules/tables that must exist first.
- **Entities** — tables with columns, types, FKs, constraints (build-ready).
- **Workflows** — step-by-step, naming the server RPC (§1.4) that does the writing.
- **Accounting impact** — exact journal templates (if any).
- **Permissions** — who can do what (references §2).
- **UI surfaces** — screens/components to build.
- **Acceptance criteria** — testable statements that define "done."
- **Edge cases** — the tricky states to handle.

### 0.5 Source-of-truth note
Where this plan and the original design spec disagree, **this plan wins**. The original spec remains useful for screen mockups and prose, but the data model, accounting rules, and invariants here are authoritative.

### 0.6 Glossary (shared vocabulary)
| Term | Meaning |
|------|---------|
| **Store** | A customer's individual outlet with its own GSTIN, ledger, outstanding, delivery address. Billing entity. |
| **Customer** | Parent account owning one or more stores; holds login credentials. |
| **Holding** | Cash or stock physically in a user's custody, awaiting handover up the chain. |
| **Handover / Transfer** | An accept/reject movement of cash or stock between two custodians. |
| **Journal entry / line** | A balanced double-entry accounting record; the single source of truth for money & stock value. |
| **Read-model** | A cached, rebuildable projection of journal data for fast reads (e.g., customer outstanding). Never authoritative. |
| **RPC** | A server-side Postgres function / Edge Function that performs a multi-row change inside one transaction. Clients never write money/stock tables directly. |
| **WA** | Weighted-average cost per item (global, company-wide). |
| **BOM** | Bill of Materials — the recipe tree for a manufactured item. |
| **AVL** | Approved Vendor List — which suppliers may supply an item, at what price. |
| **FY** | Financial Year (India: 1 Apr – 31 Mar). |
| **Official / Unofficial sale** | Official = full GST invoice, appears in GST returns. Unofficial = non-GST receipt, internal books only. (See §1.9 compliance note.) |
| **Challan** | Delivery note carried with goods; precedes the tax invoice. |
| **EOD** | End-of-day production recording. |
| **WIP** | Work in progress — empty bottles held between Stage 1 (blowing) and Stage 2 (filling). |

---

## 1. Core Architecture & Invariants

> These rules are global. Every module in this document assumes them. They resolve, in one place, the critical correctness issues raised in the audit. If a module description ever seems to conflict with §1, §1 wins.

### 1.1 The Nine Invariants (print these on the wall)

1. **`journal_lines` is the only source of truth for money and stock *value*.** Every rupee that exists is a balanced pair of debit/credit lines. (Audit 2.1)
2. **`stock` (quantity per warehouse) and `user_stock_holdings` are the source of truth for physical stock *quantity*.** Value lives in journals + `item_costs`; quantity lives here. The two are linked only through posting RPCs.
3. **All money/stock mutations go through a server RPC (§1.4).** Clients never `INSERT`/`UPDATE` `journal_lines`, `stock`, holdings, `item_costs`, ledgers, or balances directly. RLS forbids it.
4. **Every RPC is one database transaction.** Either the whole operation commits or nothing does. (Audit 3.4)
5. **Cached balances are read-models (§1.5), never authoritative.** They are rebuildable from journals at any time, and a nightly job asserts they match. (Audit 2.1)
6. **Audited entries are immutable.** Corrections are reversing entries, never edits. (Original spec — kept.)
7. **Every money/stock mutation and every approval writes to `audit_log`.** Not just BOM changes. (Audit 3.6 / F2)
8. **Number series (invoice/order/journal/etc.) are gap-free per FY and allocated under a row lock.** (Audit 3.8)
9. **All timestamps are stored UTC; all business-day logic uses Asia/Kolkata.** "Midnight," "today," "EOD" mean IST. (Audit 3.8)

### 1.2 System layers

```
┌────────────────────────────────────────────────────────────┐
│  CLIENT (Next.js App Router, PWA)                            │
│   • Server Components for reads (query read-models + views)  │
│   • Calls RPCs for every write that touches money/stock      │
│   • React Query for client cache; Supabase Realtime for push │
└───────────────┬────────────────────────────────────────────┘
                │  supabase.rpc('fn', args)   (never raw writes)
┌───────────────▼────────────────────────────────────────────┐
│  SERVER LOGIC (Postgres functions + Edge Functions)          │
│   • Each is ONE transaction (BEGIN…COMMIT)                   │
│   • Validates, posts journals, moves stock, writes audit_log │
│   • Holds advisory locks (plan recalc, number series)        │
└───────────────┬────────────────────────────────────────────┘
┌───────────────▼────────────────────────────────────────────┐
│  DATA (PostgreSQL)                                           │
│   • Authoritative tables (journal_lines, stock, holdings)    │
│   • Read-models (materialized views / trigger-maintained)    │
│   • RLS = authorization only (who may call/read what)        │
└──────────────────────────────────────────────────────────────┘
```

**Key correction vs original spec:** the original stack listed only "Supabase + RLS + Server Components." RLS is *authorization*, not a transaction boundary. The **SERVER LOGIC layer is mandatory** and is where every atomic operation lives.

### 1.3 What is authoritative vs derived

| Concern | Authoritative source | Derived read-model(s) |
|---------|----------------------|------------------------|
| Customer outstanding | journal_lines under the store's ledger | `customer_ledger` (running balance) |
| User cash holding | journal_lines under the user's cash ledger | `user_cash_holdings.amount` |
| User stock holding | posting RPCs → `user_stock_holdings` (qty) | dashboard aggregates |
| Warehouse stock qty | posting RPCs → `stock` | stock summary views |
| Inventory value / WA | journal_lines + `item_costs` | costing reports |
| Vendor outstanding | journal_lines under supplier ledger | vendor ledger view |
| P&L / Balance Sheet / TB | journal_lines + `fy_opening_balances` | report views (live) |

Rule of thumb: **if a number involves money, compute it from journals for correctness-critical paths (statements, filings) and read the cache for fast UI, with a reconciliation job proving they agree (§1.6).**

### 1.4 The RPC catalog (server-side transactions)

Every operation below is a single transactional server function. This list is the contract; modules reference these by name.

| RPC | Does | Module |
|-----|------|--------|
| `post_journal(entry, lines[])` | Validates Dr=Cr, posts entry + lines, writes audit_log. All other RPCs call this. | Accounting |
| `record_sale(order_id, delivered_lines[], payments[], is_official)` | Deducts stock (from user holding or WH), posts sale + COGS + tax journals, records payments, updates order/challan state, generates invoice no. | Sales |
| `record_payment(store_id, method, amount, ref, collected_by, sale_id?)` | Posts payment journal to the method's destination ledger (§1.7), updates customer_ledger read-model. | Payments |
| `create_transfer` / `respond_transfer(id, accept)` | Creates a pending transfer; on accept moves cash/stock atomically + posts journal; on reject no-op. | Handover |
| `approve_expense(id)` / `approve_purchase(id)` / `approve_debit_note(id)` | Posts the approval journal, moves holdings, writes audit_log. | Accounting/Purchasing |
| `post_production_eod(plan_day_id, stage1{}, stage2{})` | Consumes RM/WIP, produces FG at WA, posts wastage, updates stock + item_costs, marks day completed, enqueues recalc. | Production |
| `recalculate_plan(plan_id)` | Runs the rolling algorithm under `production_plan_recalc_lock`. | Production |
| `finalize_reconciliation(import_id)` | Posts all pending adjustment journals, marks import reconciled. | Banking |
| `run_fy_rollover(fy_id)` | Posts closing entry, seeds opening balances, locks FY. | Accounting |
| `allocate_number(series_code, fy_id)` | Row-locks the series row, returns next gap-free number. Called inside other RPCs. | Platform |
| `post_scheme_credit_note(eligibility_id)` | Posts rebate credit note (+ GST reversal if official). | Schemes |
| `post_stock_adjustment(warehouse_id, lines[], reason)` | Adjusts stock qty + value, posts journal, audit_log. | Inventory |

**RLS policy pattern:** authoritative tables (`journal_lines`, `stock`, holdings, `item_costs`, ledger read-models) have **no client write policy at all**. They are writable only by `SECURITY DEFINER` RPCs owned by a privileged role. Clients get `SELECT` per role scope.

### 1.5 Read-models: how caches are kept honest

Each cached balance table is maintained by the **same RPC** that posts the journal (in the same transaction), so it can never diverge within a transaction. To catch drift from bugs or manual DB surgery:

- **Rebuild function** per read-model: `rebuild_customer_ledger()`, `rebuild_user_holdings()`, `rebuild_item_costs()` — recompute purely from journals/postings.
- **Nightly `assert_read_models()` job** compares each cache row to its journal-computed value; any mismatch raises an alert and is logged. (This is the safety net the original "no caches" claim tried and failed to provide.)

### 1.6 Reconciliation & consistency jobs (scheduled)
| Job | Frequency | Asserts |
|-----|-----------|---------|
| `assert_read_models()` | Nightly | caches == journal-computed |
| `assert_stock_balances()` | Nightly | Σ(warehouse stock + user holdings + in-transit) == Σ(inbound − outbound) |
| `assert_trial_balance()` | Nightly | Σ dr == Σ cr across all open-FY journal lines |
| `stale_transfer_sweep()` | Hourly | flags pending transfers older than N hours (escalation) |
| `license_expiry_scan()` | Daily | licenses nearing expiry → notify (Phase 3, §6) |

### 1.7 Payment-method → destination-ledger map (fixes audit 2.2)

The destination ledger is a **property of the payment method**, not hard-coded to "user cash." `record_payment` looks this up.

| `payment_methods.code` | Money goes to | Collection journal (Dr → Cr) |
|------------------------|---------------|------------------------------|
| `cash` | Collector's cash holding | Dr User Cash in Hand (collector) · Cr Customer Ledger (store) |
| `upi_agent` | Collector's cash holding (their responsibility) | Dr User Cash in Hand (collector) · Cr Customer Ledger (store) |
| `upi_company` | Company bank (gateway) directly | Dr Bank (clearing/gateway) · Cr Customer Ledger (store) |
| `card` | Company bank directly | Dr Bank (clearing) · Cr Customer Ledger (store) |
| `bank_transfer` | Company bank directly | Dr Bank Account · Cr Customer Ledger (store) |
| `cheque` | Cheque registry (unrealized) — NOT cash holding | Dr Cheques-in-Hand (asset) · Cr Customer Ledger (store); on clearing: Dr Bank · Cr Cheques-in-Hand |
| `advance` | Advance from customer (no linked sale) | Dr [cash/bank per sub-method] · Cr Customer Advances (liability) |

Two corrections vs original spec: (a) card/company-UPI/bank-transfer must **not** inflate a user's cash holding — they go to bank; (b) cheques sit in a **Cheques-in-Hand** asset ledger until cleared and are never added to `user_cash_holdings` (fixes audit 3.8).

### 1.8 Number series (fixes audit 3.8)

```
number_series
  id, series_code (invoice_official|invoice_unofficial|order|challan|journal|
                   credit_note|debit_note|purchase|payment|grn|voucher),
  fy_id FK, prefix (configurable per §Settings), next_value int, padding int,
  UNIQUE(series_code, fy_id)
```
`allocate_number(series_code, fy_id)` does `SELECT … FOR UPDATE` on the row, returns and increments `next_value` inside the caller's transaction → gap-free even under concurrency. Statutory invoice numbers therefore never skip or duplicate. Series reset each FY at rollover.

### 1.9 GST correctness rules (fixes audit 2.3, 3.3)

- **Place of supply drives tax type.** Company has a home state (Settings §3.1). Compare company state code with the store's GSTIN state code (first 2 digits):
  - same state → **CGST + SGST**
  - different state → **IGST**
  - store has no GSTIN (B2C unregistered) → intrastate CGST+SGST by default; place-of-supply captured for B2C-large (invoice > ₹2.5L interstate).
- **Sales returns reverse tax.** A return of an official sale reverses output tax and taxable value proportionally (never lumps the gross into Sales). Template in §5 Sales module.
- **E-invoice applicability:** configurable turnover trigger in Settings (currently ₹5 Cr AATO). Only official B2B ≥ threshold require IRN. System flags, user uploads JSON to IRP, enters IRN back.
- **E-way bill threshold:** configurable (default ₹50,000 consignment value). System computes required fields; user generates on portal, enters number.
- **Rounding:** per-invoice rounding to nearest rupee posts the difference to a **Round-Off** ledger (income/expense). Tax computed per line then summed, half-up to 2 decimals, then invoice total rounded to 0 decimals.
- **GSTIN format validation** on customer_store and supplier save (15-char checksum).

### 1.10 Rounding, currency, UOM (fixes audit 2.8, 3.8)

- **Currency:** INR only. Money stored `numeric(14,2)`. Drop `item_suppliers.currency` (no multi-currency). (Audit 3.8)
- **Quantity:** `numeric(14,3)`. WA cost `numeric(14,4)`.
- **UOM model:** each item has `stock_uom` (base). `item_uom_conversions(item_id, from_uom, to_uom, factor)` converts purchase UOM (e.g., "roll", "bag") and consumption UOM (e.g., "gram", "piece") to base. Purchases, BOM lines, and EOD entries all convert to base before touching `stock`. (Resolves "preforms in bags", "shrink in grams vs rolls".)

### 1.11 Universal audit log (fixes audit 3.6 / F2)

```
audit_log
  id, actor_user_id, action (create|update|delete|approve|reject|reverse|login|config_change),
  entity_table, entity_id, before_json (nullable), after_json (nullable),
  reason (nullable — required for adjustments/back-dating/reversals),
  ip, user_agent, created_at (UTC)
```
Written **inside** every mutating RPC. Non-negotiable for: sales, payments, transfers, expense/purchase/scheme/adjustment approvals, back-dated entries, balance rebuilds, config changes, user role changes, license edits. Read-only to admin/manager in UI; never editable.

### 1.12 Concurrency primitives
- **Advisory locks:** `production_plan_recalc_lock` (plan recalculation, §6), number-series row lock (§1.8).
- **Coalescing:** if a recalc trigger fires while one is running, queue-behind-once (run a single recalc after the last trigger), never stack.
- **Optimistic concurrency:** editable business docs (orders before approval, EOD drafts) carry `version int`; RPC rejects a stale write.

### 1.13 Non-functional requirements (fixes audit 3.6 / F1,F3,F4,F5)
- **Environments:** dev → staging → prod, separate Supabase projects. Migrations via Supabase CLI, versioned in repo, forward-only.
- **Backup & DR:** Supabase daily automated backups + weekly logical dump to cold storage; documented restore runbook; RPO ≤ 24h, RTO ≤ 4h. **Statutory retention: 8 years** for financial/GST records (no hard-delete of journals, invoices, returns).
- **Security:** MFA required for admin & manager; password policy; short-lived sessions; Supabase Storage buckets private with signed URLs; PII (phone, GSTIN, employee data) access-scoped by RLS; DPDP Act 2023 — consent notice, data-access/erasure process (erasure blocked where statute requires retention).
- **Observability:** structured logs, error tracking (e.g., Sentry), uptime + job-failure alerts, RPC latency metrics.
- **Testing strategy:** unit tests for pure logic; **golden/property tests for the accounting engine, WA costing, plan recalculation, and bank reconciliation** (these are the correctness-critical engines); seed-data integration tests per RPC; the nightly assert-jobs (§1.6) double as production invariants.
- **Performance:** index `journal_lines(ledger_id, entry_date)`, `stock(item_id, warehouse_id)`, `orders(status, created_at)`; heavy statements (TB/P&L/BS) served from nightly-materialized snapshots + live delta since snapshot for large data.

---

## 2. Roles & Permissions (referenced by all modules)

### 2.1 Roles
`admin`, `manager`, `operator`, `agent`, `sales`, `marketer`, `customer`. Holdings summary:

| Role | Stock holding | Cash holding | Core capability |
|------|---------------|--------------|-----------------|
| Admin | No | No (sees/adjusts all) | Full access + configuration |
| Manager | No | Yes | Operations + all approvals + balance adjust |
| Operator | No (manages WH) | Yes (walk-in cash) | WH stock, walk-in sales, EOD, WH↔user transfer |
| Agent | Yes (delivery stock) | Yes (collections) | Fulfil orders, collect payments, routes |
| Sales | Maybe | Yes | Create orders, record sale/payment |
| Marketer | No | Yes (if collects) | Create orders, CRM; no stock |
| Customer | No | No (ledger only) | Portal: own stores only |

### 2.2 Permission model (fixes audit B6 → generic engine)
Rather than hard-coding per module, permissions are a **capability matrix** plus **amount-based approval limits**:
```
permissions            (role, capability_code, scope)     scope: all|own|warehouse|store|none
approval_policies      (document_type, role, max_amount)  e.g. manager may approve expense ≤ ₹50,000
permission_overrides   (user_id, capability_code, scope)  per-user grant/revoke on top of role
```
`capability_code` examples: `order.create`, `order.approve`, `order.edit_any`, `sale.record`, `payment.record`, `stock.transfer`, `cash.transfer`, `balance.adjust`, `expense.approve`, `scheme.approve`, `purchase.approve`, `production.eod`, `report.view_all`, `config.edit`, `user.manage`. The UI reads this matrix; RPCs enforce it server-side (never trust the client).

### 2.3 Baseline matrix (seed data)
This is the seed; admin can adjust via §3.2 later.

| Capability | Admin | Manager | Operator | Agent | Sales | Marketer | Customer |
|------------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| order.create | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓(own store) |
| order.approve | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| order.edit_any | ✓ | ✓ | ✗ | own | own | own | ✗ |
| sale.record | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| payment.record | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | online only |
| stock.transfer | ✓ | ✓ | WH↔users | anyone | anyone | ✗ | ✗ |
| cash.transfer | ✓ | ✓ | anyone | anyone | anyone | anyone | ✗ |
| balance.adjust | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| expense.approve | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| scheme.approve | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| purchase.approve | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| production.eod | ✓ | edit | enter | ✗ | ✗ | ✗ | ✗ |
| config.edit | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| report.view | all | all | limited | own | own | CRM | own store |

---

## 3. PHASE 0 — Foundation & Platform

> Goal: the system can be configured, secured, and loaded with opening data. Nothing customer-facing ships, but every later phase depends on this. **Build this first and completely.**

### 3.1 Module: Company & System Settings  (was missing — B1)

**Purpose.** The single configuration surface that makes the app usable at all: company identity, tax setup, financial year, number series, and operational defaults. Without it nothing can be set up.

**Depends on.** Nothing (first module).

**Entities.**
```
company_profile (singleton row)
  id, legal_name, trade_name, gstin, home_state_code (2-digit — drives IGST logic §1.9),
  pan, address, city, pincode, phone, email, logo_url,
  fssai_license_no, bis_license_no,           -- displayed on invoices
  bank_account_default_id (nullable FK),
  einvoice_threshold numeric (default 50000000),  -- ₹5 Cr AATO
  eway_threshold numeric (default 50000),
  rounding_mode enum (nearest|up|down) default nearest,
  created_at, updated_at

tax_rates
  id, name, hsn_code, gst_rate numeric, cess_rate numeric default 0, is_active

fy_periods                       -- (also used by Accounting §5)
  id, fy_label (e.g. "2026-27"), start_date, end_date, is_locked, locked_at

number_series                    -- see §1.8
  id, series_code, fy_id, prefix, next_value, padding, UNIQUE(series_code, fy_id)

app_settings (key-value, typed)
  key, value_json, description
  -- e.g. shift_hours_single=8, shift_hours_double=16, changeover_minutes_s1=30,
  --      stale_transfer_hours=24, default_credit_days=30, reorder_scan_time="18:00",
  --      timezone="Asia/Kolkata" (fixed), languages_enabled=["en"]
```

**Workflows.**
1. First-run setup wizard: company profile → home state → first FY → seed number series → tax rates → default warehouse → admin user. Guard the rest of the app behind "setup complete."
2. Editing `home_state_code` after go-live is locked (warn: changes all future tax logic) — requires admin + reason → audit_log.

**Permissions.** `config.edit` (admin only).

**UI surfaces.** Setup wizard; Settings area with tabs (Company, Tax, Financial Year, Number Series, Operational Defaults, Languages).

**Acceptance criteria.**
- App refuses to enter Phase-1 features until setup wizard completes.
- Changing GST/company fields is audited.
- Invoice preview renders company identity + FSSAI/BIS numbers from this module.

**Edge cases.** Multiple FYs open simultaneously blocked (only one unlocked at a time except during rollover window). Logo upload → private bucket, rendered via signed URL.

### 3.2 Module: User & Access Management  (was missing — B2)

**Purpose.** Manage the humans: invite, assign roles, deactivate, reset, enforce MFA, and tune the permission matrix (§2.2).

**Depends on.** Settings (§3.1), Supabase Auth.

**Entities.**
```
users (profiles; 1:1 with auth.users)
  id, auth_uid, role, name, phone, email, is_active,
  mfa_enrolled bool, must_reset bool, last_login_at, created_at, deactivated_at

permissions / approval_policies / permission_overrides   -- see §2.2
user_pay_config                                          -- (used by Payroll §7); defined here for user setup
  user_id, pay_type (daily|monthly), single_rate, double_rate, ot_rate, monthly_salary
```

**Workflows.**
1. Admin invites user (email) → Supabase Auth invite → user sets password + enrols MFA (admin/manager mandatory).
2. Assign role → seeds capabilities from baseline (§2.3); optional per-user overrides.
3. Deactivate → `is_active=false`, sessions revoked, holdings must be zero or transferred first (block otherwise) → audit_log.
4. Role/permission change → audit_log with before/after.

**Permissions.** `user.manage` (admin; manager may invite non-privileged roles up to policy).

**UI surfaces.** Users list, invite dialog, role editor, permission-matrix editor, approval-limits editor, "my profile / security" (self-service MFA + password).

**Acceptance criteria.**
- Cannot deactivate a user holding cash/stock (must hand over first).
- Admin/manager without MFA cannot access privileged screens.
- All role/permission edits appear in audit_log.

**Edge cases.** Last remaining admin cannot be deactivated. Customer users are provisioned by the Portal module (§5), not here.

### 3.3 Module: Audit Log & Activity  (was missing — F2)

**Purpose.** The universal, immutable trail (§1.11). Built early so every later RPC can write to it from day one.

**Depends on.** Users (§3.2).

**Entities.** `audit_log` (schema in §1.11).

**Workflows.** Passive — populated by RPCs. Provides a viewer with filters (actor, entity, date, action) and per-record "history" panels embedded in other modules.

**Permissions.** View: admin (all), manager (operational subset). Never editable/deletable by anyone.

**Acceptance criteria.** Attempting to `UPDATE`/`DELETE` `audit_log` fails (revoked at DB level). Every §1.4 RPC writes at least one row.

### 3.4 Module: Data Migration & Opening Balances  (was missing — C2)

**Purpose.** Get the business *into* the system on day one: existing customers/stores, suppliers, items, current stock + WA cost, ledger opening balances, outstanding invoices. Without this, go-live is impossible.

**Depends on.** Settings, Users, and the target tables of Phases 1–2 (so this is *finished* at the Phase-1/2 boundary, but designed now).

**Entities.**
```
migration_batches
  id, entity_type (customer|store|supplier|item|stock|ledger_opening|open_invoice),
  filename, row_count, status (staged|validated|committed|failed), created_by, created_at
migration_rows
  id, batch_id, raw_json, parsed_json, validation_errors_json, status (ok|error|committed)
```

**Workflows.**
1. Download CSV template per entity type.
2. Upload → staged in `migration_rows` → validation (types, FKs, GSTIN format, dup checks).
3. Preview + fix errors → **Commit** runs the appropriate RPC:
   - Opening stock → `post_stock_adjustment` variant tagged `reference_type='opening'` at supplied WA (sets `item_costs`).
   - Ledger opening balances → `fy_opening_balances` rows (Asset/Liability/Equity only).
   - Open invoices → create historical sale + customer_ledger opening + journal `reference_type='opening'`.
4. Everything posted as `opening` reference type so it's distinguishable and auditable.

**Permissions.** Admin only. Locked once first live transaction is posted in an FY (warn + reason to reopen).

**Acceptance criteria.**
- After commit, Trial Balance balances (Σdr=Σcr) including openings.
- Stock summary equals uploaded opening quantities; `item_costs` equals uploaded WA.
- Re-running a committed batch is blocked (idempotent guard).

**Edge cases.** Partial commit not allowed — a batch commits fully in one transaction or fails. Opening invoices must reference an opening customer balance, not double-count.

### 3.5 Foundation cross-cutting deliverables
Built once in Phase 0, consumed everywhere:
- **RPC + audit_log scaffolding** (§1.4, §1.11) and the `post_journal` primitive (even before Accounting UI exists).
- **Number-series allocator** (§1.8).
- **Nightly assert-jobs** wired (§1.6) — they no-op until data exists.
- **Notification service** (in-app + email) skeleton (§7 extends channels).
- **i18n scaffold** — English only enabled at launch; keys externalized so Tamil/Telugu/Kannada/Malayalam add later without code change (fixes audit 5.4).
- **Environments, migrations, backups, error tracking** (§1.13).

**Phase 0 exit criteria.** Admin can configure the company, invite an MFA-secured user, see an empty audited system, and load opening data that produces a balanced Trial Balance.

---

## 4. PHASE 1 — Sell & Collect (Core Commerce)

> Goal: the first *usable* product. Create an order → deliver on a challan → record the sale/invoice (official or unofficial, correct GST) → collect payment (correct per-method accounting) → know every store's outstanding and every user's holding. Everything here obeys §1.

### 4.1 Module: Item Master & UOM

**Purpose.** The unified catalog of everything the business touches — raw materials, intermediates, finished goods — with tax, packaging, and unit-conversion attributes. One table replaces "products" + "raw materials." (Original spec kept; UOM model added per §1.10.)

**Depends on.** Settings (tax rates), Warehouses (below).

**Entities.**
```
items
  id, sku_code (unique), name, description,
  type enum(raw_material|intermediate|finished_good),
  category_id FK item_categories,
  stock_uom text,                              -- base UOM (§1.10)
  bottles_per_case int null,                   -- finished goods only
  hsn_code, tax_rate_id FK tax_rates,
  barcode, status enum(active|inactive|discontinued), created_at
  -- NOTE: is_raw_material boolean REMOVED (redundant with type; audit 2.7)

item_categories
  id, name, description
item_uom_conversions                            -- (§1.10) fixes bags/rolls/grams
  id, item_id FK, from_uom, to_uom, factor numeric   -- e.g. 1 bag = 500 pieces
warehouses
  id, name, address, type enum(factory|godown), status
stock                                           -- authoritative qty (§1.2)
  id, warehouse_id FK, item_id FK, batch_no null, quantity numeric(14,3)
item_costs                                      -- WA value read-model (§1.2)
  item_id FK (pk), quantity numeric(14,3), total_value numeric(14,2), updated_at
```

**Workflows.** CRUD items; define conversions; barcode assignment. Deactivation blocked if item is a child in any active BOM line (audit-consistent with §6). 

**Permissions.** admin/manager/procurement edit; others read.

**Acceptance criteria.** Every stock/consumption path converts to `stock_uom` before writing `stock`. Cannot save FG without `bottles_per_case`. SKU/barcode unique.

**Edge cases.** Intermediate items (empty bottles) are stockable and valued (WIP handled in §6). Discontinued items remain in history/reports.

### 4.2 Module: Pricing / Rate Master  (was missing — B3, audit 3.1)

**Purpose.** Define **selling prices** — the entity the whole original spec assumed but never modeled. Supports retail vs wholesale vs institutional, per-store overrides, quantity slabs, and time validity. This is what supplies the `rate` on every order line, and the "before price" schemes discount from.

**Depends on.** Items (§4.1).

**Entities.**
```
price_lists
  id, name, type enum(retail|wholesale|institutional|custom),
  is_default bool, valid_from date, valid_to date null, status, created_at
price_list_items
  id, price_list_id FK, item_id FK, unit_price numeric(14,2),
  min_qty numeric default 0,                    -- slab pricing: price applies at/above this qty
  UNIQUE(price_list_id, item_id, min_qty)
customer_store_price_list                       -- assignment + override
  customer_store_id FK, price_list_id FK, valid_from, valid_to null
```

**Price resolution rule (deterministic, documented so AI implements exactly):**
```
resolve_price(store_id, item_id, qty, date):
  1. list = active customer_store_price_list for store (else store.type default list, else global default)
  2. rows = price_list_items(list, item) where min_qty <= qty, valid on date
  3. return row with greatest min_qty   (highest applicable slab)
  4. if none → error "no price defined" (block order line; never default to 0)
```

**Workflows.** Manage lists; assign to stores; bulk price update (new `valid_from` supersedes — mirrors BOM versioning). Line-level manual discount allowed only with `order.discount` capability and posts to a Discount ledger.

**Permissions.** admin/manager manage prices; sales/agents read resolved price; manual discount gated + approval per `approval_policies`.

**Acceptance criteria.** Order line rate is always traceable to a `price_list_items` row or an audited manual override. No sale can post with rate = 0 unless item is explicitly free-flagged.

**Edge cases.** Overlapping validity blocked (like BOM). Scheme "before price" = resolved price on sale date; scheme rebate computed later (§7).

### 4.3 Module: Customers & Stores + Credit Management  (adds B4, audit 3.2)

**Purpose.** Store-centric customer model (kept from original) **plus** the credit terms the portal already assumes — limits, terms, due dates, aging, over-limit control.

**Depends on.** Settings, Pricing, Users (for customer portal logins), Routes (nullable until Phase 4).

**Entities.**
```
customers
  id, name, phone, email, gstin null, address, status, created_at
customer_stores
  id, customer_id FK, name, gstin null, state_code (derived from gstin), address, phone,
  route_id null,                                -- cache; history in customer_store_routes (Phase 4)
  price_list_id null,                           -- see §4.2
  credit_limit numeric(14,2) default 0,         -- NEW (B4)
  credit_days int default (app_settings.default_credit_days),   -- NEW (B4)
  opening_balance numeric default 0,            -- from migration §3.4
  status, created_at
customer_ledger                                 -- READ-MODEL (§1.3); authoritative = journals
  id, customer_store_id FK, txn_type enum(sale|payment|credit_note|debit_note|scheme|opening),
  reference_id, amount, balance_after, due_date null, created_at
```

**Workflows.**
1. Create customer → first store (portal signup allows first store only; additional by staff — kept).
2. Set credit limit/days per store; `due_date = invoice_date + credit_days`.
3. **Over-limit policy:** when a new order would push `outstanding + order_value > credit_limit`, RPC returns a soft-block → requires `credit.override` (manager) with reason → audit_log. Zero credit_limit = cash-only (block any credit sale).
4. Aging buckets computed from due_date: Current / 1–30 / 31–60 / 60+.

**Permissions.** admin/manager manage credit; sales/marketer view; customer sees only own stores.

**Accounting impact.** None directly (customers post via Sales/Payments). `customer_ledger` maintained by those RPCs.

**Acceptance criteria.** Portal "Outstanding + Due Date" (originally un-computable) now derives from `credit_days` + invoice date. Over-limit order is blocked or overridden-with-audit. Aging report ties to Trial Balance customer total.

**Edge cases.** Multi-store customer: limits/aging per store, roll-up view at customer level. GSTIN change re-derives state_code (affects future tax type).

### 4.4 Module: Orders + Delivery Challan  (fixes audit 2.6)

**Purpose.** Capture demand and move goods with a delivery note, with a **single coherent state machine** and explicit partial-fulfillment (the original had order-state vs challan-state overlap and no partial state).

**Depends on.** Items, Pricing, Customers/Stores, Stock, Holdings.

**Entities.**
```
orders
  id, order_no (series, §1.8), customer_store_id FK, created_by_user_id,
  status enum(pending|approved|challan_printed|partially_fulfilled|fulfilled|cancelled),  -- + partially_fulfilled (audit 2.6)
  priority enum(normal|urgent), delivery_date null, notes,
  visit_id null,                                -- Phase 4 routes
  version int,                                  -- optimistic lock (§1.12)
  created_at
order_lines                                     -- intended qty (canonical, NOT JSON; audit 2.4)
  id, order_id FK, item_id FK, qty_ordered numeric(14,3),
  qty_fulfilled numeric(14,3) default 0, rate numeric(14,2), discount numeric default 0
delivery_challans
  id, order_id FK, challan_no (series), status enum(printed|in_transit|delivered),
  eway_bill_no null, agent_id FK, printed_at, delivered_at null
```

**Order state machine (authoritative):**
```
pending ──approve(auto if toggle)──> approved ──print──> challan_printed
   │                                                          │
   └──────────────── cancel (admin/manager) ─────────────────┤
                                                              ▼
                                          record_sale (delivered qty)
                                              │
                     delivered == ordered ────┴──── delivered < ordered
                            ▼                              ▼
                        fulfilled                 partially_fulfilled
                                                          │ follow-up order auto-created
                                                          ▼ for remaining qty
                                                     (new order, pending)
```
Challan owns transit sub-states (printed→in_transit→delivered); order reflects the rollup. "Fulfilled" = all ordered qty delivered across one or more sales; "partially_fulfilled" = some delivered, remainder moved to a linked follow-up order.

**Workflows.**
1. Create (marketer/customer/agent/operator) → lines priced via `resolve_price` (§4.2) → credit check (§4.3).
2. Approve (manager, or auto-approve toggle admin-controlled; admin always auto).
3. Print challan (2 copies: customer + office) → status challan_printed → optional e-way fields.
4. Fulfil → `record_sale` (§4.5).

**Permissions.** create per §2.3; approve = manager/admin; edit own before approval; edit-after-approval triggers re-approval (configurable).

**Acceptance criteria.** No order leaves `pending` without a resolved price on every line. Partial delivery always yields `partially_fulfilled` + a follow-up order; quantities reconcile (Σ fulfilled + remaining = ordered). Challan cannot print for a cancelled order.

**Edge cases.** Editing an approved order re-enters approval if `app_settings.reapprove_on_edit`. Cancelling after challan print but before sale returns reserved stock (if reservation used).

### 4.5 Module: Sales & Invoicing (Official + Unofficial)  (fixes audit 2.3, 3.3, 2.4)

**Purpose.** Turn a delivery into a recorded sale: deduct stock, post revenue + COGS + tax, generate the correct invoice, and (if partial) spawn the follow-up. Correct GST throughout.

**Depends on.** Orders, Items, Stock/Holdings, Accounting engine (§5.1 — Phase 2). *In Phase 1, `post_journal` from §3.5 exists; the full report suite lands in Phase 2. Sales still posts journals from day one.*

**Entities.**
```
sales
  id, invoice_no (series per official/unofficial, §1.8), order_id FK, customer_store_id FK,
  is_official bool, invoice_date, place_of_supply_state_code,
  taxable_value numeric(14,2), cgst numeric, sgst numeric, igst numeric, cess numeric,
  round_off numeric, total numeric(14,2),
  irn null, irn_qr null, eway_bill_no null, created_by_user_id, created_at
sale_lines                                      -- canonical (audit 2.4); replaces sales.items JSON
  id, sale_id FK, item_id FK, qty numeric(14,3), rate numeric(14,2),
  taxable_value numeric, tax_rate numeric, cgst, sgst, igst, cess,
  unit_cogs numeric(14,4)                        -- WA at time of sale (audit 2.3 return reversal)
```

**Tax computation (per §1.9).** For each line: taxable = qty×rate − discount; look up tax_rate; if `place_of_supply_state_code == company.home_state_code` → CGST=SGST=rate/2 else IGST=rate. Sum lines; round invoice total; post `round_off`.

**Accounting impact — journal templates (authoritative; fixes audit 2.2/2.3).**

Official sale:
```
Dr Customer Ledger (store)          total
   Cr Sales                                 taxable_value
   Cr Output CGST Payable                   cgst
   Cr Output SGST Payable                   sgst
   Cr Output IGST Payable                   igst
   Cr Round-Off                             round_off (or Dr if negative)
COGS (same transaction):
Dr Cost of Goods Sold               Σ(qty×unit_cogs)
   Cr Finished Goods Inventory              Σ(qty×unit_cogs)
```
Unofficial sale: single `Cr Sales = total`, no tax lines; COGS identical.

Sale return (official) — **reverses tax** (fixes audit 2.3), issues credit note (§7 credit_notes, own series):
```
Dr Sales Returns                    taxable_value(returned)
Dr Output CGST Payable              cgst(returned)
Dr Output SGST Payable              sgst(returned)
Dr Output IGST Payable              igst(returned)
   Cr Customer Ledger (store)               total(returned)
Stock/COGS reversal at ORIGINAL unit_cogs (fixes audit 2.3/16.9):
Dr FG Inventory                     Σ(returned_qty × sale_line.unit_cogs)
   Cr Cost of Goods Sold                    Σ(returned_qty × sale_line.unit_cogs)
```

**Workflows (`record_sale` RPC).** Single transaction: allocate invoice no → write sale + sale_lines (capturing `unit_cogs` from current WA) → deduct stock (agent holding if fulfilled from agent; else warehouse for walk-in/operator) → post sale + COGS + tax journals → record payments (§4.6) → update order/challan state (fulfilled/partially_fulfilled + follow-up) → maybe e-invoice flag → audit_log.

**E-invoice / e-way (§1.9).** If official B2B and AATO ≥ threshold → flag for IRN; user downloads JSON, uploads to IRP, re-enters IRN + QR. E-way if consignment ≥ threshold.

**Permissions.** `sale.record` (admin/manager/operator/agent/sales). Marketer cannot.

**Acceptance criteria.** Every official sale's tax matches place-of-supply logic; returns reverse exact tax and exact original COGS; `sale_lines` fully queryable (HSN summary works); invoice numbers gap-free per series per FY.

**Edge cases.** Delivered qty ≠ ordered (partial → §4.4). Zero-stock block (§1 negative-stock rule). Official invoice immutable after issue — corrections via credit note only.

### 4.6 Module: Payments & Collections  (fixes audit 2.2)

**Purpose.** Record money against a store's ledger through the correct destination per method (§1.7). Replaces the original single "cash/UPI → user holding" journal.

**Depends on.** Customers/Stores, Accounting, Cheque registry (§7 banking — cheque method uses Cheques-in-Hand until then).

**Entities.**
```
payment_methods (enum seed)
  id, code(cash|upi_agent|upi_company|card|cheque|bank_transfer|advance), name, is_active,
  destination enum(user_cash|bank|cheques_in_hand|customer_advance)   -- drives journal (§1.7)
payments
  id, sale_id null, customer_store_id FK, amount numeric(14,2),
  method_id FK, reference_no null, collected_by_user_id, visit_id null (Phase 4),
  deposited_at null, note, created_at
```

**Accounting impact.** Journal per method exactly as §1.7 table. `record_payment` posts it + updates `customer_ledger` read-model in the same transaction.

**Workflows.** Record against sale or on-account (advance). Bank/card/company-UPI → bank ledger (not user). Cheque → Cheques-in-Hand asset + registry row (§7). Advance → Customer Advances liability, later applied to a sale.

**Permissions.** `payment.record`; customer online = "record intent"/UPI-receipt upload only until a gateway exists (audit 3.5 — see §7 messaging/portal note).

**Acceptance criteria.** A `card`/`upi_company`/`bank_transfer` payment increases a **bank** ledger, never a user holding (regression test for audit 2.2). Cheque never appears in `user_cash_holdings`. Customer outstanding read-model matches journal-computed outstanding (nightly assert).

**Edge cases.** Overpayment → creates advance. Payment before invoice → advance, later applied. Reversal (bounced cheque) handled in §7 banking.

### 4.7 Module: User Holdings & Handover/Transfers  (adds atomicity §1.4)

**Purpose.** Track cash/stock in each user's custody and move it up the chain with accept/reject — now atomic and journal-backed.

**Depends on.** Users, Items/Stock, Accounting.

**Entities.**
```
user_cash_holdings   (user_id pk, amount)               -- read-model of user cash ledger
user_stock_holdings  (id, user_id, item_id, batch_no null, quantity)  -- authoritative qty
transfers
  id, type enum(stock|cash), from_user_id, to_user_id,
  status enum(pending|accepted|rejected|cancelled),
  amount null, reference_order_id null, note,
  created_at, responded_at
transfer_lines        -- (stock transfers; NOT JSON, audit 2.4)
  id, transfer_id FK, item_id FK, qty numeric(14,3), batch_no null
```

**Accounting impact.**
```
Cash handover A→B (on accept):  Dr User Cash in Hand (B)  Cr User Cash in Hand (A)
Bank deposit by user:           Dr Bank Account           Cr User Cash in Hand (user)
Stock WH→Agent / user→user:     stock/holdings qty move; value stays in inventory (no P&L)
```

**Workflows (`create_transfer` / `respond_transfer`).** Sender creates → pending (can cancel before response). Accept → balances move atomically + journal (cash) → audit_log. Reject → no-op. No partial accepts (kept). Stale pending swept hourly (§1.6) → escalation notification.

**Permissions.** per §2.3 (`stock.transfer`, `cash.transfer`).

**Acceptance criteria.** Accept is all-or-nothing in one transaction (kill the process mid-accept → nothing moved). Σ user cash holdings + bank + in-transit ties out nightly (§1.6). Deactivating a user with non-zero holding is blocked (§3.2).

**Edge cases.** Transfer referencing an order for traceability. Manager balance adjustment (`balance.adjust`) posts an audited correction journal, never a silent edit.

### 4.8 Module: Phase-1 Dashboard & Basic Stock Views

**Purpose.** Give admin/manager/agents a live operational picture from the read-models built above.

**Depends on.** All of Phase 1.

**Surfaces.** Sales today, collections today, pending orders, pending actions (approvals/transfers), holdings summary (operators/agents/manager/bank), stock summary per warehouse, reorder alerts (min level per item). Every figure drills to its source list (kept from original §14/§15). Reorder config: `item_reorder_levels(item_id, warehouse_id, min_qty, max_qty, preferred_supplier_id)`.

**Acceptance criteria.** Dashboard numbers equal journal-computed values (not divergent caches). Reorder alert fires at ≤ min and notifies operator/manager.

**Phase 1 exit criteria.** A real order can be priced, credit-checked, approved, delivered on a challan, recorded as an official *or* unofficial sale with correct GST, paid via any method to the correct ledger, and every store outstanding + user holding is correct and reconciles nightly.

---

## 5. PHASE 2 — Accounting & Purchasing

> Goal: the books are complete and correct. The double-entry engine (already posting since Phase 1 via `post_journal`) now gets its full report suite, manual vouchers, FY rollover, purchasing with proper controls, expenses, assets, and GST filing prep.

### 5.1 Module: Double-Entry Accounting Engine

**Purpose.** The financial backbone. Auto-posts from every transaction and computes all statements live from `journal_lines` + `fy_opening_balances`. (Original design kept; hardened per §1.)

**Depends on.** Settings (FY, tax), Phase-0 `post_journal`.

**Entities.**
```
account_groups
  id, name, group_type enum(asset|liability|income|expense|equity),
  parent_group_id null, affect_gross_profit bool, is_system bool
account_ledgers
  id, group_id FK, name, ledger_type enum(customer|supplier|user|bank|stock|general),
  reference_id null, reference_table null, is_active
fy_periods            -- (from §3.1)
fy_opening_balances
  id, fy_id FK, ledger_id FK, dr_balance numeric, cr_balance numeric
journal_entries
  id, entry_no (series per FY, §1.8), fy_id FK, entry_date, narration,
  reference_type enum(sale|purchase|payment|expense|production|handover|receipt|
                      contra|opening|closing|voucher|scheme|adjustment|reconciliation),
  reference_id null, created_by, created_at, is_audited bool,
  reversed_by_entry_id null, reverses_entry_id null
journal_lines
  id, journal_entry_id FK, ledger_id FK, dr_amount numeric(14,2) default 0,
  cr_amount numeric(14,2) default 0, stock_item_id null, stock_qty numeric(14,3) null
```

**Hard constraints (enforced in `post_journal`).** Σdr=Σcr per entry; if `stock_item_id` set then `stock_qty` non-zero; audited lines never mutated (reversing entries only); post only to an open FY.

**Reports (live, recursive CTE on `parent_group_id`).** Trial Balance (as-of), P&L (range; Gross vs Net via `affect_gross_profit`), Balance Sheet (classified by `group_type`, never by sign), Day Book, Ledger, **Cash Flow** (classify ledgers operating/investing/financing — fixes the "listed but unsupported" gap). Large statements served from nightly snapshot + live delta (§1.13).

**FY rollover (`run_fy_rollover`).** Confirm all entries audited → closing TB → post `closing` entry transferring net P&L to Reserves & Surplus → seed new-FY opening balances (A/L/E carry, I/E reset) → lock FY. Back-dating into a locked FY impossible; corrections = reversing entries in open FY. (Kept.)

**Acceptance criteria.** TB always balances (nightly assert §1.6). Deleting/editing an audited line is rejected at DB level. Balance Sheet classification independent of balance sign (supplier advance stays under Liabilities as negative).

### 5.2 Module: Manual Vouchers  (was missing — C1)

**Purpose.** Let the accountant post entries the auto-engine can't infer: provisions, depreciation runs, adjustments, contra (cash↔bank), opening tweaks, corrections.

**Depends on.** Accounting engine.

**Entities.** Reuses `journal_entries`/`journal_lines` with `reference_type='voucher'`; a thin `voucher_templates(id, name, default_lines_json)` for recurring entries.

**Workflows.** Voucher types: Payment, Receipt, Contra, Journal. UI enforces Dr=Cr before enabling Save; Save calls `post_journal`. Templates prefill common entries. Reversal = one click → `reverses_entry_id`.

**Permissions.** admin/manager/accountant role capability `voucher.post`; approval policy for amounts.

**Acceptance criteria.** No voucher saves unbalanced. Every voucher audited. Contra between cash/bank ledgers only.

### 5.3 Module: Suppliers & AVL

**Purpose.** Vendor master and the Approved Vendor List that decouples sourcing from BOM recipes (kept from original §5.5; contradiction with old §14.1 resolved — **BOM references items, purchases reference items; category is only a reporting grouping**, audit 2.5).

**Entities.**
```
suppliers
  id, name, contact, gstin null, state_code, address, status, opening_balance, created_at
item_suppliers (AVL)
  id, item_id FK, supplier_id FK, unit_price numeric(14,2),
  lead_time_days int, min_order_qty numeric, preferred bool, is_active
  -- currency REMOVED (INR only, audit 3.8)
```

**Acceptance criteria.** Exactly one `preferred` per item. AVL price change is audited. Cost rollup (§6 BOM) reads AVL.

### 5.4 Module: Purchasing — PO → GRN → Bill (3-way match)  (adds D1)

**Purpose.** Controlled procurement. Upgrades the original single "purchase form" to optional PO, goods-receipt note, and bill matching — the standard control for a manufacturer.

**Depends on.** Suppliers/AVL, Items/Stock, Accounting.

**Entities.**
```
purchase_orders
  id, po_no (series), supplier_id FK, status enum(draft|approved|partially_received|received|closed|cancelled),
  expected_date, notes, created_by, created_at
po_lines
  id, po_id FK, item_id FK, qty numeric, rate numeric, received_qty numeric default 0
goods_receipts (GRN)
  id, grn_no (series), po_id null, supplier_id FK, warehouse_id FK, received_at, created_by
grn_lines
  id, grn_id FK, item_id FK, qty numeric, rate numeric, batch_no null
purchases (bill)
  id, purchase_no (series), supplier_id FK, grn_id null, bill_no (vendor's), bill_date,
  taxable_value, input_cgst, input_sgst, input_igst, total_amount,
  paid_amount, payment_method_id null, bill_url,
  status enum(pending_approval|approved|rejected), approved_by, approved_at, created_by, created_at
purchase_items
  id, purchase_id FK, item_id FK, quantity numeric, rate numeric, amount numeric
```

**3-way match.** On bill approval, system compares PO (ordered) ↔ GRN (received) ↔ Bill (invoiced) qty/rate; variance beyond tolerance → flag for manager. PO optional (direct GRN+bill allowed for ad-hoc buys).

**Accounting impact (`approve_purchase`).**
```
Dr Raw Materials Inventory          taxable_value (converted to base UOM, §1.10)
Dr Input CGST / SGST / IGST         input tax
   Cr Supplier Ledger                        total_amount
If user paid from holding at entry:
Dr Supplier Ledger                  paid_amount
   Cr User Cash in Hand (user)               paid_amount
```
Stock qty += received (at GRN, or at bill approval if no separate GRN). WA recalculated (§6.5 rules).

**Permissions.** create: operator/manager/admin; `purchase.approve`: manager/admin per amount policy.

**Acceptance criteria.** Stock and Input-tax rise only on **approval**. WA blends new cost correctly. 3-way variance flagged. Everything audited.

**Edge cases.** Partial receipts (multiple GRNs per PO). Bill without PO allowed. Purchase in "bags", stock in "pieces" → conversion (§1.10).

### 5.5 Module: Purchase Returns (Debit Notes)

**Entities.** `debit_notes(id, debit_note_no series, supplier_id, purchase_id null, amount, tax reversal fields, reason, status, approved_by, created_by, created_at)`.
**Accounting.** `Dr Supplier Ledger / Cr RM Inventory + Cr Input tax reversal`; stock −qty. Approval + audit.

### 5.6 Module: Expenses & Petty Cash  (adds C6)

**Purpose.** Capture operating expenses (from user holdings or petty cash or bank) with approval and correct posting. Adds a **petty-cash box** distinct from user holdings (was missing).

**Entities.**
```
expenses
  id, user_id, category enum(fuel|repair|salary|rent|power|transport|misc|...),
  amount, bill_url, note, source enum(user_holding|petty_cash|bank),
  status enum(pending|approved|rejected), approved_by, approved_at,
  vehicle_id null (Phase 4 — attribute fuel to a vehicle), created_at
petty_cash_ledger  -- a bank-type ledger of ledger_type='general'; top-ups via contra from bank
```

**Accounting (`approve_expense`).**
```
Dr [Expense Ledger by category]     amount
   Cr [User Cash in Hand | Petty Cash | Bank]   amount   (per source)
Negative user balance = company owes user (reimbursement) — kept.
```

**Acceptance criteria.** Expense posts only on approval; source ledger decremented correctly; fuel can attribute to a vehicle (Phase 4). Audit on every approval.

### 5.7 Module: Fixed Assets & Depreciation  (was missing — C3)

**Purpose.** Register machines/vehicles/buildings and depreciate them so P&L and Balance Sheet are correct (and Companies-Act/Income-Tax ready).

**Entities.**
```
fixed_assets
  id, name, asset_class enum(plant_machinery|vehicle|building|furniture|computer),
  purchase_date, capitalized_value numeric, salvage_value numeric,
  method enum(slm|wdv), useful_life_years int / rate numeric,
  linked_ledger_id, accumulated_dep_ledger_id, status enum(active|disposed), disposed_on null
depreciation_runs
  id, fy_id, run_date, journal_entry_id
depreciation_lines
  id, run_id FK, asset_id FK, amount
```

**Accounting.** Depreciation run (manual voucher-backed): `Dr Depreciation Expense / Cr Accumulated Depreciation`. Disposal computes gain/loss vs WDV.

**Acceptance criteria.** Monthly/annual depreciation posts per method; Balance Sheet shows gross block − accumulated dep. Machine assets link to Maintenance (§6).

### 5.8 Module: Loans & EMI  (was missing — C5)

**Purpose.** Model the bank loans the dashboard already hinted at (§ original 19.8.3 "SBI Loan").

**Entities.** `loans(id, lender, principal, rate, start_date, tenure_months, emi_amount, loan_ledger_id, interest_ledger_id, status)`; `loan_schedule(id, loan_id, due_date, principal_component, interest_component, balance)`.
**Accounting.** EMI payment: `Dr Loan Ledger (principal) + Dr Interest Expense (interest) / Cr Bank`. Alerts on upcoming EMI.

### 5.9 Module: GST Reports & GSTR-2B ITC Reconciliation  (adds D2; fixes audit 3.3 reporting)

**Purpose.** Prepare filings and — critically — reconcile **input** tax credit against suppliers' filings (the biggest real-world GST pain, entirely missing before).

**Entities.**
```
gstr2b_imports        -- upload GSTR-2B JSON/CSV from GST portal
  id, period, filename, row_count, imported_by, imported_at
gstr2b_rows
  id, import_id FK, supplier_gstin, invoice_no, invoice_date, taxable, cgst, sgst, igst,
  match_status enum(matched|missing_in_books|missing_in_2b|mismatch),
  matched_purchase_id null
```

**Reports.** Sales Register (all), GST Sales Register (official only), GSTR-1 Summary (B2B/B2C/HSN), GSTR-3B Summary (output tax − ITC), HSN Summary (from `sale_lines` — now queryable, audit 2.4), Purchase Register, E-invoice Pending, **ITC Register + 2B match report**.

**2B reconciliation.** Match `purchases` (input tax) against `gstr2b_rows` by GSTIN+invoice+amount; flag: in books not in 2B (ITC to defer), in 2B not in books (unrecorded purchase), mismatch. This governs how much ITC is safely claimable in GSTR-3B.

**Acceptance criteria.** GSTR-1 totals equal sum of official `sale_lines`; place-of-supply splits B2B/B2C and CGST/SGST vs IGST correctly (§1.9); 3B ITC ties to 2B-matched purchases.

**Note (C4 excluded).** No TDS/TCS computation is included per scope exclusion; payments post at gross.

### 5.10 Module: Approval Engine & Cost Centers  (adds B6, C7)

**Purpose.** Centralize the approval logic scattered across modules, and add optional cost-center tagging + budgets.

**Entities.** `approval_policies` (§2.2); `cost_centers(id, name, type factory|distribution|admin)`; optional `cost_center_id` on expenses/journal_lines; `budgets(cost_center_id, account_group_id, fy_id, amount)` with budget-vs-actual report.

**Acceptance criteria.** Every approvable document (order, expense, purchase, scheme, debit note, adjustment, payroll) checks `approval_policies` for the actor's role + amount. Budget report compares actual (journals) vs budget per cost center.

**Phase 2 exit criteria.** Books produce a correct Trial Balance, P&L, Balance Sheet, and Cash Flow; purchases flow through PO/GRN/bill with WA costing and input tax; expenses/assets/loans post correctly; GST filings can be prepared and ITC reconciled against 2B.

---

## 6. PHASE 3 — Manufacturing & Production

> Goal: plan production from the order book, execute it on job cards, record it at EOD as an atomic transaction, cost it at weighted-average, and value inventory correctly. Adds machine maintenance and the statutory license register.
> **Scope reminder:** No QC hold/release gate (A2 excluded) — a produced batch is immediately sellable; batch codes are traceability-only.

### 6.1 Module: BOM / Recipes  (fixes audit 2.5)

**Purpose.** The recursive recipe tree for manufactured items, decoupled from suppliers. **Authoritative resolution of the item-vs-category contradiction:** BOM lines reference **items** (or an alternate-group); suppliers come only from AVL (§5.3); `category` is a reporting grouping only and is **never** referenced by a BOM line or a purchase. (Deletes original §14.1's "BOM references the category.")

**Depends on.** Items/UOM (§4.1), AVL (§5.3).

**Entities.**
```
bom_lines
  id, parent_item_id FK items, child_item_id FK items null,
  alternate_group_id null,                     -- either a child item OR an alt group
  quantity_per numeric(14,4), uom text,        -- converted to child.stock_uom via §1.10
  scrap_percent numeric default 0,
  effective_from date, effective_to date null, priority int,
  created_by, created_at, updated_at
alternate_groups (id, name)
alternate_group_members (id, group_id, item_id, priority, is_default)
```

**Operations.** Multi-level explosion (downward, apply scrap per level), where-used (upward), cost rollup (AVL preferred/lowest/weighted at calc time). Versioning by effective-date ranges; active = `effective_from ≤ today < effective_to`. Validations: no circular reference; no date-range overlap; cannot deactivate an item used as a child in an active line.

**Standard cost vs WA (kept, audit-consistent).** BOM standard cost = planning/estimation only. Actual accounting = WA (§6.5). Independent; variance not tracked.

**Permissions.** admin/procurement edit; others read. All changes → audit_log (kept from original §5.11, now via universal log §1.11).

**Acceptance criteria.** Explosion applies scrap and UOM conversion correctly to base units; circular refs rejected; cost rollup fails gracefully (₹0 + warning) when a component has no AVL price.

### 6.2 Module: Production Planning (Rolling, Order-Driven)  (fixes audit 4.4)

**Purpose.** Compute how many of each SKU to produce each day until the order book + buffer targets are satisfied, across the 2-stage process, respecting capacity, changeovers, material, and WIP as **hard constraints**. Recalculates on order/priority/cancel/EOD changes under a serialized lock.

**Depends on.** Orders, Items/Stock, BOM, Settings (shifts/changeover).

**Entities.**
```
production_plans (id, horizon_start_date, horizon_end_date, created_at)
production_plan_days
  id, plan_id FK, plan_date, status enum(planned|locked|in_progress|completed),
  stage1_available_hours, stage2_available_hours,
  stage1_changeover_minutes, stage2_changeover_minutes,
  locked_at, locked_by, completed_at, completed_by, reopened_at, reopened_by, reopen_reason
production_plan_allocations
  id, plan_day_id FK, order_id FK null (null=buffer), sku_item_id FK,
  qty_allocated, stage1_hours, stage2_hours, is_buffer_allocation bool,
  material_status enum(ok|low|blocked), sequence_index
sku_buffer_targets (sku_item_id FK, min_buffer_qty)
production_calendar_exceptions (id, date, stage(1|2|both), available_hours_override, reason)
production_plan_recalc_lock (plan_id FK, locked_at, locked_by_job_id)
```

**Algorithm (`recalculate_plan`, under lock).** Order pending+approved order-lines by priority tier (Urgent → Distributor → Retail/Institutional → FCFS), SKU-grouping as tie-breaker only. Per day, per stage: compute available hours (calendar override else shift; minus changeover if first SKU differs from previous day's last), then allocate `qty_fits = MIN(remaining, stage1 capacity, stage2 capacity, material_available (hard), stage2_input=WIP available (hard))`. Remainder carries to next day.

**Buffer-vs-future-orders fix (audit 4.4).** Before filling buffer with leftover capacity, **reserve materials/WIP for the whole-horizon committed order book**. Buffer runs consume only material not needed by any future committed order. This prevents a Day-1 buffer run from starving a Day-2 high-priority order (the original per-day ordering bug).

**Key rules (kept).** Day-0 locked; changeover configurable per stage; material + WIP hard constraints; buffer is a first-class output; calendar exceptions override shift hours; every priority-forced changeover logged.

**Day-0 lock state machine (kept).** planned → locked (midnight auto or manual) → in_progress (first EOD save) → completed (EOD submit). Manager override to unlock Day-0 (logged); no unlock during in_progress; back-dated corrections via reversing entries, never state mutation. Midnight rollover in Asia/Kolkata (§1.9).

**Concurrency.** Serialized via `production_plan_recalc_lock`; coalesce triggers (run once after the last) (§1.12).

**Acceptance criteria.** Plan is never infeasible (material/WIP never negative). Buffer never preempts a committed future order's material. Recalc is idempotent and single-flight under concurrent triggers.

### 6.3 Module: Job Cards (Plan → Execution)

**Purpose.** Turn a day's allocations into a per-shift, per-stage run-sheet the operator executes and records actuals against (kept from original §20).

**Entities.**
```
job_cards
  id, plan_day_id FK, stage int(1|2), shift_label, operator_id null,
  status enum(generated|active|completed|cancelled),
  started_at, ended_at, downtime_minutes, downtime_reason, notes, generated_at, created_at
job_card_allocations
  id, job_card_id FK, plan_allocation_id FK, sku_item_id FK, seq_index,
  planned_qty, planned_hours, planned_material_qty null,
  actual_qty null, actual_hours null, actual_wastage_units null, actual_downtime_minutes null,
  status enum(pending|running|completed|skipped), started_at null, ended_at null
```

**Generation.** At midnight/lock: single shift → one card/stage; double shift → split allocations morning/evening. Operator claims/assigned, Start Shift → per allocation Start/End Run (captures actuals) → End Shift.

**EOD integration.** Job-card actuals **pre-fill** the EOD form (§6.4); operator reviews + supplements (closing stock). If no job card (manager bypass) → free-form EOD fallback.

**Reporting.** Downtime (run-level + shift-level); **Schedule Attainment** and **true OEE** (fixes audit 4.2): Availability = runtime/planned; Performance = actual/(runtime×rate); Quality = good/actual; OEE = A×P×Q. (Rename the old formula; don't ship the incorrect one.)

**Acceptance criteria.** EOD does not require re-entering job-card data. Partial completion carries remaining allocations to next shift. Plan-change-after-generation flags allocations with an acknowledge step.

### 6.4 Module: EOD Production Recording (Atomic)  (fixes audit 4.3)

**Purpose.** The single atomic transaction that consumes materials/WIP, produces FG at WA, books wastage, updates stock + item_costs, and closes the plan day.

**Entities.**
```
eod_entries
  id, plan_day_id FK, stage int, preforms_used, bottles_produced,
  sku_item_id, bottles_filled, caps_used, shrink_used,
  wastage_units, wastage_kg, opening_wip, closing_wip,
  posted_journal_entry_id FK, submitted_at, submitted_by
```

**Wastage formulas (kept).** Stage-1 wastage = preforms_used − bottles_produced (× unit weight for kg); Stage-2 wastage = WIP drawn − bottles_filled; cap/shrink wastage per formulas. WIP: closing = opening + stage1 out − stage2 consumed; low-WIP warning.

**Partial-case handling (fixes audit 4.3).** Stage-2 output in bottles ÷ bottles_per_case → whole cases to FG; **remainder bottles stay in WIP/loose-bottle stock**, not silently dropped. Document the loose-bottle item so it's tracked.

**Accounting (`post_production_eod`) — WA (§6.5).**
```
Stage 1:  Dr WIP / Cr RM (preforms at WA);  Dr Mfg Wastage / Cr WIP;  Dr FG(Empty Bottles) / Cr WIP
Stage 2:  Dr WIP / Cr FG(Empty Bottles)+RM(caps,labels,pkg at WA); Dr Mfg Wastage / Cr WIP; Dr FG(Filled Cases) / Cr WIP
```
One transaction: post journals → update `stock` qty → recompute `item_costs` (WA) → mark day completed → enqueue `recalculate_plan`. Any failure rolls back (kept).

**Acceptance criteria.** Stock, WA, and journals move together or not at all. Loose bottles reconcile (no phantom loss from rounding). Manager back-date posts a forward-effective correction, never a past mutation.

### 6.5 Module: Inventory Valuation (Weighted Average)

**Purpose.** One global WA per item; warehouse tracks quantity only (kept from original §16.9). WA update rules per movement (purchase/production IN recompute WA; sales/consumption OUT at WA leave WA unchanged; returns IN at **original** unit_cogs — the audit-2.3 reversal).

**Entities.** `item_costs` (§4.1). Sale lines carry `unit_cogs` (§4.5).

**Edge cases (kept).** Negative stock blocked; qty→0 resets WA; inter-warehouse transfer no value change; BOM standard cost independent of WA.

**Acceptance criteria.** Return reverses exact original COGS (property test); WA never negative; `Σ item_costs.total_value` equals inventory ledgers in Trial Balance nightly.

### 6.6 Module: Machine Maintenance & Breakdown  (adds A4)

**Purpose.** Keep the blowing + filling lines running; feed downtime into the plan's calendar exceptions (the original referenced "breakdown" exceptions with nothing producing them).

**Depends on.** Fixed Assets (§5.7 — a machine is an asset), Production calendar.

**Entities.**
```
maintenance_schedules
  id, asset_id FK fixed_assets, type enum(preventive|calibration), interval_days,
  last_done_at, next_due_at, checklist_json
maintenance_events
  id, asset_id FK, type enum(preventive|breakdown|repair), started_at, ended_at,
  downtime_minutes, cost numeric null, spares_used_json, notes, created_by,
  creates_calendar_exception_id null           -- links to production_calendar_exceptions
breakdown → optionally writes a production_calendar_exception (reduced hours) for the affected day/stage
```

**Workflows.** Preventive schedule generates due alerts; logging a breakdown can auto-create a calendar exception that the plan consumes (§6.2); repair cost posts as an expense (§5.6) and spares consume stock.

**Acceptance criteria.** A logged breakdown with reduced hours changes that day's available capacity in the next recalculation. Preventive-due alerts notify operator/manager.

### 6.7 Module: Licenses & Certifications Register  (adds A3)

**Purpose.** Track statutory licenses so the business doesn't operate/sell on a lapsed one, and so invoices show valid numbers. (Mandatory for packaged water; QC testing itself is excluded per A2, but the *license register* is in scope.)

**Entities.**
```
licenses
  id, type enum(fssai|bis_isi|pcb_consent|trade_license|legal_metrology|other),
  license_no, issuing_authority, issued_date, expiry_date, document_url,
  status enum(active|expired|renewal_in_progress), renewal_reminder_days int default 60, notes
```

**Workflows.** `license_expiry_scan()` (§1.6, daily) → notify admin/manager at `renewal_reminder_days` before expiry and on expiry. FSSAI + BIS numbers surface on invoice print (§3.1 company profile references them).

**Acceptance criteria.** Dashboard shows any license within reminder window or expired. Expiry alerts fire daily until renewed.

### 6.8 Module: Process Costing — Cost to Make (COGM + Fully-Loaded)  (adds costing engine)

**Purpose.** Compute the **running average cost to make each finished product** using **weighted-average process costing** (the correct technique for continuous, multi-stage, identical-unit production). Produces two numbers per product per period:
- **COGM (Cost of Goods Manufactured) per case** — product cost only (direct materials + direct labour + manufacturing overhead). Feeds inventory valuation and gross margin. This is the strict "cost to make."
- **Fully-loaded cost per case** — COGM + an allocated share of period costs (admin/selling/finance). Used for pricing and break-even, never for inventory value.

> Terminology: this is *process costing* (vs job-order costing), weighted-average method. The per-unit figure is the **cost per equivalent unit**. Costs flowing from Stage 1 into Stage 2 are **transferred-in costs**.

**Depends on.** WA Inventory Valuation (§6.5 — gives the materials layer already), EOD Production (§6.4 — unit output + WIP), Accounting (§5.1 — cost accounts), Expenses (§5.6), Fixed Assets/Depreciation (§5.7 — machine depreciation), Loans (§5.8 — interest is a period cost), Machine time (§6.6 — machine-hours driver).

**The product-vs-period classification (the foundation — seed data).** Every cost account carries a `costing_class` tag. This table is the seed:
| Cost | costing_class | Absorbed into cost to make? |
|---|---|---|
| Direct materials (preform, cap, label, water, carton) | `direct_material` | Yes |
| Direct labour (line operators) | `direct_labour` | Yes |
| Factory power (blowing, filling, RO, compressor) | `mfg_overhead` | Yes |
| Factory rent | `mfg_overhead` | Yes |
| Machine **depreciation** | `mfg_overhead` | Yes |
| Factory maintenance, consumables, spares | `mfg_overhead` | Yes |
| Office/showroom power & rent | `period_admin` | No (COGM); yes (fully-loaded) |
| Warehouse rent, freight-out | `period_selling` | No (COGM); yes (fully-loaded) |
| Admin & sales salaries | `period_admin` / `period_selling` | No (COGM); yes (fully-loaded) |
| Loan **interest** | `period_finance` | No (COGM); yes (fully-loaded) |
| Loan **principal** (EMI principal part) | `not_expense` | No — balance-sheet repayment, never in any cost |

**Entities.**
```
cost_accounts_tag        -- one row per chart_of_accounts account
  account_id FK, costing_class enum(direct_material|direct_labour|mfg_overhead|
                 period_admin|period_selling|period_finance|not_expense)
overhead_pools
  id, name, stage enum(blowing|filling|shared), period_month,
  amount numeric,                       -- accumulated actual (or running estimate intra-month)
  source enum(actual|estimated), allocation_driver enum(machine_hours|cases|labour_hours)
costing_runs
  id, period_month, stage, status enum(draft|final),
  units_completed, wip_units, mat_equiv_units, conv_equiv_units,
  cost_mat_per_eu, cost_conv_per_eu, transferred_in_per_unit null,
  cogm_per_unit, computed_at, computed_by
costing_run_lines
  id, run_id FK, item_id FK, units, cost_mat, cost_conv, transferred_in,
  cogm_total, cogm_per_unit
product_cost_snapshots      -- read-model, per item per month
  item_id FK, period_month, cogm_per_case, loaded_per_case, source_run_id
```

**Workflows / RPC.**
- `run_process_costing(period_month, stage)` — executes the **five-step** method as ONE transaction (§1.4):
  1. Physical units (from EOD runs §6.4): started, completed, closing WIP.
  2. Equivalent units — **separately** for materials and conversion (materials usually 100% at start; conversion by % complete).
  3. Costs to account for — opening WIP + costs added, split materials vs conversion (from `journal_lines` tagged `direct_material` / `direct_labour` / `mfg_overhead`, plus `overhead_pools`).
  4. Cost per equivalent unit = total ÷ equivalent units (weighted-average).
  5. Assign to completed units and closing WIP.
- **Stage chaining:** Stage-1 `cogm_per_unit` (empty bottle) becomes **transferred-in** material input to Stage-2; Stage-2 adds its own materials + conversion → final `cogm_per_case`.
- `compute_loaded_cost(period_month)` — spreads `period_*` pools across cases produced (or revenue) → `loaded_per_case`. Excludes `not_expense`.
- **Intra-month:** carry an **estimated** overhead pool (budgeted power/rent/depreciation ÷ expected volume) so cost-to-make is live daily; **true-up at month close** when actual bills post (marks run `final`, restates the read-model). This is why costing is a month-end job with a running estimate in between.

**Accounting impact.** Costing is primarily **valuation/reporting**; it does not itself post sales journals. Optional overhead absorption entry (if you choose absorption into WIP): `Dr WIP / Cr Overhead Absorbed`, cleared against actuals with a variance line. Default v1: no extra posting — costing reads journals and reports; inventory value continues via §6.5 WA on materials, with overhead reported as a per-unit costing figure.

**Permissions.** admin/manager/accountant run and view costing; operators/agents do not see cost. Costing runs and driver changes → `audit_log`.

**UI surfaces.** Costing dashboard (COGM vs fully-loaded per product, trend by month); cost-breakdown card per product (materials / labour / overhead / transferred-in stacked); overhead-pool entry screen with driver selector; "estimate vs actual" true-up view at month close; margin view (selling price - COGM = gross; price - loaded = net).

**Acceptance criteria.** Per product per month, the system shows COGM/case and fully-loaded/case with a full breakdown. Stage-2 COGM includes Stage-1 transferred-in cost. Materials figure reconciles to §6.5 WA. Loan principal never appears in any cost figure; loan interest appears only in fully-loaded, never in COGM. Factory power/rent/depreciation are in COGM; office/warehouse equivalents are not. Intra-month estimate trues up to actuals at close and restates the snapshot.

**Edge cases.** Zero production month (no divide-by-zero — skip run, carry last snapshot); WIP with 0% conversion counts full materials, zero conversion EU; a cost account left untagged blocks `final` (must be classified first); driver change mid-month applies from next run, logged.

**Phase 3 exit criteria.** From the live order book the system produces a feasible rolling plan, generates job cards, records EOD as one atomic transaction that moves stock + WA + journals together, values inventory at WA with exact return reversal, computes a running weighted-average **cost to make** per product (COGM and fully-loaded), reflects machine breakdowns in capacity, and warns before any license lapses.

---

## 7. PHASE 4 — Field Force, CRM & Growth

> Goal: everything that scales the distribution business — routes & visits, vehicles, CRM, schemes, bank reconciliation, payroll, and customer messaging. Depends on Phases 0–2 (and 3 for stock context).

### 7.1 Module: Routes, Visits & Sessions  (fixes audit 5.3 offline)

**Purpose.** Organize field delivery/collection into routes, track agent sessions and per-store visits, with a **safe** offline model.

**Entities.**
```
routes (id, name, is_default, status, created_by, created_at)
customer_store_routes (id, customer_store_id FK, route_id FK, assigned_at, unassigned_at null)  -- history
route_sessions
  id, route_id FK, agent_id FK, status enum(pending|active|paused|completed|cancelled),
  started_at, paused_at, resumed_at, ended_at,
  stores_planned int, stores_completed int, total_distance_km, total_duration_min
visits
  id, route_session_id FK, customer_store_id FK, agent_id FK, visited_at,
  visit_type enum(fulfill_order|collect_payment|record_sale|mark_visited),
  no_business_reason null, no_business_note null, lat null, lng null, duration_min, created_at
```
Orders/payments/fulfilments link back via nullable `visit_id`. `customer_stores.route_id` caches current active assignment (history in `customer_store_routes`).

**Offline model (fixes audit 5.3 — no last-write-wins on money/stock).** Offline is **read + capture-intent only**. Cache route/stores/coords/pending orders. Offline actions allowed: navigate, mark visited, capture visit notes/GPS, draft an order. **Money/stock mutations (sale posting, payments) require signal** and are server-authoritative on sync with conflict detection — never LWW. Visit *notes* may LWW; financial records may not. Sync order on reconnect: visit → draft order (server assigns real IDs). Payments never offline (kept).

**Reports.** Route coverage, visit reasons, no-business analysis, agent productivity, missed stores, route efficiency (kept).

**Acceptance criteria.** No financial record is ever resolved by last-write-wins. Offline drafts become server-authoritative (real IDs, re-validated price/credit) on sync. GPS + duration captured per visit.

### 7.2 Module: Vehicles, Drivers & Trips  (adds E1)

**Purpose.** The delivery fleet the routes run on — so fuel/maintenance attribute to a vehicle (fuel was previously an expense category with nothing to attribute to).

**Entities.**
```
vehicles (id, reg_no, type, capacity, owned_or_hired, status, linked_asset_id null)
trips (id, vehicle_id FK, driver_user_id FK, route_session_id null, date, start_km, end_km, notes)
fuel_logs (id, vehicle_id FK, trip_id null, date, litres, amount, odometer, expense_id FK)
```
Vehicle maintenance reuses §6.6 (vehicle is a fixed asset). Fuel expense (§5.6) sets `vehicle_id`.

**Acceptance criteria.** Fuel/maintenance cost is reportable per vehicle; mileage from odometer deltas.

### 7.3 Module: CRM (Leads, Interactions, Complaints, Campaigns)

**Purpose.** Grow and retain customers (kept from original §16).

**Entities.**
```
leads (id, name, company, phone, email, source, assigned_to FK, status enum(new|contacted|qualified|converted|lost), notes, follow_up_date, created_at)
interactions (id, customer_store_id null, lead_id null, type enum(call|visit|whatsapp|order|note), by_user_id, note, created_at)
complaints (id, customer_store_id FK, status enum(open|in_progress|resolved|rejected), resolution enum(replacement|credit_note|rejected) null, note, created_at, resolved_at)
campaigns (id, name, audience_json, message, channel enum(whatsapp|sms|email), schedule_at, status)
campaign_results (id, campaign_id FK, customer_store_id, sent bool, read bool, order_id null)
```

**Workflows.** Lead → convert (creates customer + first store). 360° store view (outstanding, MTD, scheme %, last order, follow-up, complaints). Auto follow-up reminders. Complaint resolution via credit note links to §7.5. Campaign attribution.

**Acceptance criteria.** Lead conversion creates a real customer+store. Complaint resolved by credit note posts through §5.1. Campaign order-attribution reportable.

### 7.4 Module: Sales Targets & Commissions  (adds E2)

**Purpose.** Measure and reward the sales force (marketers/agents) — previously only attendance/payroll existed.

**Entities.**
```
sales_targets (id, user_id FK, period_month, target_amount, target_cases)
commission_rules (id, role|user, basis enum(revenue|cases|collection), rate numeric, threshold, tier_json)
commission_runs (id, period_month, computed_at, journal_entry_id null)
commission_lines (id, run_id FK, user_id, base_amount, commission_amount)
```

**Accounting.** Commission run posts `Dr Commission Expense / Cr [User payable or Payroll]`. Paid via expense/payroll flow.

**Acceptance criteria.** Target-vs-achievement per marketer/agent; commission computed from actual sales/collections (journals), payable posted on approval.

### 7.5 Module: Schemes / Rebates  (fixes scheme accounting + GST)

**Purpose.** Volume-based monthly rebates as customer credit notes (kept), with corrected accounting and GST treatment.

**Entities.**
```
schemes (id, name, period_start, period_end, target_type(total_cases), target_value, tiers_json, eligibility enum(global|group|customer), status enum(active|closed))
scheme_eligibility (id, scheme_id FK, customer_store_id FK, total_volume, tier_achieved, rebate_amount, status enum(pending_approval|approved|rejected), approved_by, approved_at, credit_note_id null)
credit_notes (id, credit_note_no series, customer_store_id FK, amount, reason, reference_sale_id null, scheme_eligibility_id null, status, approved_by, created_by, created_at)
```

**Workflow.** Customers buy at resolved price (§4.2). Month-end auto-calc per store: `rebate = Σ qty × (before − after)` per tier met. Manager approves → `post_scheme_credit_note`. Progress bar in portal (§7.9). No cash payout (kept).

**Accounting (`post_scheme_credit_note`).**
```
Financial (post-sale) rebate as credit note reducing outstanding:
Dr Scheme Rebates (expense)         rebate_amount        (+ if scheme treated as post-sale discount)
   Cr Customer Ledger (store)               rebate_amount
GST note: if issued as a GST credit note against official sales, reverse proportional output tax
(as in §4.5 return template); if a pure commercial (financial) credit with no GST adjustment,
post the expense-only entry above. Configure per scheme: gst_adjusted bool.
```
(Fixes the original's silent GST omission by making GST treatment an explicit scheme setting.)

**Acceptance criteria.** Rebate credit note reduces outstanding and is auditable; GST-adjusted schemes reverse output tax proportionally; returns affecting eligibility handled by manager (kept).

### 7.6 Module: Bank Reconciliation  (fixes audit 4.1 worked example)

**Purpose.** Match bank-statement lines to system records, handle cheque lifecycle, and produce a reconciled balance (kept from original §19 — strong design; only the worked example was numerically inconsistent).

**Entities.** `bank_accounts`, `bank_transactions`, `bank_statement_imports`, `reconciliation_adjustments`, `bank_csv_column_mapping`, `cheque_registry`, `bank_txn_payment_matches` (all per original §19; cheque registry now also the destination for the `cheque` payment method, §1.7).

**Auto-matching (kept).** Direct payment match (ref_no/amount/date), journal-line match, cheque clearance, bulk UPI settlement (sum-of-payments), N:M partial matches.

**Corrected worked example (replaces audit-flagged one).** Given consistent inputs:
```
Balance as per Bank Statement                         2,85,000
ADD: cheques ISSUED, entered in books, not yet cleared  +23,000   (books already reduced bank)
LESS: deposits in bank not yet in books (UPI + interest) −2,850
Balance as per Books                                  3,05,150
```
Then Book balance (3,05,150) minus the two timing items reconciles to the statement (2,85,000) with **difference ₹0**. (The prior doc showed a mismatched 2,87,350 vs 3,05,150 — recompute end-to-end so the on-screen "System Balance" equals the BRS "Balance as per Books".) Direction rule: issued-but-uncleared cheques are **added** to the bank balance to reach book balance; uncredited deposits are **subtracted**.

**Cheque lifecycle (kept).** Received: payment (method cheque) → Cheques-in-Hand → deposited → cleared (auto-match) → or bounced (reversing entry restores outstanding). Issued: recorded → cleared on statement; uncleared >30 days alerts.

**Acceptance criteria.** On-screen system balance == BRS "as per books"; reconciled difference resolves to ₹0 after adjustments; duplicate CSV import deduped by unique constraint; bounced cheque reverses correctly.

### 7.7 Module: Attendance & Payroll

**Purpose.** Daily attendance (part of EOD form) → monthly payroll (kept from original §18/§19-HR).

**Entities.** `user_pay_config` (§3.2), `attendance (id, user_id, date, shift, check_in, hours, ot_hours, status)`, `payroll_runs (id, period_month, status, journal_entry_id)`, `payroll_lines (id, run_id, user_id, days, ot_hours, gross, net)`.

**Accounting.** "Mark Paid" posts salary expense: from manager holding (expense handover) or bank. (No TDS — C4 excluded; post at gross.)

**Acceptance criteria.** Monthly payroll auto-computed from attendance; OT only above shift standard; payment posts correctly to source ledger.

### 7.8 Module: Notifications, Messaging & Documents  (fixes audit 5.2; adds F6, E3, F7, F8)

**Purpose.** Reach users and customers, store documents, and search.

**Sub-parts.**
- **Notifications** (in-app + email + optional SMS): all events from original §9.9 plus stale-transfer escalation, license expiry, EMI due, reorder, approval queues. Daily digest email to admin/manager.
- **WhatsApp (fixes audit 5.2):** use the **official WhatsApp Business Cloud API** with approved templates for invoices/reminders/dispatch — not the ban-prone unofficial `whatsapp-web.js`. If an unofficial stopgap is ever used, it's explicitly time-boxed and accepted as a risk.
- **SMS:** HTTP provider (DLT-registered templates for India).
- **Document management (E3):** general repository (contracts, KYC, agreements, license PDFs) in private Storage with signed URLs and tags — beyond just bills/receipts.
- **Global search (F7):** cross-entity search (customer/store/order/invoice/item/payment).
- **Tally / API export (F8):** export journals/masters to Tally XML for the CA; read API/webhooks for external integration.

**Acceptance criteria.** Customer-facing WhatsApp uses official API templates. SMS uses DLT templates. Every stored document is access-controlled. Global search returns across core entities. Tally export produces importable XML.

### 7.9 Module: Customer Portal & Online Payment  (fixes audit 3.5)

**Purpose.** Store-centric self-service (kept), with a **real** payment path (the original promised "Pay Now" with no mechanism).

**Surfaces.** Store switcher; dashboard (outstanding + due date now computable via §4.3, active orders, scheme progress, last invoice); orders; invoices (download); payments + **Pay Now**; outstanding with aging; schemes; request-new-store.

**Online payment (fixes audit 3.5).** Integrate a gateway (Razorpay/Paytm). Flow: customer pays → gateway webhook → `record_payment` (method `upi_company`/`card`, destination bank §1.7) → reconciled later via bulk-settlement matching (§7.6). If no gateway is provisioned, the button is labeled "Upload UPI receipt / Record intent" (never a dead promise).

**Acceptance criteria.** Portal shows only the logged-in customer's stores (RLS). Online payment posts a bank-destined journal via webhook and later reconciles against the settlement.

### 7.10 i18n rollout  (fixes audit 5.4)
English at launch (scaffold from §3.5). Add Tamil, Telugu, Kannada, Malayalam **per phase after launch**, one language at a time, with number/date/currency formatting tested. Do not gate v1 on all five.

**Phase 4 exit criteria.** Agents run routes with a safe offline model; fleet costs attribute to vehicles; CRM drives leads→customers and complaints→credit notes; targets/commissions compute from real data; monthly schemes credit correctly (with explicit GST treatment); bank statements reconcile to ₹0 difference; payroll runs; customers self-serve and pay online through a reconciled bank path.

---

## 8. Consolidated Data Dictionary

> Every table in one place, grouped by domain, with its authority class and owning module. **Authority class:** `AUTH` = source of truth (never derived); `READ-MODEL` = rebuildable cache (§1.5); `MASTER` = reference/config data; `LOG` = append-only. Money and stock-value live only in `journal_lines`; physical qty lives only in `stock` + `user_stock_holdings` (Invariants 1–2).

### 8.1 Foundation & platform (Phase 0)
| Table | Class | Module | Notes |
|---|---|---|---|
| company_settings | MASTER | 3.1 | Single row; legal name, GSTINs, FY start, feature flags |
| branches / locations | MASTER | 3.1 | Physical sites; stock is per-location |
| financial_years | MASTER | 3.1 | FY periods; controls number-series reset |
| number_series | AUTH | 1.8 | Gap-free counters per doc-type per FY, row-locked |
| users | MASTER | 3.2 | Linked to Supabase auth.uid |
| roles / permissions / role_permissions | MASTER | 2.2 | Generic capability engine |
| user_pay_config | MASTER | 3.2 | Salary/OT/commission basis |
| approval_policies | MASTER | 5.10 | Threshold → approver rules |
| audit_log | LOG | 1.11 | Every mutation + approval; immutable |
| opening_balances | AUTH | 3.4 | Migration seed → first journal entry |

### 8.2 Accounting core (Phase 2, used everywhere)
| Table | Class | Module | Notes |
|---|---|---|---|
| chart_of_accounts | MASTER | 5.1 | Ledger accounts; typed (asset/liab/income/expense/equity) |
| journal_entries | AUTH | 5.1 | Header; posted entries immutable (Invariant 6) |
| journal_lines | AUTH | 5.1 | **THE** source of truth for all money & stock value |
| cost_centers | MASTER | 5.10 | Optional dimension on journal_lines |
| account_balances | READ-MODEL | 5.1 | Rebuilt from journal_lines |
| ledger_outstanding (per store) | READ-MODEL | 4.3 | Rebuilt from journal_lines |

### 8.3 Commerce (Phase 1)
| Table | Class | Module | Notes |
|---|---|---|---|
| items | MASTER | 4.1 | Products, raw materials, WIP; UOM + conversions |
| item_categories | MASTER | 4.1 | Reporting only (not authoritative for BOM — audit 2.5) |
| price_lists / price_list_lines | MASTER | 4.2 | Tiered/customer/scheme pricing |
| customers | MASTER | 4.3 | Parent entity |
| customer_stores | MASTER | 4.3 | Store-centric; own GSTIN + ledger + credit limit |
| orders / order_lines | AUTH | 4.4 | State machine incl. partially_fulfilled (audit 2.6) |
| delivery_challans / challan_lines | AUTH | 4.4 | Fulfilment; moves stock |
| sales / sale_lines | AUTH | 4.5 | Invoice; official/unofficial; sale_lines authoritative (audit 2.4) |
| payments | AUTH | 4.6 | Per-method destination ledger (audit 2.2) |
| user_stock_holdings | AUTH | 4.7 | Physical qty in user custody |
| user_cash_holdings | AUTH | 4.7 | Cash in user custody (mirrored in journals) |
| transfers / handovers | AUTH | 4.7 | Accept/reject; atomic (§1.4) |
| stock | AUTH | 4.8 | Physical qty per item per location |
| stock_ledger | LOG | 4.8 / 6.5 | Movement history; WA cost layers |

### 8.4 Purchasing & financial ops (Phase 2)
| Table | Class | Module | Notes |
|---|---|---|---|
| suppliers | MASTER | 5.3 | AVL, GSTIN, terms |
| purchase_orders / po_lines | AUTH | 5.4 | Approval-gated |
| grn / grn_lines | AUTH | 5.4 | Receipt; moves stock at WA |
| purchase_bills / bill_lines | AUTH | 5.4 | 3-way match; ITC |
| debit_notes | AUTH | 5.5 | Purchase returns; reverse ITC |
| expenses | AUTH | 5.6 | Petty cash + vehicle_id attribution |
| fixed_assets / depreciation_schedule | AUTH | 5.7 | Monthly depreciation posting |
| loans / loan_emis | AUTH | 5.8 | EMI split principal/interest |
| gst_returns / gstr2b_imports / itc_matches | AUTH/LOG | 5.9 | GSTR-1/3B/2B reconciliation |
| vouchers | AUTH | 5.2 | Manual journal entries |

### 8.5 Manufacturing (Phase 3)
| Table | Class | Module | Notes |
|---|---|---|---|
| boms / bom_lines | MASTER | 6.1 | References items (audit 2.5); 2-stage |
| production_plans / plan_lines | AUTH | 6.2 | Rolling, order-driven; buffer logic fixed (audit 4.4) |
| plan_locks | AUTH | 6.2 | Day-0 lock state; serialized recalc |
| job_cards | AUTH | 6.3 | Plan → execution bridge |
| production_runs | AUTH | 6.4 | EOD atomic; consumes+produces (audit 4.3) |
| machines / maintenance_logs / breakdowns | MASTER/LOG | 6.6 | OEE (audit 4.2) |
| licenses | MASTER | 6.7 | BIS/FSSAI/pollution; expiry alerts |
| cost_accounts_tag | MASTER | 6.8 | Product-vs-period classification of each ledger account |
| overhead_pools | AUTH | 6.8 | Monthly factory overhead + allocation driver |
| costing_runs / costing_run_lines | AUTH | 6.8 | Weighted-average process-costing computation |
| product_cost_snapshots | READ-MODEL | 6.8 | Per-item COGM + fully-loaded per case per month |

### 8.6 Field force, CRM & growth (Phase 4)
| Table | Class | Module | Notes |
|---|---|---|---|
| routes / customer_store_routes | MASTER | 7.1 | Route assignment + history |
| route_sessions / visits | AUTH | 7.1 | Offline = capture-intent only (audit 5.3) |
| vehicles / trips / fuel_logs | MASTER/AUTH | 7.2 | Fleet; fuel attributes to vehicle (E1) |
| leads / interactions / complaints / campaigns / campaign_results | AUTH | 7.3 | CRM |
| sales_targets / commission_rules / commission_runs / commission_lines | MASTER/AUTH | 7.4 | Targets & commissions (E2) |
| schemes / scheme_eligibility | AUTH | 7.5 | Monthly rebates; explicit GST flag |
| credit_notes | AUTH | 7.5 | Scheme + complaint credits; GST reversal |
| bank_accounts / bank_transactions / bank_statement_imports | AUTH/LOG | 7.6 | Reconciliation |
| reconciliation_adjustments / bank_csv_column_mapping / bank_txn_payment_matches | AUTH | 7.6 | Matching |
| cheque_registry | AUTH | 7.6 | Cheque lifecycle + cheque-method destination |
| attendance / payroll_runs / payroll_lines | AUTH | 7.7 | Payroll |
| notifications / documents | AUTH | 7.8 | Messaging + document repository (E3) |

---

## 9. Build Order & Dependency Graph (solo + AI)

### 9.1 Hard dependency chain
```
Phase 0 (Foundation)
  └─ number_series, users, roles, audit_log, company_settings, opening_balances
        │  (everything below writes audit_log and pulls number series)
        ▼
Accounting Engine (5.1)  ◄── build FIRST inside Phase 2, but its INTERFACE
        │                     (chart_of_accounts + post_journal RPC) is needed by Phase 1 posting.
        │                     Practical order: stub COA + post_journal in Phase 0/1 boundary,
        │                     flesh out reporting in Phase 2.
        ▼
Phase 1 (Sell & Collect)
  Item Master → Pricing → Customers/Stores → Orders → Challan → Sales → Payments → Holdings → Dashboard
        ▼
Phase 2 (Accounting & Purchasing)
  Vouchers → Suppliers → PO/GRN/Bill → Returns → Expenses → Assets → Loans → GST → Approvals
        ▼
Phase 3 (Manufacturing)
  BOM → Production Planning → Job Cards → EOD → WA Valuation → Maintenance → Licenses
        ▼
Phase 4 (Field/CRM/Growth)
  Routes → Vehicles → CRM → Targets → Schemes → Bank Recon → Payroll → Messaging → Portal → i18n
```

### 9.2 Critical "build-before" rules (do not violate)
1. **`post_journal` RPC + chart_of_accounts before any sale/payment.** Phase 1 posts money; it needs the ledger interface even though full accounting reports come in Phase 2. Build the RPC + COA seed at the Phase 0→1 boundary.
2. **`number_series` + `audit_log` before any document is created.** Invariants 7–8.
3. **Item Master + UOM before Pricing, BOM, Orders, Stock.** Everything references items.
4. **Customers/Stores + credit before Orders.** Credit check gates order creation.
5. **Holdings model before Payments/EOD.** Cash/stock custody underlies collections and production output.
6. **WA valuation layer before GRN and EOD post value.** Both write stock value at WA cost.
7. **Approval engine before high-value POs/vouchers go live** (can seed permissive policies first, tighten later).

### 9.3 How to drive this with AI (working method)
- **One module per work session.** Feed the AI: this doc's §1 (invariants) + §2 (roles) + the single module's spec. Never paste the whole doc as one prompt.
- **Order within a module:** (1) migrations/tables → (2) RPC(s) with the transaction + journal template → (3) RLS policies → (4) read-model + rebuild function → (5) UI surface → (6) acceptance tests from the module's "Acceptance criteria".
- **Definition of done per module = its Acceptance criteria all pass + a reconciliation assert (§1.6) is green.**
- **Never let AI invent a money/stock write path outside an RPC** (Invariant 3). If a generated component mutates a balance directly, reject it.
- **After each phase, run the phase exit criteria** before starting the next.

### 9.4 Suggested milestones (value-first)
| Milestone | Contains | You can... |
|---|---|---|
| M1 | Phase 0 + Item/Customer/Order/Challan/Sale/Payment/Holdings | Take orders, invoice, collect, track custody |
| M2 | + Accounting reports, Purchasing, Expenses, GST | Close books, file GST, pay suppliers |
| M3 | + Manufacturing | Plan & record production, value inventory, know cost-to-make per product |
| M4 | + Field/CRM/Schemes/Bank recon/Payroll/Portal | Run the distribution business end-to-end |

---

## 10. Traceability Matrix

> Every audit finding and every missing module → where it is resolved in this plan. Confirms nothing was dropped and the four exclusions are deliberate.

### 10.1 Audit findings → resolution
| Audit ref | Issue | Resolved in |
|---|---|---|
| 2.1 | Section numbering / cross-ref inconsistencies | §0–§10 renumbered; single sequence |
| 2.2 | Payment method not mapped to correct ledger | §1.7 map; §4.6 |
| 2.3 | GST place-of-supply / IGST logic gaps | §1.9; §4.5 |
| 2.4 | sale vs sale_lines authority unclear | §4.5 (sale_lines authoritative) |
| 2.5 | BOM references item vs category contradiction | §6.1 (items authoritative; §8.3 note) |
| 2.6 | Order/challan state machine missing partial state | §4.4 (partially_fulfilled) |
| 2.7 | "No caches" claim vs 5 cache tables | §1.5 read-model pattern + rebuilds |
| 2.8 | Rounding/UOM ambiguity | §1.10 |
| 3.1 | Pricing master missing | §4.2 |
| 3.2 | Credit management underspecified | §4.3 |
| 3.3 | GST returns reporting gaps | §1.9; §5.9 |
| 3.4 | (folded into settings) | §3.1 |
| 3.5 | Portal "Pay Now" had no mechanism | §7.9 (gateway + webhook → bank) |
| 3.6 | No audit log / NFRs | §1.11; §1.13; §3.3 |
| 3.7 | RLS treated as if it were transactions | §1.2 RPC layer; §1.4 |
| 3.8 | Number series not gap-free; rounding | §1.8; §1.10 |
| 4.1 | Bank recon worked example inconsistent | §7.6 corrected example (₹0 diff) |
| 4.2 | OEE formula error | §6.6 |
| 4.3 | Stage-2 partial-case rounding at EOD | §6.4 |
| 4.4 | Buffer vs future-order material starvation | §6.2 |
| 5.2 | Unofficial WhatsApp ban risk | §7.8 (official Business Cloud API) |
| 5.3 | Offline last-write-wins on money/stock | §7.1 (capture-intent only; server-authoritative) |
| 5.4 | i18n gating v1 on 5 languages | §7.10 (English-first, phased) |

### 10.2 Missing modules → where added
| Code | Module | Added in |
|---|---|---|
| A3 | Licenses & certifications | §6.7 |
| A4 | Machine maintenance | §6.6 |
| B1 | Company/system settings | §3.1 |
| B2 | User & access management | §3.2 |
| B3 | Pricing master | §4.2 |
| B4 | Credit management | §4.3 |
| B6 | Approval engine | §5.10 |
| C1 | Manual vouchers | §5.2 |
| C2 | Opening balances / migration | §3.4 |
| C3 | Fixed assets & depreciation | §5.7 |
| C5 | Loans & EMI | §5.8 |
| C6 | Expenses & petty cash | §5.6 |
| C7 | Cost centers | §5.10 |
| D1 | Purchasing PO→GRN→Bill | §5.4 |
| D2 | GSTR-2B ITC reconciliation | §5.9 |
| E1 | Vehicles / fleet | §7.2 |
| E2 | Sales targets & commissions | §7.4 |
| E3 | Document management | §7.8 |
| F1–F5 | NFRs (perf/security/backup/logging/errors) | §1.13 |
| F2 | Audit log | §1.11; §3.3 |
| F6 | Notifications/messaging | §7.8 |
| F7 | Global search | §7.8 |
| F8 | Tally export / API | §7.8 |
| F9 | (rolled into platform NFR) | §1.13 |
| (new) | Process costing / cost-to-make (COGM + fully-loaded) | §6.8 |

### 10.3 Deliberate exclusions (NOT built — per scope decision)
| Code | Item | Why excluded | If ever needed |
|---|---|---|---|
| A1 | Returnable jar / deposit tracking | Out of current scope | Add deposits ledger + jar-cycle entity |
| A2 | QC / lab testing records | Out of current scope | Add batch_qc entity linked to production_runs |
| B5 | Quotation / proforma | Out of current scope | Add quotations → convert-to-order |
| C4 | TDS / TCS | Out of current scope | Add tax-deduction lines to payments/bills |

---

## 11. Final Verification Checklist (run before calling v1 done)
- [ ] Every module's **Acceptance criteria** pass.
- [ ] All §1.6 reconciliation asserts green (account_balances == journal_lines; stock == stock_ledger; holdings == journals).
- [ ] No money/stock write path exists outside an RPC (grep for direct table writes in app code).
- [ ] Number series prove gap-free across a simulated FY rollover.
- [ ] Every posted journal entry balances (Σ debits == Σ credits) and is immutable.
- [ ] GST: official-sales output tax, purchase ITC, and returns reversals reconcile to GSTR figures.
- [ ] Bank recon on a sample statement resolves to ₹0 difference; system balance == BRS "as per books".
- [ ] Offline sync test: no financial record resolved by last-write-wins.
- [ ] RLS test: each role sees only permitted data; customer portal shows only own stores.
- [ ] The four exclusions (A1, A2, B5, C4) are absent by design — confirmed against §10.3.
- [ ] Traceability matrix (§10) has no unresolved audit finding or missing module.
- [ ] Costing: COGM/case and fully-loaded/case compute per product per month; loan principal absent from all cost figures; loan interest and office/warehouse costs absent from COGM but present in fully-loaded; materials layer reconciles to §6.5 WA.
