# Fine-Grained Access Control — Design

Date: 2026-08-12
Status: Approved (catalog + migration approach confirmed section-by-section with the user)

## Problem

The permission catalog is coarse: single codes bundle multiple distinct operations and even entire modules. Examples: `invoice.view` covers invoices AND cash memos, `accounting.manage` gates expenses AND assets AND loans AND documents, `report.view_all` gates P&L / GST / trial balance / costing under one read, `field.view` bundles routes and fleet, and several real operations have no permission of their own (`void_invoice`, `update_order`, `upsert_bom`, `reverse_production_run`, `reverse_journal`, and the WhatsApp inbox is gated by the unrelated `customer.manage`).

Business need: different operators are entitled to different slices — e.g. agents see and raise cash memos but not tax invoices; the accountant sees invoices; GST rights must not expose cost-to-make margins.

## Goals

1. Split every coarse code where real, distinct sub-actions exist (per module).
2. Keep atomic actions as single toggles; do not create admin overhead where a split earns nothing.
3. No user loses effective access in the cutover (expansion is superset-only).
4. Preserve the security invariant: the DB (`has_permission`) is the boundary; JWT claims, route-guard, and nav are UI-speed caches of the same codes.
5. Immutable financial documents are never literally edited or deleted — void/reverse RPCs are their modify/delete axis, audited and mapped honestly to toggles.

## Non-Goals

- No change to the enforcement machinery: `has_permission()`, `role_permissions`, `user_permission_overrides`, RLS policy model, token hook (0032), route-guard, nav, or admin toggle UI all stay as-is structurally. This is a catalog + checks change.
- No per-record row-level splits (branch-scope stays as today).
- No new UI primitives.

## Catalog — Proposed Fine-Grained Toggles

### Sales & Invoicing

Today: `invoice.view` (invoices + cash memos), `order.view`, `order.create`, `orders.approve`.

| New code | Binds to | Why |
|---|---|---|
| `invoice.view` (kept) | invoice register / tax invoice detail | agent-vs-accountant visibility |
| `cashmemo.view` (new) | cash memo list / detail | agent-vs-accountant visibility |
| `invoice.create` (new) | `post_invoice` official | invoice-raising is HQ duty |
| `cashmemo.create` (new) | `post_invoice` is_official=false | counter/road staff raise memos |
| `invoice.payment` (new) | `record_receipt` | collectors take money without raising docs |
| `invoice.void` (new, missed) | `void_invoice` | senior-only reversal |
| `order.view` (kept) | order book | order vs delivery desk differ |
| `order.create` (kept) | `place_order` | |
| `order.approve` (new) | `approve_order` | distinct approval step |
| `order.cancel` (new) | `cancel_order`, `close_partial_order` | canceler vs approver |
| `order.edit` (new, missed) | `update_order`, `update_order_line` | drafting/amendment duty |
| `challan.view` (new) | delivery challan list | agents are the delivery desk |
| `challan.record` (new) | `create_challan`, `set_challan_status`, `post_delivery` | agents are the delivery desk |

### Buy & Stock

Today: `purchase.view`, `purchase.manage`, `supplier.view`, `customer.manage`, `item.view`, `pricing.manage`, `stock.view`, `stock.transfer`.

| New code | Binds to | Why |
|---|---|---|
| `purchase.view` (kept) | PO/GRN list, supplier balance | |
| `purchase.create` (new) | `place_purchase_order`, `post_grn`, `post_grn_from_po`, `record_purchase_return` | ordering/GRN duty |
| `purchase.record_bill` (new) | `post_supplier_bill`, `post_bill_from_grn` | accounts bill duty |
| `purchase.pay` (new) | `pay_supplier`, `supplier_opening_balance` | payment authorization |
| `supplier.view` (kept) | | single action |
| `customer.manage` (kept) | customer/store CRUD | `credit.override` already separate |
| `item.view`, `pricing.manage`, `stock.view`, `stock.transfer` (kept) | | atomic actions |
| `stock.custody` (new, missed) | holdings / handover custody ledger | currently open to every user; admin-only for others' custody |

### Manufacturing

Today: `bom.view`, `production.run`, `report.view_all` (costing).

| New code | Binds to | Why |
|---|---|---|
| `bom.view` (kept) | recipes read | |
| `bom.manage` (new, missed) | `upsert_bom` | formula approval vs reading |
| `production.run` (kept) | `post_production_run` | plant operators |
| `production.jobs` (new, missed) | `upsert_job_card`, `set_job_card_status` | job cards are a distinct screen |
| `production.reverse` (new, missed) | `reverse_production_run` | senior-only reversal |
| `costing.manage` (new) | `run_process_costing`, `compute_loaded_cost` | triggering a run is an action |
| `production.devices` | stays `settings.manage` | |

### Accounting

Today: `journal.view`, `journal.post`, `accounting.manage` (expenses + assets + loans + documents), `report.view_all`, `bank.reconcile`.

| New code | Binds to | Why |
|---|---|---|
| `journal.view` (kept) | ledger | |
| `journal.post` (kept) | journal entries, vouchers | |
| `journal.reverse` (new, missed) | `reverse_journal` | senior-only reversal |
| `expense.manage` (new) | `record_expense`, `approve_expense`, `reject_expense`, `topup_petty_cash` | petty-cash custodians |
| `asset.manage` (new) | `create_fixed_asset`, `dispose_fixed_asset`, `run_depreciation` | fixed-asset register duty |
| `loan.manage` (new) | `create_loan`, `pay_emi` | |
| `documents.manage` (new, missed) | documents upload/edit | decoupled from `accounting.manage` |
| `report.pnl` (new) | P&L / Balance Sheet | |
| `report.gst` (new) | `generate_gst_invoice`, `import_gstr2b`, `reconcile_gstr2b` | GST filing duty |
| `report.trial_balance` (new) | trial balance | |
| `report.costing` (new) | cost-to-make reports | confidential margins — GST viewer must not see |
| `bank.reconcile` (kept) | `import_bank_statement`, `match_bank_txn`, `post_reconciliation_adjustment` | reconcilers |
| `bank.cheque` (new) | `register_cheque`, `set_cheque_status`, `bounce_cheque` | cheque clerk vs reconciler |
| `credit.override` (kept) | credit block override | |

### Field & People

Today: `field.view`, `crm.view`, `commission.view`, `hr.view`, `hr.manage`.

| New code | Binds to | Why |
|---|---|---|
| `field.routes` (new) | routes/visits read | route-deviser vs driver |
| `field.fleet` (new) | `post_fuel_log` | road duty |
| `field.transfer` (new) | `create_transfer`, `respond_transfer`, `cancel_transfer` | consolidates handover with `stock.transfer` family |
| `crm.view` (kept) | complaints | |
| `crm.manage` (new) | `convert_lead`, `post_complaint_credit_note` | lead conversion is sales duty |
| `commission.view` (kept) | targets read | |
| `commission.manage` (new) | `compute_commissions`, `post_commission_run` | sales manager computes; all view |
| `hr.view` (kept) | pay config read | cohesive |
| `hr.manage` (kept) | `compute_payroll`, `post_payroll_run`, `pay_payroll_line`, pay config edit | cohesive |

### Messaging & Admin

Today: WhatsApp inbox gated by `customer.manage`, config by `settings.manage`; `roles.manage`, `audit.view`, `license.view`, `settings.manage`.

| New code | Binds to | Why |
|---|---|---|
| `whatsapp.inbox` (new, missed) | `whatsapp_insert_message`, mark_read, delete_conversation, `archive_notifications` | inbox was gated by wrong module |
| `whatsapp.manage` (new, missed) | `whatsapp_save_config`, `whatsapp_template_save`, template_delete | explicit template/config control |
| `roles.manage`, `audit.view`, `license.view`, `settings.manage` (kept) | | atomic |

## Summary counts

- New codes: 35 (cashmemo.view, cashmemo.create, invoice.create, invoice.payment, invoice.void, order.approve, order.cancel, order.edit, challan.view, challan.record, purchase.create, purchase.record_bill, purchase.pay, stock.custody, bom.manage, production.jobs, production.reverse, costing.manage, journal.reverse, expense.manage, asset.manage, loan.manage, documents.manage, report.pnl, report.gst, report.trial_balance, report.costing, bank.cheque, field.routes, field.fleet, field.transfer, crm.manage, commission.manage, whatsapp.inbox, whatsapp.manage).
- Kept atomic: 15 existing codes (supplier.view, item.view, pricing.manage, stock.view, stock.transfer, credit.override, journal.view, journal.post, hr.view, hr.manage, roles.manage, audit.view, license.view, settings.manage, bank.reconcile).
- Retired (replaced by fine sets): `invoice.view` (into invoice.view + cashmemo.view), `purchase.manage`, `accounting.manage`, `report.view_all`, `field.view`, `orders.approve` (into order.approve).

## Missed Controls Added

1. `order.edit` — update_order / update_order_line
2. `cashmemo.edit` — amend unposted memo (via `convert_invoice_type` where allowed)
3. `invoice.void` — void_invoice
4. `production.reverse` — reverse_production_run
5. `journal.reverse` — reverse_journal
6. `bom.manage` — upsert_bom
7. `whatsapp.inbox` — previously wrong-module (`customer.manage`)
8. `whatsapp.manage` — template/config
9. `cash.deposit` — bank deposits split from `cash.transfer`
10. `stock.custody` — holdings/handover view (previously open to all)
11. `documents.manage` — decoupled from `accounting.manage`

## Migration & Cutover (single migration)

Principle: old effective access maps 1:1 onto the fine sets via an expansion map, applied in one transaction. The DB is the gate — a lagging frontend can neither leak nor lock anyone out.

1. Insert new codes into `permissions` (append-only `on conflict do nothing`).
2. Expansion map (data): for each retired coarse code, expand grants to the fine set in BOTH `role_permissions` and `user_permission_overrides` (deny/grant respect the same split). Expansion is superset-only for view/keep roles:
   - `invoice.view` -> `invoice.view` + `cashmemo.view`
   - `purchase.manage` -> `purchase.create` + `purchase.record_bill` + `purchase.pay`
   - `accounting.manage` -> `expense.manage` + `asset.manage` + `loan.manage` + `documents.manage`
   - `report.view_all` -> `report.pnl` + `report.gst` + `report.trial_balance` + `report.costing`
   - `field.view` -> `field.routes` + `field.fleet` + `field.transfer`
   - `orders.approve` -> `order.approve`
   - `cash.transfer` -> `cash.transfer` + `cash.deposit`
   - `customer.manage` keeps its grants; `whatsapp.inbox`/`whatsapp.manage` are ADDED for roles that had WhatsApp visibility (superset; no revocation in this migration).
3. Rewire enforcement per code, in place: swap `has_permission('old')` -> `has_permission('new')` inside RPC bodies, RLS policies, route-guard rules, and nav. Done module-by-module (Sales first).
4. Validation before commit: recompute every user's effective access pre/post and diff — expect supersets only, zero regressions. Security advisors re-run afterward.
5. Retirement: old coarse codes remain as dormant catalog entries for one release (zero references), then a follow-up cleanup removes unreferenced codes.

## Toggle Sync (derived, not duplicated)

- Admin Permissions & access UI already lists every `permissions` row grouped by group; new codes render automatically with their descriptions.
- Route-guard + nav read the same codes; JWT claims refresh via the existing `token_version` bump when toggles change -> UI gates update on next request.
- No separate configuration mechanism.

## UI Reactivity

Yes — when an admin flips a toggle (or changes a role), the user's UI reacts:

1. The mutation RPC bumps that user's `token_version`.
2. On the user's next request (load / navigation / refresh), the token hook mints a fresh JWT; claims carry the new perm set.
3. Route-guard (middleware + layout re-check) and the sidebar nav read those claims -> the menu item appears/disappears and the URL is blocked on the next request.

Caveats (honest):

- Live pages linger: a page already rendered does not force-close mid-session; it updates on next navigation/refresh. The DB still refuses any action immediately — mutation RPCs check live tables, so no partial writes and no unauthorized mutations.
- Optional improvement considered: use the existing `get_my_token_version()` probe to make the shell poll and self-refresh the nav while a user is idle, so revoked menus drop off without a reload.

## Sequencing (implementation)

- A. Migration + expansion (DB) with pre/post validation
- B. RPC + RLS rewiring module-by-module: Sales, then Buy & Stock, then Manufacturing, then Accounting, then Field & People, then Messaging & Admin
- C. route-guard + nav + permission-groups labels
- D. Admin UI (structural no-op; verify rendering)
- E. Post-deploy audit + per-module smoke + advisor rerun

## Verification

- `npm run typecheck` + `npm run build` (from `app/`) after every app-facing task.
- DB: pre/post effective-access diff (zero regressions), advisor rerun, and a per-module smoke (a role with only `cashmemo.create` cannot post an official invoice).
- Lint is not runnable in this repo (no ESLint config) — pre-existing.