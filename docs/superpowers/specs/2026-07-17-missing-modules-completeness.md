# Completeness Map — What's Missing to Ship a Complete System

**Companion to:** `2026-07-16-business-management-system-design.md` and `2026-07-17-design-spec-audit.md`
**Date:** 2026-07-17
**Question answered:** What modules/entities/capabilities are entirely absent (not just inconsistent) to make this a complete, go-live-ready business management application for a water-bottle manufacturer + retail/wholesale distributor.

Legend: 🔴 go-live blocker / legally mandatory · 🟠 needed for a "complete" product · 🟡 expected/valuable
Tag: **[water]** = specific to this industry (a generic ERP review would miss it).

---

## A. Water-business-specific modules that are legally/operationally mandatory  [water]

These are the standout gaps a generic reviewer misses. For packaged drinking water in India they are not optional.

| # | Missing | Why it matters | Sev |
|---|---------|----------------|-----|
| A1 | **Returnable container / jar-deposit tracking** | 20L jars (and crates) are *returnable assets*. You need per-customer empties-out / empties-in balances, a refundable deposit ledger, deposit on invoice, and reconciliation of jars in the market. The spec treats "20L jar" as a normal finished good — so jars sold are expensed and never come back in the model. This is core to water distribution economics. | 🔴 |
| A2 | **Quality control / lab testing** | FSSAI requires periodic water testing (source, treated, finished; microbiological + chemical). Need batch QC records, test parameters, pass/fail, hold/release of batches, rejection handling. Batches exist in the spec but carry **no QC gate** before they can be sold. | 🔴 |
| A3 | **Licenses & certifications register** | FSSAI license, **BIS/ISI mark (IS 14543)**, Pollution Control Board consent, trade license, Legal Metrology (packaged-commodity/MRP) — with expiry + renewal reminders. None exist. Selling without a valid, tracked license is a shutdown risk. | 🔴 |
| A4 | **Machine maintenance & breakdown** | Blowing machine + filling line are the whole business. Preventive-maintenance schedule, breakdown log, spare-parts consumption. The plan references "breakdown" calendar exceptions but there's no maintenance module feeding them. | 🟠 |

---

## B. Core ERP modules that any business app needs — and this one lacks

| # | Missing | Note | Sev |
|---|---------|------|-----|
| B1 | **Settings / company configuration** | No admin module to set company profile, GSTIN/state, FY, tax rates, number series, shift defaults, thresholds, reorder rules, roles. Without this the app can't be *set up*. It's the first screen that must exist. | 🔴 |
| B2 | **User & access management (lifecycle)** | Invite/deactivate users, reset password, assign/edit roles, MFA for admin/manager, custom permission overrides. The role *table* exists; the *admin UX + policy* to manage humans does not. | 🔴 |
| B3 | **Pricing / rate master** | (Also in audit §3.1.) No selling-price list, no per-customer/tier/wholesale-vs-retail pricing, no slab pricing, no line-level ad-hoc discount + approval. Orders carry a `rate` from nowhere. | 🔴 |
| B4 | **Credit management** | (Audit §3.2.) Credit limit, payment terms, due-date derivation, over-limit order block, overdue interest. Portal already *shows* due dates/aging that can't be computed. | 🔴 |
| B5 | **Quotation / Proforma** | B2B distribution typically quotes before ordering. No quote → order conversion. | 🟡 |
| B6 | **Generic approval engine** | Approvals are hard-coded per module (orders, expenses, schemes, purchases, adjustments, payroll). No single configurable authorization matrix (who can approve what, up to what amount). | 🟠 |

---

## C. Financial / accounting completeness

The double-entry engine is good but only *auto-posts*. A real accounting system also needs manual and statutory pieces.

| # | Missing | Note | Sev |
|---|---------|------|-----|
| C1 | **Manual vouchers** | Accountant-entered journal / contra / payment / receipt vouchers for adjustments, provisions, opening entries, corrections. Engine only posts from transactions. | 🔴 |
| C2 | **Opening balances & go-live data migration** | How do you start? Import existing customers, suppliers, stock, ledger balances, outstanding invoices, WA cost. No migration/onboarding workstream — this is a launch blocker. | 🔴 |
| C3 | **Fixed assets & depreciation** | Machines/vehicles/building. Asset register + depreciation schedule needed for correct P&L and Balance Sheet (and Income Tax / Companies Act). Absent. | 🟠 |
| C4 | **TDS / TCS** | India-statutory: TDS on rent/contractor/professional payments; **TCS on sale of goods (206C(1H))** over threshold — relevant to wholesale. No withholding logic anywhere. | 🟠 |
| C5 | **Loans / EMI** | A "SBI Loan" widget appears (§19.8.3) but there's no loan account, interest accrual, or EMI schedule module. | 🟡 |
| C6 | **Petty cash / company cash box** | Distinct from user holdings — office cash for small expenses. Not modeled. | 🟡 |
| C7 | **Cost centers / budgeting** | Cost-center tagging (factory vs distribution) and budget-vs-actual. Cash-Flow statement is listed as a report but there's no supporting cash-flow classification. | 🟡 |

---

## D. Purchasing & supply-chain depth

| # | Missing | Note | Sev |
|---|---------|------|-----|
| D1 | **PO → GRN → 3-way match** | Spec says PO is "optional, add later." For a manufacturer, purchase order, goods-receipt note, and PO/GRN/bill matching (with QC on receipt) is standard control. Currently purchases are a single approved form. | 🟠 |
| D2 | **GSTR-2B ITC reconciliation** | To legally claim input tax credit you must reconcile purchases against suppliers' filings (GSTR-2B). Entirely absent — this is one of the biggest real-world GST pains. | 🟠 |
| D3 | **Supplier advances / debit-balance handling** | Advance to vendor, TDS on payment, vendor aging. Partially implied, not modeled. | 🟡 |

---

## E. Operations, logistics & sales-force

| # | Missing | Note | Sev |
|---|---------|------|-----|
| E1 | **Vehicle & driver / trip management** | Routes exist but *vehicles* don't. Delivery vehicle master, driver assignment, trip sheet, fuel log (fuel is an expense *category* with no vehicle to attribute it to), vehicle maintenance. | 🟠 |
| E2 | **Sales targets & commissions/incentives** | Marketers/agents drive orders, but there's no target-vs-achievement or commission/incentive computation — only attendance/payroll. Usually essential for a sales-led distributor. | 🟠 |
| E3 | **Document management** | General repository for contracts, KYC, agreements, licenses (Storage holds only bills/receipts today). | 🟡 |

---

## F. Platform / foundation (cross-cutting, several are go-live blockers)

| # | Missing | Note | Sev |
|---|---------|------|-----|
| F1 | **Backup, disaster recovery, data retention** | No DR plan; GST/Income-Tax records must be retained ~6–8 years. | 🔴 |
| F2 | **Universal audit log** | Only BOM/AVL changes are logged (§5.11). Every money/stock mutation, approval, back-dated entry, and balance adjustment must be audited. | 🔴 |
| F3 | **Security & privacy** | MFA, password policy, session mgmt, PII handling for customer/employee data, **DPDP Act 2023** compliance, security review. | 🟠 |
| F4 | **Testing strategy** | Accounting + reconciliation + WA-costing + plan-recalc engines need golden/property tests. None specified. | 🟠 |
| F5 | **Observability & ops** | Logging, error tracking, monitoring/alerting, environments (dev/stage/prod), migrations, CI/CD. | 🟠 |
| F6 | **Notifications beyond in-app** | Notifications are in-app only. No email channel, no daily digest, no escalation for stale pending transfers/approvals. | 🟡 |
| F7 | **Global search** | No cross-entity search (customer/order/invoice/item). Expected in a daily-use back-office app. | 🟡 |
| F8 | **External API / accounting export** | No public API/webhooks; many Indian businesses need a **Tally export** for their CA. | 🟡 |
| F9 | **Performance/scale plan** | Reports "always live from journal_lines" + frequent plan recalcs need an indexing/materialization strategy at volume. | 🟡 |

---

## G. "Minimum to be a *usable* product" (go-live blockers only)

Even before the full list, the app cannot go live without these:
1. **Settings/company setup** (B1) + **User management** (B2)
2. **Pricing master** (B3) + **Credit terms** (B4)
3. **Opening-balance / data migration** (C2) + **Manual vouchers** (C1)
4. **Returnable-jar/deposit tracking** (A1), **QC gate** (A2), **License register** (A3)  [water]
5. **Universal audit log** (F2) + **Backup/DR & retention** (F1)
6. The 🔴 correctness fixes from the audit (single source of truth, payment-method journals, GST on returns, place-of-supply, transactional layer)

Everything else layers on top per the phased roadmap in the audit (§3.7).

---

## H. Quick coverage scorecard

| Domain | Spec coverage | Biggest missing piece |
|--------|---------------|-----------------------|
| Sales / Orders | Strong | Pricing master, quotations, credit control |
| Manufacturing | Strong | QC gate, maintenance, returnable jars |
| Inventory | Good | UOM conversions, returnable containers |
| Accounting | Good backbone | Manual vouchers, assets/depreciation, opening balances |
| GST | Partial | Place-of-supply/IGST, GSTR-2B ITC, returns tax, TDS/TCS |
| Purchasing | Basic | PO/GRN/3-way match, 2B reconciliation |
| Field force (routes/CRM) | Strong | Vehicles, commissions |
| HR/Payroll | Basic | — (adequate for scope) |
| Banking | Strong | Loans/EMI |
| **Platform/setup** | **Largely absent** | Settings, users, migration, backup, audit, security |
| **Compliance (water)** | **Absent** | FSSAI/BIS/QC, licenses, returnable-deposit  [water] |
