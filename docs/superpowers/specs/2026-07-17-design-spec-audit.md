# Design Spec — Audit & Gap Analysis

**Audited document:** `2026-07-16-business-management-system-design.md` (3,267 lines)
**Audit date:** 2026-07-17
**Scope:** Consistency, completeness, correctness, architecture, compliance, planning.

Legend: 🔴 Critical (fix before build) · 🟠 Major (fix before that module) · 🟡 Minor/nitpick

---

## 0. Overall Assessment

This is an unusually thorough and well-thought-out spec — the handover/holdings model, the
order-driven rolling production plan, the double-entry accounting engine, bank reconciliation
and job cards are all genuinely strong. The problems are **not** in the ideas; they are in
(a) internal consistency having rotted as sections were reordered, (b) a handful of real
accounting/data-model correctness bugs, (c) missing "connective tissue" (pricing, credit terms,
transaction/atomicity layer, non-functional requirements), and (d) no phasing/MVP for a scope
that is effectively 4–5 products in one (ERP + accounting + manufacturing + CRM + field-force).

Top 6 things to fix first:
1. Two sources of truth for balances (journal engine vs cached ledger/holding tables). 🔴
2. Payment-method accounting is incomplete/incorrect (only cash-to-user is modeled). 🔴
3. No pricing/rate master — orders have a `rate` with no defined origin. 🔴
4. GST correctness: sales returns don't reverse tax; no place-of-supply/IGST logic. 🔴
5. Atomicity: "balances move atomically" is stated but no transactional layer is specified (RLS ≠ transactions). 🔴
6. Systematic section/subsection numbering drift + duplicate Section 19 → broken cross-references. 🟠

---

## 1. Structural / Numbering Inconsistencies

### 1.1 🟠 Duplicate Section 19
Two H2 headers are both numbered **19**:
- `## 19. Attendance & HR` (line 2502)
- `## 19. Deep Dive #4: Bank Reconciliation` (line 2610)

Everything after should shift: Bank Reconciliation → 20, Job Cards → 21.

### 1.2 🟠 Subsection numbering is off-by-one (or more) from Section 7 onward
The H2 section numbers were bumped at some point but the `### x.y` children were not.
Result — every cross-reference that uses a subsection number now resolves to the **wrong** content:

| H2 section | Its subsections are numbered | Should be |
|---|---|---|
| 7. Scheme/Rebate | 6.1–6.7 | 7.1–7.7 |
| 8. GST Compliance | 7.1–7.6, then jumps to **8.7** | 8.1–8.7 |
| 9. Customer Portal | 8.1–8.3 | 9.1–9.3 |
| 10. General Features | 9.1–9.10 | 10.1–10.10 |
| 11. Tech Stack | 10.1 | 11.1 |
| 15. Reports | 14.1–14.5 | 15.1–15.5 |
| 16. CRM | 15.1–15.8 | 16.1–16.8 |
| 17. Inventory | 16.1–16.9 | 17.1–17.9 |
| 18. Routes | 17.1–17.11 | 18.1–18.11 |
| 19. Attendance | 18.1–18.5 | (renumber section too) |

Section 8's last child jumping from `7.6` to `8.7` (line 962) shows the renumber was started and abandoned.

### 1.3 🟠 Broken cross-reference caused by 1.2
- Line 3249: "The manager's production report **(Section 15.2)**" — but `15.2` currently resolves to
  **CRM → Customer Store 360° View**, not a production report. There is in fact no production-report
  subsection at that number. The OEE/downtime report it points to doesn't formally exist anywhere.
- Line 1076 & 545 etc.: references like "section 9.3.2", "see 6.9", "see 16.9" happen to still land
  because they use the (un-renumbered) child labels — but they point into H2 sections whose numbers
  no longer match, so a reader navigating by the table-of-contents number will not find them.

**Fix:** Do one clean renumber pass (sections and subsections together) and then re-verify every
"see X.Y"/"Section X.Y" reference. Recommend an automated check in CI that every `Section N.M`
citation matches an existing header.

### 1.4 🟡 Orphaned "Deep Dive #4 / #5" labels
Sections are titled "Deep Dive #4" and "#5" but Deep Dives #1–#3 do not exist in the document.
Either they were dropped, or the earlier deep-dive sections (Handover, Production Planning,
Accounting) were meant to carry those labels. Remove the "#N" or restore the missing three.

### 1.5 🟡 Section 5.5 title formatting
"Approval Vendor List (AVL)" — elsewhere it's "Approved Vendor List". Pick one (Approved).

---

## 2. Data-Model Inconsistencies & Correctness Bugs

### 2.1 🔴 Two sources of truth for balances (the single biggest architectural risk)
§10 (General Features → Accounting) states, emphatically:
> "Reports are always computed live from opening balances + journal lines — never from cached running totals."

But the schema then defines **parallel cached balance tables**:
- `customer_ledger.balance_after` (running total per store)
- `user_cash_holdings.amount` (current holding)
- `user_stock_holdings.quantity`
- `item_costs.quantity / total_value` (WA cache)
- Vendor ledger "Balance" column (§14.5)

So a customer's outstanding can be derived two ways (journal_lines under the customer's ledger
group **vs** `customer_ledger.balance_after`), and these **will drift** the first time a journal
entry is posted without a matching `customer_ledger` row, or vice-versa.

**Recommendation:** Declare `journal_lines` the single source of truth for money. Treat
`customer_ledger`, `user_cash_holdings`, holdings, `item_costs` as **derived read-models**
(materialized views or trigger-maintained caches) that can be rebuilt from journals at any time,
and add a reconciliation job that asserts `derived == computed`. Document which is authoritative
for each entity. Right now the doc claims "no caches" while shipping five caches.

### 2.2 🔴 Payment-method accounting is incomplete and partly wrong
§9.7 defines 7 payment methods with different money destinations, but §9.3.2 only gives **one**
collection journal:
```
Payment collected by User (Cash/UPI):
  Dr User Cash in Hand (user)   Cr Customer Ledger (store)
```
This is **incorrect** for `upi_company`, `card`, and `bank_transfer`, which §9.7 says go
**directly to the company bank** (not into a user's holding). Those must be:
```
  Dr Bank Account   Cr Customer Ledger (store)
```
And `cheque` (money not yet realized) and `advance` (no linked sale) each need their own entry.
As written, a card/company-UPI payment would wrongly inflate a user's cash holding.
**Fix:** Provide a journal template per `payment_methods.code`, and make the destination ledger a
property of the method.

### 2.3 🔴 Sales return does not reverse GST
§9.3.2 "Sales Return":
```
Dr Sales (or Sales Returns) 11,800   Cr Customer Ledger 11,800
```
For an **official** sale this is wrong — the ₹11,800 included ₹1,800 output GST. A return must
reverse output tax and reduce taxable value, e.g.:
```
Dr Sales Returns 10,000
Dr Output CGST 900
Dr Output SGST 900
   Cr Customer Ledger 11,800
```
Otherwise GSTR-1/3B and the tax liability are overstated after every return. (Credit-note issuance
for GST returns also needs a credit-note number series — see §4.5.)

### 2.4 🟠 `sales.items` JSON vs `order_items`/`sales_lines` table ambiguity
- `sales` table stores `items (JSON)` (line 1533).
- Separately there's `order_items (sales_lines)` with `unit_cogs` (line 1523).
- §16.9 refers to "`sales_lines` (or `order_items`)" — unsure which holds sale lines.
- §9.7 explicitly says the new `payments` table "replaces the old JSON `payment_breakdown`" —
  i.e., the design is moving **away** from JSON blobs, yet `sales.items` and `transfers.items`
  remain JSON.

This matters because COGS reversal (§16.9) and GST HSN summaries need **queryable** line items,
which a JSON blob makes painful. **Fix:** One canonical `sale_lines` table (item, qty, rate,
taxable_value, tax, `unit_cogs`); drop `sales.items` JSON. Decide whether order lines and sale
lines are one table or two (recommend two: `order_lines` = intended, `sale_lines` = delivered/invoiced,
since §4.7 allows delivered qty ≠ ordered qty).

### 2.5 🟠 BOM references item (§5) vs category (§14) — direct contradiction
- §5.5: "Suppliers are never referenced in BOM lines"; BOM lines reference a specific `child_item_id`.
- §14.1: "**BOM references the category**. At purchase time, user picks which vendor's item was bought."

These can't both be true. §5's item+AVL model is the correct one; §14.1's "BOM references category"
is a leftover from an earlier design. **Fix:** Rewrite §14.1 to say raw materials are *grouped* by
category for reporting, but BOM lines reference items (or alternate-groups), and purchases reference
items. Otherwise BOM explosion (§5.7) and costing are undefined.

### 2.6 🟠 Order vs Challan: two overlapping state machines for one physical flow
- `orders.status`: pending → approved → challan_printed → fulfilled → cancelled
- `delivery_challans.status`: printed → in_transit → delivered

"challan_printed" is duplicated as both an order state and a challan state, and there's no order
state for "partially fulfilled" even though §4.7 supports partial delivery (it silently jumps the
order to `fulfilled` and spawns a follow-up order). **Fix:** Add `partially_fulfilled`; let the
challan own transit/delivery sub-states and have the order reflect a rollup. Define what "fulfilled"
means when delivered < ordered.

### 2.7 🟡 `is_raw_material` flag is redundant and its "pricing logic" is never defined
`items.type` already distinguishes `raw_material`/`intermediate`/`finished_good`. The extra boolean
`is_raw_material` "(for pricing logic)" (lines 335, 1432) is both redundant with `type` and points
at pricing logic that the document never specifies. Remove it or define the logic.

### 2.8 🟡 `unit_of_measure` on both item and BOM line; UOM conversions undefined
BOM lines carry their own `unit_of_measure` (pieces/kg/grams/rolls). Shrink is consumed in "grams"
but purchased in "rolls" (§14.1). There is no UOM-conversion definition (grams↔roll, bag↔piece for
preforms — §16.1 counts preforms in "bags LEFT"). Costing and stock deduction will be wrong without
a conversion factor per item. **Fix:** Add `purchase_uom`, `stock_uom`, `consumption_uom` and a
conversion table.

---

## 3. Missing Modules / Gaps to Fill

### 3.1 🔴 No pricing / rate master
Orders and sale lines have a `rate`, the portal shows invoices, and schemes define "before price →
after price" per SKU — but **nowhere** is the base selling price defined. There is no price-list
table, no per-customer / per-store / per-tier pricing, no wholesale-vs-retail price. For a
retail+wholesale distributor this is a core missing entity.
**Fix:** Add `price_lists` (id, name, type retail/wholesale/institutional, valid_from/to) and
`price_list_items` (price_list_id, item_id, unit_price, min_qty for slabs), plus a resolution rule
(store → assigned price list → item → date). Schemes then reference the resolved "before price".

### 3.2 🔴 No credit limit / payment terms, yet the UI relies on them
The portal (§9.1) shows "Outstanding: ₹45,000 — Due Date: 5 Aug" and CRM shows "Outstanding > 30
days" reminders and aging buckets — but `customer_stores` has no `credit_limit`, `credit_days`, or
`payment_terms`. Due dates and aging can't be computed. Nothing blocks orders over the credit limit.
**Fix:** Add `credit_limit`, `credit_days` to `customer_stores`; compute invoice `due_date`;
add an over-limit order warning/block policy.

### 3.3 🔴 GST place-of-supply / IGST logic missing
`sales` has `cgst, sgst, igst` columns but there is **no rule** for when to charge IGST (interstate)
vs CGST+SGST (intrastate). This requires the seller's state and the store's place-of-supply (from
GSTIN state code). Without it, tax lines and GSTR-1 will be wrong for any interstate sale.
Also missing: e-way-bill threshold (₹50,000) and e-invoice turnover-applicability rule (both say
"if applicable" with no defined trigger); reverse charge; GSTIN validation; and rounding of tax.
**Fix:** Add company state config, derive supply type from GSTIN state codes, and encode thresholds.

### 3.4 🔴 Atomicity / transactional layer is asserted but unspecified
The spec repeatedly relies on atomic multi-row changes — "Accepted → balances move atomically"
(§3.2), EOD "executes as a single transaction … if ANY step fails → rolls back" (§6.6),
`production_plan_recalc_lock` advisory locking (§6.10) — but the tech stack is
"Supabase (PostgreSQL) + RLS" with "Server Components + React Query." **RLS is authorization, not a
transaction boundary.** Atomic transfers, EOD posting, plan recalculation, and FY rollover need
server-side transactional code (Postgres functions / `rpc()` or Edge Functions with explicit
`BEGIN…COMMIT`). None is specified, and doing these from the client is unsafe.
**Fix:** Add a "server logic" layer to the architecture: list every operation that must be a DB
transaction/RPC (transfers, sale posting, EOD, recalc, reconciliation finalize, FY rollover), and
state that clients never write journal_lines/holdings directly — only via these functions.

### 3.5 🟠 Customer online payment ("Pay Now") has no mechanism
Portal offers "Make Payment / Pay now" (§9.1, §9.2) but the Integrations list (§9.10, §12) has no
payment gateway. Razorpay/Paytm appear only in the *reconciliation* context. Either wire a gateway
(and define the webhook → `payments` → journal flow) or relabel it "Record intent / Upload UPI
receipt" so the UI doesn't promise something unbuilt.

### 3.6 🟠 Non-functional requirements are essentially absent
No section covers: authentication hardening/MFA for admin, PII handling (customer phone/GSTIN,
employee data), **backups & disaster recovery**, data-retention/archival (esp. statutory 6–8 yr for
GST records), **audit-log coverage** (only BOM/AVL changes are logged — §5.11; not sales edits,
balance adjustments, expense approvals, back-dated entries), rate-limiting, migrations strategy,
environments (dev/stage/prod), observability/error tracking, and a **testing strategy** (the
accounting and reconciliation engines especially need property/golden-file tests).
**Fix:** Add a "Non-Functional Requirements" section; make `audit_log` universal for all
money/stock-affecting mutations and all approvals.

### 3.7 🟠 No phasing / MVP / roadmap
The document specifies ~21 major modules with zero prioritization. This is 12–18+ months of work
described as if it ships at once. There is no "build order," no MVP boundary, no dependency map.
**Recommendation (suggested phasing):**
- **Phase 1 (core sell-and-collect):** Items, price lists, customers/stores, orders, challan,
  sale/invoice (official+unofficial), payments, customer ledger, basic stock, user holdings +
  transfers, minimal dashboard.
- **Phase 2 (accounting + purchasing):** Double-entry engine, purchases/vendors, expenses,
  GST reports, FY periods.
- **Phase 3 (manufacturing):** BOM, production plan, EOD, job cards, WIP/wastage, WA valuation.
- **Phase 4 (field + growth):** Routes/visits, CRM, schemes, bank reconciliation, payroll,
  WhatsApp/SMS, i18n.
Ship each phase usable on its own.

### 3.8 🟡 Other smaller gaps
- **Returns to holding vs WH** (§9.8): if a returned item re-enters a user's holding, its WA cost
  basis and the COGS reversal interaction (§16.9) is undefined.
- **Cheque held as "cash"** (§9.7): cheque "collected by user → user's holding until cleared" mixes
  an unrealized instrument into a cash figure that gets handed over. Track cheques in
  `cheque_registry` only; don't add them to `user_cash_holdings.amount`.
- **Rounding / currency:** no rounding policy (invoice totals, tax, WA to how many decimals),
  no rounding ledger. `item_suppliers.currency` implies multi-currency but nothing else supports it.
- **Timezone:** midnight auto-lock (§6.9) and daily forms are date-critical but no timezone is
  fixed (should be Asia/Kolkata); DST is irrelevant but server-UTC vs local-midnight must be stated.
- **Number series concurrency:** FY-scoped `entry_no`, `invoice_no`, `order_no` need gap-free
  sequential allocation under concurrency — define how (sequence table with row lock), especially
  for statutory invoice numbering.
- **Barcode uniqueness / batch:** "fixed barcode per SKU" (§9.5) but batch tracking on FG — how are
  batches identified at scan time if the barcode is SKU-level only?

---

## 4. Correctness / Example Errors

### 4.1 🟡 Reconciliation example figures don't agree with each other
- §19.6.1 screen: Statement ₹2,85,000 · System ₹2,87,350 · Diff −₹2,350.
- §19.8.1 BRS: Bank ₹2,85,000 → Balance as per Books ₹3,05,150, "Reconciled Difference ₹0".
The two illustrative balances (₹2,87,350 vs ₹3,05,150) are inconsistent, and the BRS direction is
questionable (issued cheques not yet cleared should be **added to** the bank balance to reach the
book balance — the sign treatment in the example is muddled). Recompute the worked example end-to-end.

### 4.2 🟡 OEE formula is off
§20.8.3: `OEE = (actual_qty/planned_qty) × (uptime/planned_hours)`. Standard OEE =
Availability × Performance × Quality. This captures roughly Availability × (a
performance/quantity proxy) but omits Quality (good/total) — and `actual_qty/planned_qty` conflates
performance with schedule attainment. Either rename it "Schedule Attainment" or compute true OEE
(Availability = runtime/planned; Performance = actual/(runtime×rate); Quality = good/actual).

### 4.3 🟡 Stage-2 costing example rounding (§16.9)
23,500 empty bottles ÷ 24 per case = 979.17 cases, example uses 978 cases and doesn't show what
happens to the leftover 4–28 bottles (fractional case / WIP remainder). Define handling of
partial cases at Stage 2.

### 4.4 🟡 Buffer allocation vs order priority (§6.2)
Buffer top-up runs only "after all real orders are allocated **for a day**," but the outer loop is
per-day, so a low-priority buffer run on Day 1 can consume material/WIP that a high-priority order
on Day 2 then lacks (materials are a hard constraint drawn from the same pool). Consider reserving
material for the whole-horizon order book before filling buffer, or making buffer strictly yield to
future committed orders.

### 4.5 🟡 `qty_remaining` derived column
`orders.qty_remaining (derived: qty_total − qty_allocated)` — if truly derived it shouldn't be a
stored column (or must be a generated column / view) to avoid a fourth cache-drift source.

---

## 5. Risks (business, compliance, operational)

### 5.1 🔴 Unofficial (non-GST) sales — compliance & legal exposure
The "Official / Unofficial" toggle explicitly designs for sales that are **excluded from GST
returns** while still counted in internal books (§4.8, §7/§8, §9.3.2). This is, in substance,
parallel bookkeeping that omits taxable supplies from statutory filings — a significant legal and
tax-evasion risk for the business and a reputational/liability risk for whoever builds it. At
minimum this should be surfaced to the owner explicitly as a risk, not buried as a feature.
Safer framings to consider: treat all supplies as taxable (composition scheme if turnover-eligible),
or model "cash sales" that are still reported. I'd recommend getting a CA/tax advisor sign-off on
this design before building it. (Flagging as an auditor; not a judgment on your operations.)

### 5.2 🟠 WhatsApp unofficial QR API (whatsapp-web.js)
§9.10/§12.1 rely on an unofficial WhatsApp Web automation. This violates WhatsApp's ToS and numbers
get **banned** regularly; it breaks on WhatsApp updates and can't scale. For anything customer-facing
at volume, use the official WhatsApp Business Cloud API (template approval required). Keep the
unofficial path only as an explicitly-accepted stopgap.

### 5.3 🟠 Offline PWA scope is very ambitious
§17.9 promises offline route operation with local queuing, temp IDs, and "last-write-wins" for a
system whose core is transactional money/stock. LWW on financial/stock data causes silent data loss.
The doc already (wisely) forbids offline payments — extend that discipline: keep offline strictly to
read + "capture intent," and make all money/stock mutations server-authoritative on sync with
conflict detection, not LWW. Budget real time for this; it's a project by itself.

### 5.4 🟠 Five-language i18n as a launch requirement
English + Tamil + Telugu + Kannada + Malayalam across a UI this large is a large, ongoing
translation + testing + font/number-format burden (Indic numerals, currency). Recommend
English-first at launch, then add languages per phase; don't gate v1 on all five.

### 5.5 🟡 Holdings model operational load
Every user carrying stock+cash holdings with accept/reject at each hop is powerful but creates many
pending-transfer states and reconciliation surface. Ensure there's an escalation/auto-timeout for
stale pending transfers, and a forced end-of-day reconciliation, or holdings will accumulate
un-handed-over balances.

### 5.6 🟡 Single 3,267-line spec is itself a risk
It's already drifting (numbering). Split into per-module specs with a shared glossary + data
dictionary + one canonical ERD, and keep a cross-reference index. Add a one-page "invariants" list
(e.g., "journal_lines is the only source of truth for money"; "every stock/money mutation goes
through an RPC and writes audit_log").

---

## 6. What's Genuinely Good (keep as-is)
- Store-centric hierarchy with per-store GSTIN/ledger/outstanding — correct for this business.
- AVL/item model decoupling sourcing from recipe (§5) — the right pattern (just reconcile §14.1).
- Order-quantity-level rolling plan with hard material + WIP constraints, Day-0 lock state machine,
  and serialized recalc lock — strong and realistic.
- Double-entry engine with FY periods, audited-entry immutability, reversing-entry corrections, and
  live reports from journal_lines — the correct backbone (just make it the *only* backbone: §2.1).
- Bank reconciliation deep-dive (ad-hoc imports, bulk UPI settlement, cheque lifecycle, N:M matches)
  — well beyond typical specs.
- Job cards bridging plan→execution with EOD pre-fill — good closed loop.
- Weighted-average valuation with exact original-COGS reversal on returns — correct approach.

---

## 7. Prioritized Fix List

| # | Item | Severity | Section |
|---|------|----------|---------|
| 1 | Single source of truth for balances (demote caches to read-models) | 🔴 | 2.1 |
| 2 | Per-payment-method journal templates (fix cash-to-user-only) | 🔴 | 2.2 |
| 3 | Pricing / rate master + resolution | 🔴 | 3.1 |
| 4 | GST: reverse tax on returns; place-of-supply/IGST; thresholds | 🔴 | 2.3, 3.3 |
| 5 | Define transactional/RPC layer (atomicity) | 🔴 | 3.4 |
| 6 | Credit limit / payment terms / due dates | 🔴 | 3.2 |
| 7 | Compliance sign-off on unofficial-sales design | 🔴 | 5.1 |
| 8 | Renumber sections/subsections; fix Section 19 dup + broken refs | 🟠 | 1.1–1.3 |
| 9 | Reconcile BOM-references-item vs category | 🟠 | 2.5 |
| 10 | Canonical sale_lines table; drop JSON blobs | 🟠 | 2.4 |
| 11 | Order/challan state machine + partial fulfillment | 🟠 | 2.6 |
| 12 | Non-functional reqs: audit-log coverage, backups, retention, testing | 🟠 | 3.6 |
| 13 | Phasing / MVP roadmap | 🟠 | 3.7 |
| 14 | WhatsApp official API; offline conflict policy; i18n phasing | 🟠 | 5.2–5.4 |
| 15 | UOM conversions; rounding/timezone/number-series concurrency | 🟡 | 2.8, 3.8 |
| 16 | Worked-example fixes (reconciliation figures, OEE, Stage-2 rounding) | 🟡 | 4.x |

