# Business Logic, Data Integrity & Security Audit

**Date:** 20 October 2026  
**Scope:** `NEWBIZZ` web app, Supabase schema/RPCs, and shipped Android APK `1.2.9` (versionCode 17)  
**Method:** source review, read-only queries against the live Supabase project, APK manifest/bundle inspection. No production writes, no payment-gateway calls, no live portal login (no portal account was available).  
**Verdict:** **Not ready for unsupervised scale-up.** The core stock/WAC posting is sound and reconciles to the GL, but the accounts-receivable subledger, returns/credit-note flow, portal tenant isolation, and the shipped APK's collection path have critical defects.

---

## 1. What is actually working

These controls were verified and should be preserved while fixing the rest:

- **Stock valuation ties to the GL.** Live stock value was `₹27,752.02`; the sum of inventory GL accounts (`1210 + 1220 + 1230 + 1240`) was `₹27,752.00` — a 2-paise rounding difference. Weighted-average costing is posting correctly.
- **Stock cannot go negative.** `post_stock_move` raises on an outflow that would take `qty_on_hand` below zero.
- **Sales and receipts are individually transactional.** Each RPC posts its journal, stock move, document, ledger row, and audit row in one transaction; an exception rolls the whole RPC back.
- **Some good guard rails exist.** `record_receipt` checks invoice ownership and over-allocation; `void_invoice` locks the invoice and refuses if payments are allocated; `record_sales_return` prevents over-returning an invoice line; `post_invoice`, `post_delivery`, `void_invoice`, and `record_sales_return` check named permissions.
- **No service-role key in the APK.** The bundle contains no `service_role` or Supabase service secret; the mobile client uses the public anon key. Session tokens are stored with `expo-secure-store`.
- **RLS is enabled broadly and anon has almost no direct policy access.** The exceptions are listed below.

---

## 2. Live numbers that expose the gaps

| Check | Live value | Meaning |
|---|---:|---|
| Stock value vs inventory GL | `27,752.02` vs `27,752.00` | **Healthy** (rounding only) |
| AR GL account `1130` | `1,394.00` | Includes one delivery that has not been invoiced |
| Invoice subledger outstanding | `1,054.00` | Delivery-only `₹340` is invisible to invoice-based reports |
| Customer ledger latest `balance_after` | `1,257.00` | **Wrong**; ledger rows sum to `1,394.00` because of a timestamp tie |
| Customer ledger after `rebuild_customer_ledger()` would be | ~`1,624.00` | Rebuild includes void invoices and adds delivery + invoice; overstates by `₹230` |
| Receipts | 2 rows, both `mode='cash'`, both `collected_by=NULL` | Mobile receipt metadata is not being stored |
| Credit notes | 0 live rows | Return/credit-note defect is latent, not yet visible in production data |

The `₹340` delivery-only difference and the `₹137` ledger-ordering error are both reproducible from live data, not hypothetical.

---

## 3. Findings

### Critical

#### C1. Portal isolation fails open and can expose all customer and financial data

**Evidence**

- Every portal guard is a policy like `portal_deny_all` with `qual = NOT is_portal_principal()`.
- `is_portal_principal()` and `portal_customer_id()` read `current_setting('request.jwt.claim.sub', true)`.
- The repo already fixed this pattern elsewhere: `0048_fix_current_app_user_claims.sql` changed `current_app_user()` to read `request.jwt.claims` because the legacy per-claim GUC is not reliable on current PostgREST.
- The portal functions were not given the same fix.
- Broad `read_all_auth` policies (`using (true)`) exist on `customers`, `customer_stores`, `customer_receipts`, `sales_orders`, `customer_ledger`, `users`, `user_roles`, `roles`, `company_settings`, `stock_ledger`, `payment_methods`, `whatsapp_config`, and `whatsapp_messages`.

**Impact**

If `is_portal_principal()` returns `false` for a legitimate portal customer — which is the expected result when `request.jwt.claim.sub` is empty — every `portal_deny_all` policy becomes true, and the portal user inherits the broad `read_all_auth` policies. A customer could read:

- every customer and store,
- every receipt (amounts, references, bank details in notes),
- every sales order,
- every customer ledger and stock ledger row,
- staff users and role assignments,
- company settings and WhatsApp configuration/messages.

This is a cross-tenant data breach, not just an internal permission gap.

**Fix**

1. Change `portal_customer_id()` and `is_portal_principal()` to use `current_app_user()` (or the same `request.jwt.claims` lookup as `0048`), with a fallback to the legacy GUC only for old clients.
2. Prefer a dedicated `portal_customer_id` JWT claim injected by the access-token hook, rather than matching `auth.users.phone` on every request.
3. Replace the fragile `portal_deny_all` + `read_all_auth` pattern with explicit, role-aware policies. A portal principal should never satisfy a staff `read_all_auth` policy.
4. Add a pgTAP/RLS test that signs in as portal customer A and proves it cannot select customer B's rows from every table above, both directly and through RPCs.

**Verification:** create two portal customers with two auth users; direct `select` on each protected table returns only own rows (or zero), and RPCs return only own data.

---

#### C2. Several `SECURITY DEFINER` write RPCs have no authorization check

**Evidence (live grants: `authenticated` can execute unless noted)**

| Function | What it writes | Check inside? |
|---|---|---|
| `_post_credit_note(store, amount, reason, opts)` | Credit note + AR/revenue/GST journal | **None** |
| `post_scheme_credit_note(eligibility)` | Scheme credit note + journal | **None** |
| `customer_opening_balance(customer, amount, date, narration)` | AR/opening-equity journal | **None** |
| `receive_opening_stock(item, branch, qty, cost, date)` | Stock + inventory journal | **None** |
| `post_stock_move(item, branch, type, qty, cost, contra, …)` | Stock, COGS/inventory journal | **None** |
| `import_bank_statement(bank_account, rows, opts)` | Bank statement + transactions | **None** |
| `match_bank_txn(txn, target)` | Bank reconciliation match | **None** |
| `post_reconciliation_adjustment(bank_account, amount, kind, opts)` | Bank charge/interest journal | **None** |
| `rebuild_account_balances(fy)` | Deletes/rebuilds `account_balances` | **None** |
| `write_audit(action, entity, id, summary, diff, actor)` | Audit log | **None**; caller can forge `actor` |
| `notify(user, title, opts)` | In-app notification | **None**; can target any user |

`reverse_journal` correctly checks `journal.reverse`; `record_receipt`, `void_invoice`, `post_delivery`, and `record_sales_return` check permissions. The functions above do not.

**Impact**

Any authenticated user — including a low-privilege field agent, or a portal customer if they can reach the RPC — can:

- issue an unlimited credit note to any store, reducing AR and revenue;
- add an arbitrary opening receivable or opening stock;
- move stock with no journal, or with a chosen contra account;
- inject bank transactions and post bank adjustments;
- forge audit-log entries under another user's name.

This is a direct financial-fraud and audit-integrity path. It is more serious than a UI permission bug because PostgREST exposes these functions directly.

**Fix**

- Revoke `EXECUTE` from `public`, `anon`, and `authenticated` on all internal helpers: `_post_credit_note`, `post_scheme_credit_note`, `customer_opening_balance`, `receive_opening_stock`, `post_stock_move`, `import_bank_statement`, `match_bank_txn`, `post_reconciliation_adjustment`, `rebuild_account_balances`, `write_audit`, `notify`, `next_number`.
- Grant them only to `service_role`, and expose a thin, permission-checked wrapper for each user-facing operation.
- Add an explicit permission check at the top of every remaining definer RPC, and a CI test that enumerates `pg_proc` where `prosecdef = true` and `has_function_privilege('authenticated', oid, 'EXECUTE')` and asserts an allow-list.
- Add an audit-log integrity mechanism (hash chain or append-only trigger) so a compromised definer cannot silently rewrite history.

**Verification:** authenticated JWT calls each function and receives `not authorized`; only the intended role succeeds.

---

#### C3. The shipped APK cannot record cash/UPI collections, and sale + receipt is not atomic

**Evidence**

- Live `customer_receipts.method_id` is `NOT NULL` with no default.
- Live `record_receipt(p_header, p_allocations)` requires `method_id` and raises `record_receipt: method_id required` when absent.
- The APK's Hermes bundle contains `method_id` **0 times**, while it contains `record_receipt`, `deposit_account`, and `collected_by`.
- Source `mobile/app/record.tsx` (around lines 310–373) posts the invoice, then calls `recordReceipt` separately with `mode: "cash"` / `mode: "upi"`, `deposit_account: "2140"`, and no `method_id`.
- Source `mobile/src/features/record/CollectForm.tsx` (around lines 130–150) does the same: it builds `mode` and `deposit_account`, not `method_id`.
- The UI's fallback message is "Invoice posted but receipt failed … Record the receipt from Collect." Collect uses the same broken RPC, so the fallback also fails.

**Impact**

On the shipped APK:

1. Every sale with cash or UPI posts the invoice (stock, revenue, GST, AR) but **fails to post the receipt**. The customer physically paid, but the ledger shows the full amount outstanding.
2. The cash is not in `2140`, not attributed to a collector, and not in the day's collection KPI.
3. The user is told to retry in Collect, which fails the same way.
4. Because sale and receipt are separate RPCs, a network timeout after the invoice call can also leave an invoice with no receipt even if the client retries; there is no idempotency key or sale+payment transaction.
5. If a receipt does succeed on retry, the retry can double-post because `record_receipt` has no idempotency key.

This is the highest operational-risk finding because it silently loses the link between cash and the ledger.

**Fix** — implemented in `0130_receipt_method_compat.sql` (server side; works with the shipped APK):

- **Legacy mode shim:** when `method_id` is absent, `mode` is resolved against `payment_methods.code` (`cash` → `cash`, `upi` → `upi_agent`, `bank` → `bank_transfer`, …).
- **Stores `mode` and `collected_by`**, derived from the method destination and the calling user, so receipts stop being anonymous cash.
- **Derives `deposit_account`** from `payment_methods.destination`; an explicit override needs `accounting.manage` and must be a postable asset account.
- **`client_request_id` unique key** makes a retried request return the original receipt instead of posting a second one.
- **`record_sale_with_payment`** posts the invoice and its collection in one transaction for new clients; the mobile source now also sends `collected_by` and a request id.
- Still to do: rebuild and ship the APK so it uses the atomic RPC and sends `method_id` explicitly (`upi_agent` vs `upi_company`).

**Verification:** on a test APK, one cash sale and one UPI sale each produce one invoice, one receipt, a `2140`/`1120` debit, a non-null `collected_by`, and the correct `mode`; retrying the same request does not duplicate.

---

#### C4. No server-side price authorization; the customer portal lets customers set their own price

**Evidence**

- `place_order` accepts `unit_price` from the line JSON and uses it verbatim when present.
- `post_invoice` does the same: `v_price := coalesce(nullif(v_line->>'unit_price','')::numeric, effective_price(...))`.
- `app/src/components/portal/OrderForm.tsx` renders an editable **Price** input for each line and sends `unit_price`.
- `portal_create_order` passes those lines straight to `place_order`.
- There is no `price.override` permission, floor, ceiling, or audit check anywhere in the repo.
- Caveat: `portal_create_order` currently calls `place_order`, which requires the staff permission `order.create`. A normal portal customer is therefore likely to get `place_order: not authorized` and cannot place an order at all (see H13). The price hole is still real for any internal user with `order.create`, and it becomes a customer-facing exploit the moment portal ordering is given that permission.

**Impact**

- Any internal user with `order.create` can order any item at `₹0.01` or `₹0`; the order is created at that price and can be invoiced at that price.
- If the portal order gate is fixed by granting `order.create`, every portal customer can do the same; the portal UI already exposes the price field.
- Negative prices are also accepted; `v_qty > 0` is checked but `v_price` is not.
- This bypasses price lists, credit exposure, and margin controls.

**Fix**

- If `unit_price` is supplied, require `price.override`; otherwise always use `effective_price(item, price_list, qty)`.
- Reject `unit_price <= 0`, and reject prices outside a configured floor/ceiling (e.g. 90%–110% of list) unless an authorized override is recorded.
- Remove the editable price from the customer portal entirely; customers should order at their price list.
- Add an audit row for every override (who, item, list price, override price, reason).
- Apply the same rule to `post_invoice_from_order`, `fulfilOrderAsSale`, and any other line-accepting RPC.

**Verification:** portal order with `unit_price: 0` is rejected; internal order at 50% list is rejected without `price.override`; an authorized override creates an audit row.

---

#### C5. Returns and credit notes do not reduce the invoice or the customer ledger; rebuild resurrects voided invoices

**Evidence**

- `record_sales_return` (latest in `0102_fine_grained_sales.sql`, line 465) posts the credit-note journal, restocks, and inserts `credit_notes` + `sales_return_lines`.
- It never updates `invoices.amount_paid`/`status`, never inserts `customer_ledger`, and never allocates the credit note to the invoice.
- `_post_credit_note` (line 125 of `0023_credit_notes_schemes.sql`) also posts AR/revenue/GST and a credit-note row, but no `customer_ledger` and no invoice allocation.
- `customer_outstanding` and `portal_my_profile` sum `invoices.grand_total - amount_paid` only, so a return leaves the invoice fully outstanding.
- `rebuild_customer_ledger` (latest in `0060_delivery_as_value_event.sql`) rebuilds from:
  - **all** invoices with `grand_total > 0` — including `status='void'`,
  - delivered challans,
  - receipts.
  It ignores `credit_notes` and `sale_void` ledger rows.
- Live proof: two void invoices (`SL26270005`, 100; `CM26270116`, 130) have AR reversals in `journal_lines`, but `rebuild_customer_ledger` would include both as sales. It would produce ~`₹1,624` instead of the actual `₹1,394` — an overstatement of `₹230`.

**Impact**

- A customer who returns goods still shows the original invoice as fully due in the portal and in invoice-based reports.
- AR GL is reduced, but the subledger is not; the two diverge silently.
- Running `rebuild_customer_ledger` — the intended repair tool — makes it worse: voided invoices come back, delivery + invoice can double-count, and credit notes disappear.
- This is a data-integrity trap: the repair procedure corrupts the data it is meant to repair.

**Fix** — implemented in `0131_returns_and_ledger_rebuild.sql`:

- `credit_note_allocations` records how much of each credit cleared which invoice; `invoice_outstanding()` subtracts posted receipt allocations **and** posted credit-note allocations.
- `record_sales_return` and `_post_credit_note` now write a negative `customer_ledger` row (`txn_type='credit_note'`), apply the credit to the invoice (capped at what is due), and update `invoices.amount_paid`/status under an invoice row lock.
- `rebuild_customer_ledger` excludes void invoices, includes posted credit notes as negatives, includes a delivered challan only while its order is still `fulfilled` and has no live invoice (so a voided delivery-generated invoice does not come back as a delivery), and orders deterministically.
- `customer_ledger.seq` is the new monotonic ordering key for every latest-balance/statement read.
- Remaining: a credit larger than the invoice due is written to the ledger (correct for AR) but has no customer-advance row/view yet, so it is not yet visible as an applicable balance.
- Still to add: the invariant test `sum(invoice due)` + `delivery-only due` == `AR GL balance` == latest `customer_ledger.balance_after`.

**Verification:** post invoice 1,000, return 200; invoice due becomes 800; ledger has `-200`; AR GL is 800; rebuild produces the same 800. Void an invoice; rebuild does not bring it back.

---

#### C6. Company signature/QR are public and overwritable; the documents bucket is read/delete-all

**Evidence (live storage policies)**

- Bucket `party-images` is `public = true`.
- `party-images read` is granted to `{public}`.
- `party-images insert/update/delete` are granted to `authenticated` with only `bucket_id = 'party-images'`; no path/owner/role check.
- Live objects include:
  - `company/signature-…jpeg`,
  - `company/qr-…png`,
  - `company/logo-…png`.
- Bucket `documents` (`public=false`) has:
  - `documents read` for `authenticated` with only `bucket_id = 'documents'`,
  - `documents delete` for `authenticated` with only `bucket_id = 'documents'`,
  - `documents insert` for `authenticated` with only `bucket_id = 'documents'`.

**Impact**

- The authorized-signatory signature and payment QR are publicly readable and can be overwritten by any authenticated user (including a portal customer, if the portal can reach Storage). A changed QR can redirect customer payments.
- Any authenticated user can list and delete every document object, including invoices, purchase bills, and statutory documents, while the `documents` table row remains. That is silent data loss.
- The `documents` table RLS is also broad (`documents_insert` with check `true`), so metadata can be forged.

**Fix**

- Make `party-images` private, or split company assets into a private `company-assets` bucket.
- Restrict company asset writes to `settings.manage`/`admin` and a specific path prefix (`company/`).
- Restrict `documents` storage policies to the document owner or `documents.manage`, and validate that the object path matches an allowed entity the caller can access.
- Add MIME type and size allow-lists; the `documents` bucket currently has no `allowed_mime_types`.
- Treat the signature as a controlled asset: version it, audit changes, and never serve it from a public URL.

**Verification:** portal user cannot `list`/`download`/`delete` a document; a non-admin cannot overwrite `company/qr-*`; public URL for the signature returns 403.

---

#### C7. Two tracked HAR files contain live Intangles user tokens

**Evidence**

- `repo/imaxx.intangles.com.har` (20 MB) and `repo/imaxx.intangles.com copy.har` (46 MB) are tracked in git (`git ls-files` confirms).
- Both contain `Intangles-User-Token` headers with values (redacted here):
  - `L5hq…H5`
  - `XPKl…95`
- They were committed in `411acbe`.

**Impact**

Anyone with repository access — including a future contractor, a CI log, or a leaked clone — has a live-looking Intangles session token. Even if expired, the pattern normalizes committing captured customer traffic.

**Fix**

- Rotate/revoke both Intangles tokens now.
- Remove the HARs from the working tree and from git history (`git filter-repo` or BFG), then force-push with the team's coordination.
- Add `*.har` to `.gitignore`, plus a pre-commit secret scan.
- If traffic captures are needed for debugging, store sanitized fixtures outside the repo.

---

#### C8. Any authenticated user can change their own `users.status`, `branch_id`, and `token_version`

**Evidence**

- Live `users` policy `self_update` is `for update using (id = current_app_user()) with check (id = current_app_user())`.
- `users` has table-level `UPDATE` for `authenticated`; there are no column-level restrictions.
- `has_permission` and many dashboards read `users.status`; a suspended/disabled user can set it back to `active`.

**Impact**

A suspended user who still has a valid session can re-enable themselves, change branch scope, or reset `token_version` (depending on how it is used). This defeats the app-level suspension control. It also allows changing `full_name`/`phone`/`email` without an audit trail.

**Fix**

- Drop the broad `self_update` policy.
- Grant column-level `UPDATE (full_name, phone, email)` only, or replace it with a `update_my_profile` RPC that updates a fixed column list.
- Block `status`, `branch_id`, `token_version`, and role-bearing columns from any self-service path.
- If branch changes are needed, require `users.manage` and write an audit row.

**Verification:** a suspended user's direct `PATCH /users?id=eq.<self>` with `{status:"active"}` returns 403/0 rows; profile fields still update.

---

### High

#### H1. Credit limit double-counts the invoice being posted and ignores deliveries/open orders

**Evidence**

- `post_invoice` inserts the invoice and `invoice_lines`, then writes the ledger, then calls `check_credit_limit(v_cust, v_grand)` (`0102_fine_grained_sales.sql`, lines 206–210).
- `check_credit_limit` sums `invoices.grand_total - amount_paid` for `posted/part_paid` **and then adds `p_order_value`**. The invoice just inserted is already in that sum.
- `check_credit_limit` does not include delivered-not-invoiced challans or confirmed open orders.
- `post_delivery` has no credit check at all.

**Impact**

For a customer with a `₹50,000` limit and no prior dues, a `₹30,000` invoice is evaluated as `30,000 + 30,000 = 60,000` and rejected. The effective limit is roughly half the configured limit for every invoice. Conversely, a customer can place several confirmed orders or receive several deliveries without any credit check, so exposure can exceed the limit through those paths.

**Fix**

- Pass an `exclude_invoice_id` to `check_credit_limit`, or check before inserting the invoice.
- Define exposure as: open invoices + delivered-not-invoiced challans + confirmed/approved open orders (optionally reserved), not just invoices.
- Call the same exposure check in `post_delivery`, `place_order`, and `post_invoice_from_order`.
- Make the formula explicit in a view (`customer_credit_exposure`) and test it.

#### H2. There is no way to void or unapply a receipt; a paid invoice can become permanently unvoidable

**Evidence**

- Live functions include `void_invoice` and `void_payment_intent`, but **no `void_receipt`**.
- `void_invoice` refuses when `amount_paid <> 0` and tells the user to "Un-allocate receipts before voiding."
- No RPC deletes/reverses `receipt_allocations` or reopens an invoice.

**Impact**

A bounced cheque, a wrong receipt, or a duplicated collection cannot be corrected. If a receipt is wrongly allocated to the wrong invoice, the invoice cannot be voided, and the customer's balance stays wrong. The only workaround is direct SQL — which is exactly the kind of manual repair that causes audit gaps.

**Fix**

- Add `void_receipt(receipt_id, reason)`: lock the receipt, reverse its journal, delete/reverse allocations, decrement `amount_paid`, recompute invoice status, insert a reversing `customer_ledger` row, and audit.
- Add `unapply_receipt(receipt_id, invoice_id, amount)` for partial reallocation.
- Make `void_invoice` call the same unapply path when allocations exist, or give it an explicit `force_unapply` flag restricted to `invoice.void`.
- Add a `receipt_allocations` check that the sum never exceeds the receipt amount and never exceeds invoice due.

**Fix — implemented in `0132_receipt_void_and_advance.sql`:** `void_receipt()` reverses the cash journal, deletes the allocations (reopening each invoice and recomputing `amount_paid`/status under a row lock), marks the receipt `void`, and writes a `payment_void` ledger row. `unapply_receipt()` partially detaches a receipt and reclasses the released amount from AR to advance. `void_invoice()` no longer refuses a paid document: it calls the same release path and reclasses the released total to `2100`, so the invoice's AR clears and the customer keeps the money as advance. Both RPCs require `receipt.void` (granted to `manager`; `admin` is implicit) and are audit-logged. The web Collections register now exposes a per-receipt Void action, and the invoice correction panel allows voiding a paid document.

#### H3. Unallocated receipts are credited to AR, not customer advance

**Evidence**

- `record_receipt` always credits `1130` AR for the full receipt amount (unless the payment method destination is `customer_advance`).
- If allocations total less than the receipt amount, only the allocated part updates invoices; the rest has no invoice and no `2100` customer-advance entry.
- `customer_receipts.allocated_amount` records the allocated total, but the ledger row is `-v_amount`.
- The mobile Collect screen tells the user the remainder is "kept as advance."

**Impact**

The GL AR is reduced by the full amount, but the invoice subledger is reduced only by the allocation. A `₹100` receipt with `₹60` allocated leaves `₹40` still showing due on the invoice while AR GL says it is paid. The "advance" is not a liability; it is an unexplained AR credit. This breaks customer statements and refunds.

**Fix**

- Split the receipt journal: allocated portion → `1130`; unallocated portion → `2100` customer advance (with a customer party tag).
- Or require allocations to equal the receipt amount unless the method is explicitly `customer_advance`.
- Add a customer-advance balance view and a refund/apply flow.
- Test: receipt 100, allocate 60 → invoice due 40 remains; customer advance 40; AR GL reduced 60, not 100.

**Fix — implemented in `0132_receipt_void_and_advance.sql`:** `record_receipt()` now allocates first and then posts `Dr deposit` / `Cr 1130 (allocated)` / `Cr 2100 (remainder)`, tagging the customer on every 2100 line (including the debit side when the method itself is `advance`). `customer_advance(customer)` and the `v_customer_advance` view expose the balance from the GL, and applying more advance than the customer holds is rejected. Verified: receipt 1,000 with 600 allocated → `Dr 2140 1,000 / Cr 1130 600 / Cr 2100 400`; advance 400; applying 200 of it posts `Dr 2100 200 / Cr 1130 200` and leaves 0.

#### H4. Delivery and invoice can double-post value/stock, and voiding a delivery-linked invoice reverses the delivery

**Evidence**

- `post_delivery` posts stock (`sale_out`), AR, revenue/GST, and a customer-ledger sale, then sets the order to `fulfilled`.
- `post_invoice_from_order` accepts a `fulfilled` order (it rejects only `invoiced`/`cancelled`), calls `post_invoice`, which posts stock + AR + ledger again, then sets the order to `invoiced`.
- `generate_gst_invoice` is the intended document-only path for a fulfilled order: it creates a posted invoice linked to the delivery journal, with no new accounting entry.
- `void_invoice` does not check whether the invoice's journal is a delivery journal. It reverses that journal, tries to restock invoice lines (unit COGS is null for `generate_gst_invoice`, so no restock), inserts a `sale_void` ledger row, and sets the order back to `approved`.
- `rebuild_customer_ledger` includes both delivered challans and invoices, so it double-counts a delivery + generated invoice.

**Impact**

- Calling the normal "invoice order" action on a delivered order posts a second stock issue, second AR debit, and second ledger sale. Stock goes negative or inventory/COGS double-counts.
- Voiding a GST invoice generated from a delivery reverses the delivery's AR/revenue but does not restore stock (no unit COGS), leaving delivered goods with no receivable.
- `rebuild_customer_ledger` can double-count the same order.
- The UI can steer users into either path depending on which button they use.

**Fix**

- Decide one source of truth:
  - **Option A (preferred):** delivery is the value event; a GST invoice is only a document (`generate_gst_invoice`), and `post_invoice_from_order` rejects `fulfilled` orders.
  - **Option B:** invoice is the value event; delivery moves stock/quantity only, and no AR/revenue posts until invoice.
- Whichever is chosen, enforce it with status transitions and unique constraints:
  - `post_invoice_from_order` reject `fulfilled`;
  - `void_invoice` reject invoices whose `journal_entry_id` belongs to `delivery_challans`;
  - unique partial index on `invoices(order_id)` where `status <> 'void'` if one invoice per order;
  - `rebuild_customer_ledger` include only one of delivery/invoice.
- Add a test that delivery → invoice → void cannot change stock or AR twice.

**Fix — implemented in `0133_delivery_is_the_value_event.sql` (Option A):** the delivery is the value event. `post_invoice_from_order` refuses a `fulfilled` order, `generate_gst_invoice` requires a delivered order *with* a delivery journal and refuses a second live invoice, and `void_invoice` recognises a document-only invoice (its `journal_entry_id` belongs to a `delivery_challans` row): it cancels the paper, puts the order back to `fulfilled`, and touches neither the delivery journal nor stock. `convert_invoice_type` refuses a delivery document (converting would re-issue it as a value sale). A `BEFORE INSERT` trigger on `invoices` enforces the rule for every writer, including direct PostgREST inserts: no second live invoice per order, and no sale invoice for a delivered order (only `generate_gst_invoice` may attach a document, via a transaction-local flag). A unique partial index backs it up (skipped with a notice if existing data has duplicates).

#### H5. Receipt posting lacks idempotency, concurrency locks, and several validation checks

**Evidence**

- `record_receipt` selects no invoice `FOR UPDATE`; two concurrent receipts can both read the same `invoice_outstanding` and over-allocate.
- No idempotency key/unique request id; a retried HTTP call posts a second receipt.
- `store_id` is not checked against the customer (`select customer_id from customer_stores where id=v_store` is not compared to `v_cust`).
- `deposit_account` from the client is used verbatim if supplied; it is not validated as an asset/cash/bank account.
- Explicit allocations do not check invoice status; a caller can allocate to a `void` invoice because `invoice_outstanding` returns `grand_total - allocations` regardless of status.
- `mode` and `collected_by` are omitted from the insert, so both default (`cash`, null).

**Impact**

Over-allocation, duplicate receipts, receipts at the wrong store, journals debited to the wrong account, and allocations to void invoices. Each is a reconciliation failure that requires manual SQL to fix.

**Fix**

- Lock the invoice rows (`FOR UPDATE`) in a deterministic order before computing outstanding.
- Add `idempotency_key text unique` to `customer_receipts` and reject duplicate keys.
- Validate `customer_stores.customer_id = v_cust`.
- Ignore/validate `deposit_account`; derive it from `payment_methods.destination` unless the caller has `bank.manage` and explicitly chooses a valid asset account.
- Reject allocations to `void`/`paid` invoices.
- Store `collected_by` and derive `mode` from the method.

#### H6. Running balances are ordered by `created_at, id`, which is not monotonic; live data is already wrong

**Evidence**

- `previous_customer_balance` and `get_customer_ledger` order by `created_at desc, id desc`.
- Multiple ledger rows are inserted in the same transaction and therefore share the same `now()` timestamp.
- Live ledger rows for 25 Sep 2026 share `created_at = 02:49:43.512197`; the latest `balance_after` picked by the query is `1,257.00`, while the ledger rows sum to `1,394.00`.
- `customer_outstanding_via_ledger()` and `portal_my_statement` use the same ordering.

**Impact**

The "latest balance" is nondeterministic. New receipts start from the wrong previous balance, so the error compounds. The portal statement can show a balance that is `₹137` lower than the ledger and the AR GL. `rebuild_customer_ledger` also orders by `txn_time, ref_id`, so same-day rows rebuild in random order.

**Fix** — implemented in `0131_returns_and_ledger_rebuild.sql`: `customer_ledger.seq bigserial` plus an index on `(customer_id, seq desc)`, and every function that reads the latest ledger balance is rewritten to `order by seq desc`. The `(created_at, id)` tie is gone. Still to add: a check that `balance_after = previous balance_after + amount` for every row.

#### H7. WhatsApp configuration and messages are readable by any authenticated user; secrets are exposed when configured

**Evidence**

- `whatsapp_config` has a `read_all_auth` policy (`using true`) for `authenticated`; it also has a `portal_deny_all` policy.
- The table contains `access_token_encrypted`, `verify_token`, `waba_id`, `phone_number_id`, `meta_app_id`.
- `whatsapp_get_config()` is `SECURITY DEFINER`, granted to `authenticated`, and returns the entire row with no permission check.
- `whatsapp_messages` has `read_all_auth` (`using true`), exposing message content and phone numbers.

**Impact**

When WhatsApp is configured, any staff member — or a portal customer if the portal guard fails — can read the access token ciphertext, verify token, and all message content. The verify token alone can be used to spoof webhook verification if the endpoint is misconfigured; the access token ciphertext may be decryptable if the key is in the same project.

**Fix**

- Revoke all direct access to `whatsapp_config` from `authenticated`; grant only `service_role`.
- Move `access_token`/`verify_token` to Supabase Vault or edge-function secrets; store only a reference in the table.
- Restrict `whatsapp_messages` to `whatsapp.inbox`/`admin`.
- Drop or service-role-gate `whatsapp_get_config`.

#### H8. Order-to-invoice transitions are not serialized, and line fulfillment is updated by item, not by line

**Evidence**

- `post_delivery` selects the order without `FOR UPDATE`; `post_invoice_from_order` also selects without a lock.
- Both check status in application code, then insert documents and update status later. Two concurrent calls can both see `confirmed` and both post.
- `invoices.order_id` has a non-unique index only; there is no unique partial index for posted invoices.
- `post_invoice_from_order` loops over `v_lines` and runs `update sales_order_lines set qty_fulfilled = v_qty where order_id = p_order and item_id = v_item`. If an order has two lines for the same item (different price/batch), both lines get the last qty.
- For a cash memo (`p_is_official=false`), the order is set to `fulfilled`; `post_invoice_from_order` still accepts `fulfilled`, so a second invoice can be raised.

**Impact**

Double-click/retry or two users can double-deliver or double-invoice. A duplicate item line corrupts `qty_fulfilled`, which then affects delivery calculations. A cash-memo order can be invoiced again.

**Fix**

- `SELECT ... FOR UPDATE` the order at the start of `post_delivery` and `post_invoice_from_order`.
- Enforce status transitions atomically with a `WHERE status = 'confirmed'` update and check `ROW_COUNT`.
- Add a unique partial index on `invoices(order_id)` where `status <> 'void'` (if one invoice per order is intended).
- Match order lines by `line_id`, not `item_id`; update each line's fulfilled qty from the corresponding invoice line.
- Reject `fulfilled` in `post_invoice_from_order` if delivery is the value event.

**Fix — implemented in `0133`:** all three RPCs take the order `FOR UPDATE` and finish with a compare-and-set status update that raises if the row moved underneath them; the invoice trigger closes the direct-write path. Fulfilment is now applied **per order line**, consuming each line's remaining quantity in `line_no` order (or an explicit `order_line_id` when the caller sends one), so two lines of the same item no longer both inherit the last quantity.

#### H9. Sales returns do not touch the invoice/ledger, and returns against delivery-generated invoices cannot restock

**Evidence**

- `record_sales_return` only writes `credit_notes`, `sales_return_lines`, journal, and stock (when `unit_cogs > 0`).
- It does not update the invoice, insert `customer_ledger`, or allocate the credit.
- For a GST invoice generated from a delivery, `invoice_lines.unit_cogs` is null, so the restock branch is skipped even though the return may physically come back.
- The over-return check is not protected by a lock; concurrent returns can both pass.

**Impact**

Customer returns do not reduce what the customer owes in invoice-based reports; stock may not come back for delivery-generated invoices; concurrent returns can exceed sold quantity.

**Fix**

- Apply credit notes to invoices/advance and insert a negative ledger row (see C5).
- For delivery-generated invoices, source the original unit cost from the delivery stock ledger, not `invoice_lines.unit_cogs`.
- Lock the invoice line or use a unique `(invoice_line_id, return)` constraint / `FOR UPDATE` when summing prior returns.

#### H10. APK ships unnecessary sensitive permissions, allows backups, and retains push tokens after sign-out

**Evidence (APK `1.2.9`, versionCode 17)**

- Manifest permissions include `RECORD_AUDIO` and `SYSTEM_ALERT_WINDOW`, plus `READ/WRITE_EXTERNAL_STORAGE` (maxSdk 32).
- `android:allowBackup="true"`; no `dataExtractionRules`/`fullBackupContent`.
- Source `mobile/app.json` does not request audio/overlay explicitly; they come from transitive libraries (`expo-camera` adds `RECORD_AUDIO`; an overlay library adds `SYSTEM_ALERT_WINDOW`).
- `registerPushToken` upserts `push_tokens` on login; `signOut` never deletes the token. No `push_tokens` delete on sign-out.

**Impact**

- Unnecessary microphone/overlay permissions increase store-review and privacy risk, and look bad to enterprise customers.
- `allowBackup=true` can include app data in Android cloud/ADB backups; depending on SecureStore behavior, this may expose cached data or session material on a compromised/rooted device.
- A signed-out device can keep receiving the previous user's notifications; a new user on the same device may see them.

**Fix**

- Remove `RECORD_AUDIO` (`expo-camera` `recordAudioAndroid: false` if video is not used) and block `SYSTEM_ALERT_WINDOW` via `android.blockedPermissions`; audit which library needs it.
- Set `android.allowBackup=false` (or a restrictive `dataExtractionRules`) and exclude sensitive files.
- On sign-out, delete the current device token row; on login, reassign/upsert as now.
- Rebuild and re-sign the APK; verify with `aapt2 dump badging` that the permissions are gone.

#### H11. `sales_orders` direct writes can bypass price/credit/audit controls

**Evidence**

- `manage_orders` is an `ALL` policy for `authenticated` with `using/with check has_permission('order.create')`.
- `sales_orders` has table-level `UPDATE`/`DELETE` grants.
- The app's order UI uses RPCs, but PostgREST exposes the table directly.

**Impact**

An order creator can `PATCH` an order's `unit_price`, `status`, or `branch_id` directly, bypassing `place_order`'s credit check and audit. They can delete a confirmed order (FK from invoices prevents deleting an invoiced one, but confirmed history can disappear).

**Fix**

- Replace `manage_orders` `ALL` with `SELECT` + narrowly-scoped `INSERT`/`UPDATE` policies that exclude price/status columns, or revoke direct table writes and expose only RPCs.
- Add column-level grants if direct PostgREST writes are required.
- Do the same for `customers` (`manage_customers ALL`) and any other money-bearing table with broad `ALL`.

#### H12. Notification/audit/numbering helpers are abusable

**Evidence**

- `notify(p_user, p_title, p_opts)` is granted to `authenticated` with no permission check; it can target any user and set an arbitrary `action_url`.
- `next_number(kind, date)` is granted to `authenticated`; repeated calls burn invoice/receipt/order serials without creating a document.
- `write_audit` is granted to `authenticated`; a caller can forge an audit row with an arbitrary `p_actor`.
- `invitation_for_phone(phone)` is executable by `anon` and returns whether a pending invitation exists for a phone number (enumeration oracle).

**Impact**

Phishing notifications inside the app, GST invoice serial gaps, audit-log forgery, and phone-number invitation enumeration.

**Fix**

- Make `notify` service-role-only or require an internal permission and restrict `action_url` to an allow-listed prefix.
- Make `next_number` service-role-only; if clients need previews, add a read-only preview function.
- Revoke `write_audit` from clients; add a hash-chain/append-only audit table.
- Revoke `invitation_for_phone` from `anon`; if needed for signup, return only a generic boolean with rate limiting.

---

### Medium

#### H13. Customer portal order placement is gated on a staff permission and likely fails for customers

`portal_create_order` validates the store/lines and then calls `place_order`, which starts with `if not has_permission('order.create') then raise exception 'place_order: not authorized'`. A portal customer is linked through `customer_portal`/phone, not through a staff role, so `has_permission('order.create')` is false. The portal can browse catalog/stores and submit pay intents, but "Place order" will fail with a permission error. If the fix is simply to grant `order.create` to portal users, it also opens the price field (C4) and the broad order table (M1).

**Fix:** give portal ordering its own definer RPC that validates `portal_customer_id()`, uses the portal price list, ignores client prices, and writes a demand-only order with a `portal` source. Do not grant staff permissions to portal principals.

---

#### M1. Broad `read_all_auth` policies expose all operational data to every staff user

`customers`, `customer_stores`, `customer_receipts`, `sales_orders`, `customer_ledger`, `stock_ledger`, `company_settings`, `payment_methods`, `users`, `user_roles`, and `roles` have `using (true)`. A field agent can read every customer's phone, every receipt, every order, and every ledger balance. This may be acceptable for a small trusted team, but it is not a least-privilege design; it also makes the portal guard failure (C1) catastrophic. Scope reads by role/branch/territory and add `customer.view`, `receipt.view`, `order.view`, `ledger.view` permissions.

#### M2. `customer_outstanding` and portal profile omit delivered-but-not-invoiced amounts

`customer_outstanding` and `portal_my_profile` sum invoices only. Live AR GL is `₹1,394`, invoice due is `₹1,054`; the `₹340` delivery is invisible to the customer portal. Use `customer_outstanding_via_ledger` (after fixing H6) or union delivery challans with no posted invoice.

#### M3. `customer_opening_balance` is not idempotent and does not write the customer ledger

It posts an AR/3900 journal but no `customer_ledger` row, so the opening balance is invisible to ledger-based reporting. It can be called repeatedly, each time adding another opening entry. Add a unique customer/opening key, insert the ledger row, and gate it behind `accounting.manage`.

#### M4. `record_receipt` trusts a client-supplied deposit account

Even with `method_id`, a caller can pass `deposit_account: '4000'` and the journal debits revenue instead of cash/bank. Derive the account from `payment_methods.destination`, or validate it against a small allow-list of asset accounts.

#### M5. Migration ordering has duplicate prefixes and gaps; live has functions not represented in a clean migration chain

The migrations directory contains two `0048_*`, two `0049_*`, and two `0050_*` files, plus missing `0028`, `0039`, `0040`, `0056`, and `0098–0099`. Supabase applies files by filename; duplicate prefixes make the intended order ambiguous. The live project also has functions/objects that may have been applied outside the repo (e.g. `void_invoice` is defined in `0102` under an uppercase `CREATE`, while some edge functions such as `send-push` are not in the repo). Add a CI job that runs `supabase db reset` from an empty database and a schema-diff check against staging.

#### M6. `generate_gst_invoice` creates an invoice row with no invoice ledger, while invoice-based reports read it

This is the document-only path; it links `journal_entry_id` to the delivery journal. `customer_outstanding` and `portal_my_profile` still sum it, which is correct only if the delivery is not also included. The dual model is fragile; see H4. Add a `value_event` flag or a view that excludes document-only invoices from AR aging.

#### M7. `post_invoice_from_order` line fulfillment is by item, not by line

Two order lines for the same item both receive the last `qty_fulfilled`. Use `invoice_line`/`order_line` linkage and update by line id.

#### M8. Multi-branch sales default to HO

`post_invoice` and `place_order` default `branch_id` to the `HO` branch when the header omits it; the web and mobile sale forms omit it. In a multi-branch setup, stock and COGS post to HO regardless of the selling store. Pass an explicit branch or derive it from the store/user, and validate the user's branch access.

#### M9. `post_delivery` does not check credit and does not lock the order

See H1/H8. A delivery can push exposure over the limit, and concurrent calls can double-deliver.

#### M10. No offline/outbox or retry idempotency in the mobile app

The APK blocks offline use, which is better than silent loss, but a network failure after the invoice call leaves the sale half-posted (C3). Add a client-generated idempotency key and a small outbox for sale + receipt, or a single atomic RPC.

#### M11. Push webhook is hardcoded and unauthenticated

`0114_push_webhook.sql` hardcodes `https://wmpxwpubfxpexybqnynz.supabase.co/functions/v1/send-push` and sends no `Authorization` header. Verify the deployed function's `verify_jwt` setting: if `true`, push is silently failing; if `false`, anyone can invoke it with an arbitrary notification payload. Pass a shared secret/`service_role` header and make the URL configurable.

#### M12. OAuth uses a custom URI scheme

`newbizz://auth/callback` can be registered by a malicious app on Android; prefer Android App Links / iOS Universal Links with PKCE. This is a lower-priority hardening item.

#### M13. Return/credit-note approvals are self-approved

`record_sales_return` and `_post_credit_note` set `approved_by = v_actor` and post immediately. There is no maker-checker for credit notes, voids, or price overrides. Add dual control above a threshold.

**Fixed for voids in `0135_reversal_approvals.sql`:** `reversal_policy` holds a threshold per kind (seeded ₹25,000 invoice void / ₹10,000 receipt void, `enabled` switch, `0` = everything). At or above it, `void_invoice`/`void_receipt` refuse with SQLSTATE `RY001` and the caller files the work with `request_reversal()`, which is idempotent while a request is pending. `approve_reversal()` requires `reversal.approve`, rejects the requester as approver, and runs the original void inside the approver's transaction — reversal, ledger row and decision commit together. `reject_reversal()` leaves the document posted. Surfaced at `/admin/approvals` with a sidebar badge; the void buttons in Collections and the invoice correction panel file the request automatically and toast “Sent for approval” instead of claiming success. **Not covered:** credit notes, sales returns and price overrides still self-approve — gating returns would break the documented correction flow, so that needs a product decision.

---

## 4. Remediation plan

### 0–48 hours (stop the bleeding)

1. **Rotate the Intangles tokens** found in the HARs; remove the HARs from the repo and history.
2. **Revoke `EXECUTE`** on the unguarded definer RPCs listed in C2 from `public`, `anon`, and `authenticated`; grant only `service_role`. Keep the permission-checked wrappers.
3. **Fix portal identity**: change `portal_customer_id`/`is_portal_principal` to `current_app_user()` or a JWT `portal_customer_id` claim; add the two-account RLS test.
4. **Add a compatibility path for APK receipts**: accept legacy `mode` when `method_id` is missing, derive the method/destination server-side, store `collected_by`, and stop trusting `deposit_account`.
5. **Disable company asset writes** in `party-images` for non-admins and make the bucket private; restrict `documents` storage read/delete to owner/`documents.manage`.
6. **Drop `self_update`** or restrict it to profile columns.
7. **Restrict `whatsapp_config`/`whatsapp_messages`** to `admin`/`service_role`; move tokens to Vault.
8. **Freeze credit notes/returns** in the UI until C5 is fixed, or require a manual approval + reconciliation.

### Week 1 (accounting correctness)

1. Fix `record_receipt`: lock invoices, idempotency key, store/customer validation, method-derived deposit, `collected_by`, unallocated → customer advance.
2. Add `void_receipt`/`unapply_receipt`; update `void_invoice` to use them.
3. Fix `check_credit_limit` (exclude current invoice, include delivery/open orders) and call it in `post_delivery`.
4. Fix returns/credit notes: allocate to invoice/advance, insert `customer_ledger`, update invoice status.
5. Fix `previous_customer_balance`/`get_customer_ledger` ordering with a `seq` column; backfill and verify.
6. Fix `rebuild_customer_ledger`: exclude void invoices, include credit notes, include delivery only when not invoiced, order deterministically.
7. Add server-side price policy + `price.override`; remove the portal price input.
8. Fix delivery/invoice flow (H4), order locks (H8), and unique partial order-invoice index.
9. Add the APK permission/backup/push-token fixes and ship a new build.

### Week 2–4 (hardening and visibility)

1. Reconciliation dashboard with daily invariants:
   - stock value == inventory GL;
   - AR GL == invoice due + delivery-only due;
   - latest customer ledger balance == ledger sum;
   - receipt allocation sum == allocated_amount.
2. Add `customer_credit_exposure` view and aging by delivery/invoice.
3. Add idempotency to invoice/order/receipt/return RPCs.
4. Add maker-checker for credit notes, voids, and price overrides above a threshold.
5. Add a CI `supabase db reset` + pgTAP suite for RLS, permissions, and ledger invariants.
6. Add a portal test account (two customers) to the seed and CI.
7. Add audit-log hash chain / append-only trigger; revoke `write_audit` from clients.
8. Add a mobile outbox or atomic sale+payment RPC; add a retry-safe client request id.

---

## 4a. Phase 2 addendum (second pass)

These were found after the first remediation pass and are **not** covered by the checklist below yet.

#### C9. A Supabase personal access token is committed in `app/supabase/apply.sh`

`HEAD` (`411acbe`) contains a literal `sbp_…` token as the fallback for `SUPABASE_ACCESS_TOKEN`. A personal access token can run arbitrary SQL against the project and read every table, bypassing RLS entirely (it is a management-API credential, not an anon key).

**Impact:** anyone with repository access — current or former contractor, a CI cache, a leaked clone, or the HAR-style artifacts already in this repo — owns the database.

**Fix:** revoke the token in Supabase → Account → Access Tokens now, then purge it from history. The working tree already requires the env var; history still contains the secret. Add a pre-commit secret scan (`gitleaks`) and rotate every credential that ever sat next to a `.har` capture.

#### C10. `void_invoice` has been unable to void anything since `0102`

`void_invoice` inserts a `customer_ledger` row with `txn_type='sale_void'`, but the ledger CHECK constraint added in `0051` allows only `sale, payment, credit_note, debit_note, scheme, opening`. Every void therefore fails on that insert, and because a function is one transaction, the journal reversal, restock and status update roll back too. The two void invoices visible in production predate `0102`.

**Impact:** an invoice issued in error can never be voided; the only route is manual SQL, which bypasses the audit trail and leaves the delivery/invoice linkage inconsistent.

**Fixed in `0131`:** the constraint now allows `sale_void`. Rebuild excludes void invoices entirely, so the runtime sale + sale_void pair and the rebuilt view agree.

---

#### H14. Scheme rebates ignore the scheme's own scope and target type

`calc_scheme_eligibility` computes, for **every store with any invoice in the window**, `sum(invoice_lines.qty)` across **all items**, then applies the tier. It never reads `schemes.eligibility` (`global | group | customer`) or `schemes.target_type`. A scheme restricted to one group or one customer still pays every store, and a scheme meant for specific products pays on unrelated volume. The only guard is `tiers_json` (`min_cases`).

**Impact:** rebate liability is systematically overstated, and a future "group" or "customer" scheme silently pays competitors. `scheme_eligibility` also has no unique guard against a second scheme with the same window.

**Fix:** filter invoice lines by the scheme's product/group/customer scope (add the missing scope tables/columns), convert units to cases via pack size instead of summing base qty, and reject `eligibility <> 'global'` until the scope is implemented. Add a test with two stores where only one qualifies.

#### H15. Bank reconciliation could match the same receipt/journal twice

`match_bank_txn` inserted a new `bank_txn_matches` row on every call with no uniqueness on the source document and no cumulative amount check against the statement line. Re-clicking Match, or matching one receipt to two lines, double-counts in reconciliation while `bank_transactions.matched` stays true.

**Fixed in `0128_security_tenant_isolation.sql`:** row lock on the statement line, one-source-one-match guard, cumulative `matched <= abs(amount)` guard, and `matched` now flips only when the line is fully cleared. A unique index on `(bank_transaction_id, coalesce(journal_entry_id, receipt_id, payment_id))` is still recommended after de-duplicating existing rows.

#### H16. Public print links rendered without company branding

The print pages authorize the document with a share token (`getInvoice(id, serviceClient)`) but fetched company settings with the cookie client. With `company_settings` now staff-only, a customer opening a shared invoice gets no logo, signature, bank details, or UPI QR. The pages now pass the same service client to `getCompany()`; this also lets the private `company-assets` bucket be signed for token viewers.

#### H17. Audit attribution is NULL across every RPC written after `0049`

`0049` rewrote the definer RPCs to use `current_app_user()` because PostgREST no longer sets the singular `request.jwt.claim.sub` GUC. Seventeen later migrations reintroduced the legacy read — including `0102` (`post_invoice`, `record_receipt`, `post_delivery`, `void_invoice`, `record_sales_return`), `0091` (portal), `0103` (purchases), `0060` (delivery), and `0120` (challans). On those paths `audit_log.actor_id`, `created_by`/`posted_by`/`approved_by`, `collected_by`, and portal attribution are all NULL.

**Impact:** every new invoice, receipt, return, purchase, and portal action is recorded with no author. Combined with the forgeable `write_audit` (C2/H12), the audit trail cannot answer "who posted this?" for the exact transactions that matter. It also explains part of the `collected_by=NULL` evidence in C3.

**Fix:** `0129_actor_via_current_app_user_repeat.sql` repeats the `0049` metaprogrammed rewrite for any function still containing the legacy read. Keep `current_app_user()` as the only actor source, and add a CI check that no `prosrc` contains `request.jwt.claim.sub`.

---

## 4b. Remediation applied in this pass (unapplied migration)

`app/supabase/migrations/0128_security_tenant_isolation.sql` is written but **not applied** to the live project. It:

- fixes `portal_customer_id()` / `is_portal_principal()` to use `current_app_user()` (same claim path as `0048`) and adds `is_staff_principal()`;
- replaces broad `read_all_auth` reads on customers, stores, receipts, orders, ledgers, users, roles, settings, and payment methods with staff-only predicates;
- restricts `whatsapp_config` to admins and `whatsapp_messages` to `whatsapp.inbox`/admin;
- scopes `documents` metadata and storage objects to owner/`documents.manage`, and moves company branding to a private `company-assets` bucket with admin-only writes;
- revokes internal definer helpers (`_post_credit_note`, `customer_opening_balance`, `receive_opening_stock`, `rebuild_account_balances`, `post_stock_move`, `write_audit`, `notify`, `next_number`, `whatsapp_get_config`) from client roles;
- adds `accounting.manage` checks to the bank/scheme RPCs and the reconciliation guards above;
- removes self-service writes to `users.status`, `branch_id`, `token_version` (column grant on `full_name, phone, email` only);
- `0129_actor_via_current_app_user_repeat.sql` restores real actor attribution on every RPC written after `0049`.

`0135_reversal_approvals.sql` adds maker-checker for high-value voids: a threshold per kind, a request queue, a second approver who cannot be the requester, and an approval that performs the void atomically. The request cannot be filed by the same statement that raises, so the void RPCs signal `RY001` and the client files — verified end to end, including idempotent re-filing and a rejection that leaves the receipt posted.

`0134_reconciliation_invariants.sql` makes drift visible: `reconciliation_checks()` compares AR GL against the invoice + delivery-only subledger, AR less customer advances against the latest customer-ledger balances, receipt allocations against `allocated_amount`, and stock carrying value against the inventory control accounts; `ar_drift_by_customer()` names the customers behind an AR difference. Surfaced at `/reconciliation` (Accounting → Integrity Checks), as a guarded cron at `/api/cron/integrity` that answers 503 on drift, and as `app/supabase/checks/invariants.sql` for the nightly `.github/workflows/db-invariants.yml` job (skips with a notice until `STAGING_DATABASE_URL` is set).

`0133_delivery_is_the_value_event.sql` closes H4/H8/M7/M9/M6: one value event per order. `post_invoice_from_order` refuses a delivered order, `generate_gst_invoice` requires a delivered order with its journal and no live invoice, `void_invoice` cancels a document without reversing the delivery, `convert_invoice_type` refuses a delivery document, order writes are serialised with row locks and compare-and-set, fulfilment is per line, and a trigger on `invoices` enforces one live invoice per order for every insert path.

`0132_receipt_void_and_advance.sql` closes H2/H3: receipts can be voided or unapplied, a paid invoice can be voided (its receipts are released to customer advance), and unallocated cash is credited to `2100` instead of sitting as an unexplained AR credit. `customer_ledger` accepts the new `payment_void` type; `0131` already excludes void receipts from a rebuild, so runtime and rebuild agree.

`0131_returns_and_ledger_rebuild.sql` fixes returns and the ledger: credit-note allocations reduce the invoice, returns write a negative ledger row, rebuild excludes void invoices and counted deliveries, `customer_ledger.seq` replaces the ambiguous timestamp ordering, and the `sale_void` CHECK that made every `void_invoice` call fail is corrected.

`0130_receipt_method_compat.sql` fixes the APK collection path: legacy `mode` resolution, stored `mode`/`collected_by`, method-derived deposit accounts, invoice row locks, void-invoice rejection, idempotency on `client_request_id`, and an atomic `record_sale_with_payment`. Because this is server-side, the installed APK starts posting correct receipts without a rebuild.

Companion code changes: company logo/signature/QR now stored as private object paths and signed on read; document delete removes the object before the row; the mobile profile no longer writes `updated_at` (trigger-maintained, and outside the column grant); mobile sale/collect send a `client_request_id`; the hardcoded Supabase PAT removed from `apply.sh`; HAR captures deleted and `*.har` ignored.

**Verified:** `tsc --noEmit` passes for `app/` and `mobile/`; `jest` passes (7 suites, 73 tests); all migrations parse with `libpg_query`; `0129`, `0130` and `0131` were executed against a scratch PostgreSQL with a stub schema and `check_function_bodies=on`, and the following behaviour was reproduced:

- legacy APK cash call (`mode`, `deposit_account`, no `method_id`) → one receipt, `mode=cash`, method cash, `2140`, `collected_by` set, 400 allocated, invoice due 600, ledger −400;
- the same `client_request_id` returns the same receipt and leaves exactly one row;
- legacy `mode=upi` resolves to `upi_agent` and stores `mode=upi`;
- allocation to a void invoice raises and rolls back;
- a posted 100 credit-note allocation reduces the invoice due by 100;
- return of 200 against a 1,000 invoice → CN 200, allocation 200, due 800, amount_paid 200, ledger −200, one return line;
- rebuild over a void invoice, a voided delivery, a delivery-only challan, a receipt and a credit note → 900 across 4 rows, identical on a second run;
- `0129` rewrote a function containing the legacy GUC to `current_app_user()`.

**Not verified:** `0128` was not executed (it needs the full Supabase schema: `auth`, `storage`, and every table it policies), so its policies are review-only, and no RLS test suite exists yet. Do not apply `0128` to production without a staging run first.

---

## 5. Acceptance checks before calling this fixed

- [ ] Portal customer A cannot read customer B's customers, stores, receipts, orders, ledger, users, roles, settings, WhatsApp messages, or storage objects — directly or via RPC.
- [ ] An `authenticated` JWT cannot execute `_post_credit_note`, `post_scheme_credit_note`, `customer_opening_balance`, `receive_opening_stock`, `post_stock_move`, `import_bank_statement`, `match_bank_txn`, `post_reconciliation_adjustment`, `rebuild_account_balances`, `write_audit`, `notify`, or `next_number`.
- [ ] APK cash sale: one invoice, one receipt, debit to `2140`, `collected_by` set, `mode='cash'`; UPI sale: debit to `1120`/`upi_company`, not `2140`.
- [ ] Collect screen records a receipt without error; retry with the same idempotency key does not duplicate.
- [ ] Portal order at `unit_price=0` or 50% of list is rejected; authorized override creates an audit row.
- [ ] Return of 200 against a 1,000 invoice: invoice due 800, ledger -200, AR GL 800, rebuild produces 800.
- [ ] Receipt void: invoice reopens, allocations reversed, AR GL reversed, ledger row inserted.
- [x] Delivery → GST invoice: stock and AR do not double; voiding the document does not reverse the delivery, and the order returns to `fulfilled` so a corrected document can be raised.
- [x] Invoicing a delivered order is refused, including by a direct `invoices` insert or a second live invoice for the same order.
- [x] Two order lines for the same item receive their own `qty_fulfilled` (4 and 6, not 6 and 6).
- [ ] `rebuild_customer_ledger` on a snapshot with void invoices/credit notes/deliveries produces the same AR as the GL.
- [ ] Latest customer ledger balance equals the sum of ledger rows and AR GL after same-timestamp inserts.
- [x] `reconciliation_checks()` reports `ok` for all four invariants when the books agree, and flips exactly the affected check to `drift` when a ledger row, an allocation read-model or a stock valuation is corrupted (verified on a scratch database).
- [ ] The nightly DB-invariants workflow runs against a real staging clone (`STAGING_DATABASE_URL`) and stays green. The RPC itself is verified (§5a); the workflow has never run.
- [ ] Company signature/QR are not public; portal cannot list/download/delete documents.
- [x] A void above the threshold is refused and filed; the requester cannot approve it; a second approver completes it in one transaction; a rejection leaves the document posted; below the threshold the void still posts directly.
- [ ] A suspended user cannot PATCH their own `status` to `active`.
- [ ] APK manifest has no `RECORD_AUDIO`, `SYSTEM_ALERT_WINDOW`, or `allowBackup=true`.
- [ ] Intangles tokens and the Supabase PAT are rotated; the HARs and the token are gone from git history.
- [ ] `audit_log.actor_id`, `created_by`, `posted_by`, and `collected_by` are non-null for every RPC after `0129` (no `request.jwt.claim.sub` left in any function body).
- [ ] A non-global scheme pays only stores in its scope; an unconfigured scope is rejected rather than paid to everyone.
- [ ] Matching the same receipt or journal twice, or above the statement line amount, is rejected.
- [ ] A public print share link renders company name, logo, signature, bank details, and UPI QR.
- [x] `void_invoice` completes: journal reversed, stock restored, status void, ledger `sale_void` row accepted.
- [x] Receipt 1,000 with 600 allocated posts `Dr 2140 1,000 / Cr 1130 600 / Cr 2100 400`; `customer_advance()` returns 400.
- [x] `void_receipt` reverses the journal, reopens the invoice (due returns), marks the receipt void, and writes one `payment` plus one `payment_void` ledger row.
- [x] Voiding a paid invoice releases its receipts to advance and leaves no receipt allocation behind.
- [x] The same checks re-run on a staging clone (schema-level; see §5a). Data-level re-run against production rows is still open.
- [x] The migration chain `0128`–`0135` applies cleanly, in order, on a database built from the repo.
- [x] Portal A cannot read B's customers, stores, receipts, orders, ledger, users, roles, settings or storage objects; an `authenticated` staff JWT still reads both tenants (`tests/0960_rls_tenant_isolation.sql`, 43 assertions).
- [ ] `rebuild_customer_ledger` run twice produces the same entry count and final balance, with no void invoice and no double-counted delivery.
- [ ] A return of 200 against a 1,000 invoice leaves due 800 in `invoice_outstanding`, `customer_outstanding`, the portal and the ledger.

---

## 5a. Staging verification (2026-10-20)

The chain was replayed end-to-end on a local PostgreSQL 17 with the Supabase
surface stubbed (`auth.users` + `auth.uid/jwt/role`, `storage.buckets/objects` +
`storage.foldername`, `anon`/`authenticated`/`service_role`, Supabase's default
privileges, `cron`/`net` shims). Every file runs through `psql` with
`ON_ERROR_STOP=1`, so a mid-file error fails that file instead of being skipped.

Supabase branching was not available (the organisation is on the free plan), so
this is a schema clone rebuilt from the repository, not a copy of production
rows.

### Result

| Step | Outcome |
|---|---|
| `0001`–`0127` (baseline) | 128 files + 3 seeds apply clean, after the five backfilled migrations below |
| `0128`–`0135` (new chain) | **all 8 apply cleanly, in order** |
| `reconciliation_checks()` | 4/4 `ok` on the empty clone; `checks/invariants.sql` exits 0 |
| `tests/0960_rls_tenant_isolation.sql` | **PASS**, 43 assertions across three principals |

### Repo defects this surfaced (fixed)

- `0066_fleet_trip_auto.sql` / `0067_fuel_refill_events.sql` — `comment on ... is "…"` used double quotes; the only way these applied to production was a corrected copy. Any fresh database aborted at 0066.
- `0069_payroll_redesign.sql` — five policies compared `user_roles.role_id` (uuid) to `'hr.view'` / `'hr.manage'`, which cannot even be created. Replaced with `has_permission(...)`, the intended predicate.
- `0134_reconciliation_invariants.sql` — joined `journal_lines.account_code`, a column that exists neither in the repo nor in production. Replaced with a join to `chart_of_accounts.code`.

### Backfilled migrations

Production's history contained files that were never committed, so a fresh
database could not be built from the repository. Seven were reconstructed from
the production catalog and added (each header says BACKFILLED and what was read
back):

| File | Replaces |
|---|---|
| `0028_reharden_phase4.sql` | post–phase-4 search_path pin + `anon`/`PUBLIC` EXECUTE revoke (231 functions pinned in production, 0 unpinned) |
| `0039_order_fulfilment_states.sql` | `qty_fulfilled`, `fulfilled`/`partially_fulfilled`, `followup_order_id` / `parent_order_id` |
| `0040_delivery_challans.sql` | both challan tables, `challan_status`, indexes, initial `read_all_auth` policy |
| `0056_opening_stock_admin_bypass.sql` | `receive_opening_stock_batch` with the admin fallback, null `p_as_of` default |
| `0086b_archive_notifications_rpc.sql` | `archive_notifications(uuid[])`, revoked by `0087` |
| `0086c_get_person_balance.sql` | `get_person_balance(uuid)`, revoked by `0087` |
| `0110b_store_qr_codes.sql` | `store_qr_codes`, read and rewritten by `0111` |

After those, **the whole chain `0001`–`0136` plus the three seeds replays with no
shims**: 142 files — 133 baseline applied clean, 9 new migrations (`0128`–`0136`)
applied clean — and both `0960` (43 assertions) and the new `0965`
(11 assertions) pass.

### More repo defects this surfaced (fixed)

- `0091_customer_portal.sql` — three ordering/scope bugs: the `customer_portal_read` policy called `is_portal_principal()` 27 lines before it was defined; `portal_catalog()` called `resolve_price_list_for_portal()` and `stock_qty_for_portal()` before their definitions; and `search_customers` selected `c.*` from a subquery aliased `x`, so the whole function failed to create. It could never have applied as written.
- `0118_store_item_prices.sql` — declared `returns table (item_id, unit_price)` but the body returns three columns including `name`; fixed the declaration to match the body and production.

### Two live defects found in `0056` (production only, fixed forward here)

Backfilling a missing file means reproducing production, which is only useful if
the reproduced behaviour is worth having. `0056` is not, in two places. Both
were confirmed by running production's verbatim body in the clone
(`tests/0965_opening_stock_authorization.sql` covers the fixed versions):

1. **A suspended admin can load opening stock.** `has_permission()` refuses
the permission, then `0056`'s fallback re-reads the actor and checks only
`user_roles` for `code = 'admin'` — so the status kill-switch and an explicit
per-user `deny` override are both bypassed. Verified: a `suspended` admin
posted 1 line. The fallback is a no-op in every other case (`has_permission`
already bypasses for admins in `0031`), so its only real effect is defeating
those two refusals.
2. **A blank date cannot be used.** `0056` changed `p_as_of` to default `null`
and nothing downstream coalesces it: `post_stock_move` → `post_journal` raises
`post_journal: entry_date is required`. The app omits `p_as_of` whenever the
date field is left blank, so that path fails today.

The reconstructed file keeps production's signature and gate, adds
`coalesce(p_as_of, current_date)`, and requires an active account with no deny
override before the fallback applies. Because a backfill cannot repair a live
database, `0136_opening_stock_gate_fix.sql` ships the same body as a forward
migration.

**`0136` is applied to production** (2026-10-20, recorded as
`0136_opening_stock_gate_fix`). It is `create or replace` of one function, with
no dependency on `0128`–`0135`, so it was safe to ship ahead of them — verified
that none of those files redefines the batch RPC, so applying them later cannot
undo the fix. Post-deploy checks on the live project:

| Check | Result |
|---|---|
| body carries the status guard / deny guard / date coalesce | `true` / `true` / `true` |
| ACL after replace | `{postgres, authenticated, service_role}`, unchanged |
| `anon` may execute | `false` |
| identity-less caller | refused: `not authorized (needs settings.manage)` |

### Live schema vs the replay (NEWBIZZ `wmpxwpubfxpexybqnynz`, 2026-10-20)

Replaying the chain proves the repository *can* build a database. It does not
prove that database is the one in production. Both sides were fingerprinted and
compared — public functions by signature plus `md5(body)`, first with
whitespace collapsed, then with `--` comments stripped as well.

Object counts, live vs replay: functions **231 / 238**, tables **129 / 131**,
columns **1353 / 1372**, indexes **527 / 537**, policies **326 / 328**, views
**3 / 4**, triggers **78 / 79**.

**15 functions exist only in the replay** — every one comes from the nine
unapplied migrations, so this closes when they ship: `_release_invoice_allocations`,
`approve_reversal`, `ar_drift_by_customer`, `can_access_document`,
`customer_advance`, `invoices_order_guard`, `is_staff_principal`,
`reconciliation_checks`, `record_sale_with_payment`, `reject_reversal`,
`request_reversal`, `reversal_allowed`, `reversal_queue`, `unapply_receipt`,
`void_receipt`.

**8 functions exist only in production**, which is the more interesting half —
they were applied outside the repository and would vanish from any rebuild:

| Object | Note |
|---|---|
| `link_store_qr`, `my_activity`, `my_transfers_and_custody`, `record_visit` | the mobile subsystem (`p2_*` / `p3_*` migrations, never committed) |
| `store_item_prices(uuid,uuid[])` | a stale 2-argument overload; the repo only has the 3-argument version from `0118` |
| `_random_digits`, `_random_token` | from a `0050_id_scheme_fy_random` that was never committed; no repo file defines them |

`cleanup_orphan_google_user` was in this list too, and that was wrong: it is in
`migrations/0942_google_orphan_cleanup.sql`. The earlier replay filtered files
into `0001…0127` and `0128…0136`, which silently skipped `0940`–`0942` — so the
harness, not the repository, left it out. `apply.sh` now includes `0942`, and a
freshly built chain has **239** public functions (238 + this one). Seven, not
eight, functions are production-only.

**Function bodies.** 63 public functions differ textually. Most of that is
cosmetic — production's copies were applied without the inline comments (e.g.
`has_permission` is logic-identical, comment-free). Seven first-letter buckets
match exactly once whitespace and comments are normalised. In the `g`/`n`/`p`/`t`
buckets (63 functions) **42 match and 21 differ for real**:

`generate_gst_invoice`, `get_customer_ledger`, `next_entity_code`,
`next_number`, `pay_supplier`, `place_order`, `place_purchase_order`,
`portal_create_order`, `portal_customer_id`, `portal_my_documents`,
`portal_my_statement`, `portal_submit_pay_intent`, `post_delivery`, `post_grn`,
`post_invoice`, `post_invoice_from_order`, `post_reconciliation_adjustment`,
`post_scheme_credit_note`, `post_supplier_bill`, `previous_customer_balance`,
`to_e164_storage`.

Each of those is a place where production runs code the repository cannot
reproduce — numbering, GST invoicing, delivery posting, supplier bills and the
portal write path. The remaining count-differing buckets (`_`, `a`, `c`, `i`,
`l`, `m`, `r`, `s`, `u`, `v`) were not classified body-by-body; their counts are
already explained by the two lists above.

### Remaining gaps

Nothing is missing from the migration chain any more. What remains:

- Production's applied history is now `…0127`, then `0136` — the gate fix
  landed ahead of `0128`–`0135`, which remain repo-only. History is therefore
  out of order by number but not by dependency; the eight outstanding files
  still need a deploy decision.
- ~~`apply.sh` / `apply_all.sql` do not run the migration chain.~~ Fixed — see
  "Bootstrap path" below.
- The other uncommitted production objects noted earlier (`send-push` and
  friends) are edge functions, not schema.

### Bootstrap path (2026-10-21)

`apply.sh` sent one request containing `apply_all.sql`, a 2165-line snapshot
that stopped at `0009` + seed. The documented bootstrap therefore built a
schema years behind `migrations/`. It now sends the chain itself, one file per
request, in this order: `migrations/*.sql` (minus the sentinel `*_smoke.sql`),
with `seed/0100`, `seed/0110` and `seed/0120` interleaved after `0001`,
`0002` and `0006`. `apply_all.sql` is deleted.

Both halves of that are forced, not stylistic:

1. **The seed cannot be appended at the end.** `0019` calls
   `set_cost_account_class('5110', …)`, which reads `chart_of_accounts` from
   `seed/0110`; `0007`+ insert item rows from `seed/0120`. Applying the seed
   last fails at `0019`, and it cannot be re-run afterwards either (`0057`
   moves `customers.kind`). Production was built with the seed interleaved.
2. **The chain cannot be consolidated into one transaction.** `0039` adds the
   enum values `fulfilled` / `partially_fulfilled` and `0060` uses them;
   Postgres refuses to use an enum value added in the same transaction
   (`unsafe use of new value "fulfilled" of enum type order_status`). One file
   per transaction is the only order that works, so no regenerated
   `apply_all.sql` could ever have worked, in the API or the SQL editor.

`apply.sh` also used to finish by running `tests/0900` and `tests/0910` through
the API. Those exercise permission-gated RPCs, and the Management API runs as
the project owner with no `request.jwt.claims`; `has_permission()` returns false
for an identity-less caller, so both calls were refused on every fresh project.
The tail now runs `0960` (tenant isolation) and `0965` (opening-stock gate),
which provision their own principals and assert the security surface, and the
script says where the signed-in smokes belong.

**Verified offline** on a fresh PostgreSQL 17 with the Supabase platform stubs
(`auth`, `storage`, the API roles, `pg_cron`/`pg_net`), each file in its own
transaction exactly as `apply.sh` sends them:

| Check | Result |
|---|---|
| files applied | **143 / 143**, 0 failures (`140` migrations + `3` seed) |
| objects after the chain | functions **239**, tables **131**, columns **1372**, indexes **537**, policies **328**, triggers **79**, views **2** |
| seed present | `chart_of_accounts` 61, `items` 6, `customers` 1 |
| consolidated in one transaction | fails at `0060`, `unsafe use of new value "fulfilled"` — the reason the old path could not be regenerated |
| `0960_rls_tenant_isolation` | PASS (identity-free, as `apply.sh` runs it) |
| `0965_opening_stock_authorization` | PASS (identity-free) |
| `0900`, `0920`, `0930` smokes | PASS with an admin `request.jwt.claims` |
| `0910`, `0950` smokes | FAILED at first — two stale test bugs, fixed below — then PASS |

Two of the committed smokes had rotted against later signatures and could no
longer run at all:

- `0910` called `post_invoice_from_order(v_order, '2026-04-10')`. Since `0064`
  the second argument is `p_lines jsonb`, so the date was parsed as JSON:
  `invalid input syntax for type json`. It now passes `(v_order, null, true,
  '2026-04-10')`.
- `0950` compared `journal_entries.source_id = rcpt::text` while `source_id` is
  `uuid`: `operator does not exist: uuid = text`. The cast is gone.

### CI gate on the chain (2026-10-21)

The replay above lived in a scratch directory, so it proved the chain once, on
one machine. It is now in the repository and runs on every push:

- [`app/supabase/replay.sh`](../app/supabase/replay.sh) rebuilds a disposable
database — platform stubs, then the chain in `apply.sh --list` order, one file
per transaction — and runs all seven tests. The five permission-gated smokes
get a throwaway admin and a `request.jwt.claims` sub; `0960`/`0965` run first,
because they expect the first auth user to become the bootstrap admin.
- [`app/supabase/tests/_bootstrap.sql`](../app/supabase/tests/_bootstrap.sql)
is the committed platform stub: api roles, `auth`/`storage` tables and the
`auth.jwt`/`auth.uid`/`auth.role`/`storage.foldername` helpers, plus
`pg_cron`/`pg_net` entry points. Idempotent, so a rebuild can be re-run.
- `ci.yml` gained a `db` job: a `postgres:17` service, the schema replayed with
`DATABASE_URL`, and every test. `pgcrypto` is kept there (the image has
contrib) and stripped only when the server lacks it, so CI executes the same
statements production does. `pg_cron`/`pg_net` DDL is always stripped.

`replay.sh` invokes the chain source as `bash apply.sh --list`, not `./apply.sh`.
The repository stores `apply.sh` as mode `100644` (a Windows checkout does not
track the exec bit), so a fresh clone on Linux would fail with `Permission
denied` before applying anything — the first CI run would have gone red for the
wrong reason.

Verified locally, both runs against a live PostgreSQL 16/17 cluster:

| Check | Result |
|---|---|
| `replay.sh`, first run | exit **0** — 143 files, 7/7 tests |
| `replay.sh`, second run on the same cluster | exit **0** — rebuild is idempotent |
| negative control: `select 1/0` appended to `0041_sales_returns.sql` | exit **1**, `✗ migrations/0041_sales_returns.sql`, `chain stopped at … — 43 files applied` |
| `ci.yml` | parses; jobs `build`, `db`; psql ensured, `bash replay.sh` with `DATABASE_URL` |

The negative control matters: without it a green job could simply mean the
script exited early. The workflow itself has not run in GitHub Actions yet.

### Limits of this run

- No production rows: the RLS test proves the predicates and policies, not that
  a specific customer's data is correctly scoped.
- `0128`'s storage policies were exercised at the policy level only.
- The nightly invariants workflow is still untested against a live staging URL.
- The two `0056` defects are proven against the clone's copy of
  `has_permission`/`current_app_user`, not against production data.
- The bootstrap path was proven against a local Postgres with stubbed
  `auth`/`storage`, not by running `apply.sh` against a empty Supabase project
  (that needs a disposable project and a personal access token).
- The `db` CI job has not executed on GitHub; it was validated by parsing the
  YAML and by running the same `replay.sh` locally. Its first real run will
  also be the first psql-16-client-against-17-server check.
- The chain has two files numbered `0050` (`0050_credit_limit_soft_block`,
  `0050_party_profiles`). Order is only well-defined because the chain sorts
  by filename; nothing depends on which runs first today.

### Deployed to NEWBIZZ (2026-10-21)

`0128`–`0135` are no longer repo-only. They were applied to the production
project (`wmpxwpubfxpexybqnynz`, NEWBIZZ, ap-southeast-1) through the Supabase
Management API, in number order, one migration per call, so production history
is now `…0127`, `0136`, `0128`, `0129`, `0130`, `0131`, `0132`, `0133`, `0134`,
`0135`, `0137`. Ordering by number is still out of sequence in the history
table; dependency order is intact.

The pre-flight was read-only and ran before the first file:

| Check | Result |
|---|---|
| live invoices per order (would break `0133`'s unique index) | none |
| existing `void_receipt` / `reconciliation_checks` / `ar_drift_by_customer` … | no collisions |
| `customer_ledger.seq` | absent, so `0131` adds it |
| `receipt_allocations` rows vs `customer_receipts.allocated_amount` | 0 mismatches |
| rows at risk | 11 invoices (2 void), 2 receipts, 16 ledger rows, 5 orders, 5 users |

**`0137_delivery_receivable_round_off.sql` was written during the deploy.**
`0134`'s `reconciliation_checks()` ran immediately after it landed and reported
`AR GL vs invoice + delivery subledger` drift of `0.16` — on a ledger that was
correct. The delivery journal posts `Dr 1130 AR 340.00 / Cr 4100 288.00 /
Cr 2120 51.84 / Cr 5700 round-off 0.16`, so the receivable is the whole `1130`
debit; `0131` and `0134` computed `1130 − abs(5700)`, as if the round-off
reduced what the customer owes. Two consequences: the new invariant cried wolf
on good books, and `rebuild_customer_ledger()` — the documented repair path —
would have written a 0.16-low sale row, i.e. introduced the drift it exists to
remove. `0137` makes the delivery receivable the `1130` debit in all three
places (the check, the per-customer drill-down, the rebuild).

Verified on production after `0137`:

| Check | Result |
|---|---|
| `reconciliation_checks()` | 4/4 `ok` — AR `1394.00` = invoices due `1054.00` + delivery-only `340.00`; AR − advances `1394.00` = ledger `1394.00`; allocations `320.00` = `allocated_amount` `320.00`; stock `0.02` off (within the `0.05` tolerance, avg-cost rounding) |
| `ar_drift_by_customer()` | 0 rows |
| `rebuild_customer_ledger()` inside a rolled-back transaction | runs clean, `ar_drift_by_customer()` still 0 rows inside the same transaction, `customer_ledger` still 16 rows afterwards — the repair path is now consistent and idempotent on real data |
| applied history | `0137` recorded as `delivery_receivable_round_off` |

Nothing was rebuilt or rewritten in production: the drift was in the formula,
not the rows, so the correct repair was to fix the formula. `success` from the
Management API was not treated as proof — every claim above is a query result
against the live database.

`apply.sh` gained `--from` / `--to` for this (`bash apply.sh --from 0128 --to
0135`); the default remains the full chain, `--list` is unchanged, and a
reversed or non-matching range exits `1` with a message.

### Rehearsal target, and the nightly alarm (2026-10-21)

A Supabase preview branch on NEWBIZZ was the chosen place to rehearse the next
migration, and `create_branch` refused it: `Branching is supported only on the
Pro plan or above`. `get_cost` quotes a branch at `$0.01344/hour` (≈ $9.7/month),
but that price assumes Pro, so the entry cost is the plan upgrade. `get_cost`
quotes a **new project at `$0`/month**; the constraint there is not money but
capacity — the organization already runs two active projects (Printerfen,
NEWBIZZ), and a free organization caps how many can be active at once.

Either way, the drifting-books alarm does not depend on a second database.
`/api/cron/integrity` already calls `reconciliation_checks()` as the deployed
`service_role` and answers `503` when any check is not `ok`.

Scheduling it on Vercel was the wrong home. The team is on the **Hobby** plan,
which allows two cron jobs, each running at most once a day, so the entry would
have consumed the last slot and vanished if the app moved. `0078` already sets
the better precedent: pg_cron is primary and the HTTP route is the portable
fallback. `0139_integrity_daily_scan.sql` does the same for reconciliation —
see below. `app/vercel.json` is back to the single notification cron it had
before, and `db-invariants.yml` remains the CI fallback, still skipping while
`STAGING_DATABASE_URL` is unset.

Verified: `service_role` holds `EXECUTE` on `reconciliation_checks` and
`ar_drift_by_customer` (and only `service_role` on `rebuild_customer_ledger`);
`app/vercel.json` parses and lists both crons. The route itself was not invoked
end to end — that needs the deployed `CRON_SECRET` and service key, so its first
real run is the first scheduled one.

### Convergence gap, measured (2026-10-21)

With `0128`–`0137` applied, the repo→production direction is closed: all 15
functions the earlier replay listed as repo-only exist live (checked name by
name). Production holds **246** public functions, a clean replay **239**, and
**7** functions no migration defines — 239 + 7 = 246 exactly, so nothing from
the repo is missing from the database.

The other direction is still open, and now measured rather than estimated:

| Gap | Verified |
|---|---|
| `issued_numbers` (74 rows; `doc_number`, `doc_type`, `created_at`) | the **only** live table that no `create table` in `migrations/` or `seed/` creates (131 in the repo vs 132 live). Not vestigial — the undocumented number scheme writes to it. It has 0 policies, so it is the table delta but **not** the source of the 329-vs-328 policy delta, which stays unexplained |
| 7 undocumented functions | `link_store_qr`, `my_activity`, `my_transfers_and_custody`, `record_visit` (mobile `p2_*`/`p3_*`), `_random_digits`, `_random_token`, stale `store_item_prices(uuid, uuid[])` — zero hits for any name anywhere under `migrations/` or `seed/` |
| `send-push` edge function | ACTIVE at version 3, no `functions/send-push/` in the repo, while `0114_push_webhook.sql` points a DB webhook at it |
| 21 function bodies | differ from the repo once comments are normalised (numbering, GST invoicing, delivery posting, supplier bills, portal write path) |

So a rebuild from the repo today is a different system: the mobile field RPCs
and the number scheme disappear, and push has no target. Closing this is the
next piece of work; the rehearsal database only starts paying for itself once
the two sides are close enough to compare.

### Undocumented objects recovered (2026-10-21)

`0138_numbering_and_field_rpcs.sql` closes the numbering half of that gap. It
adds `issued_numbers`, `_random_digits`, `_random_token`, the production bodies
of `next_number` / `next_entity_code`, the four uncommitted field RPCs
(`link_store_qr`, `my_activity`, `my_transfers_and_custody`, `record_visit`),
and the superseded two-argument `store_item_prices`. Definitions were dumped
from NEWBIZZ with `pg_get_functiondef()`; the bodies are semantically verbatim
and reformatted, not rewritten.

The two allocators replace the earlier `entity_serials` scheme in `0063`: the
live code allocates entity codes as a prefix plus five random digits and
document numbers as a prefix plus four random digits (statutory series —
`invoice`, `credit_note`, `debit_note`, `journal` — still come gap-free off
`number_series`), and uniqueness comes from `issued_numbers`' primary key, with
the allocator retrying on `unique_violation`.

Verified on a **fresh build** (PostgreSQL 18, `replay.sh`; 145 chain files —
142 migrations plus the three seed files, after the platform stub): chain exit
`0`, all seven tests pass, `issued_numbers` present with RLS on and 0 policies,
all nine function signatures present, and a rolled-back allocation produced
`CUS54889`, `OD26278315` and statutory `SL26270001` — then rolled back clean.
Applied to NEWBIZZ as `numbering_and_field_rpcs`. Afterwards: 74 rows in
`issued_numbers` still 74, a rolled-back allocation on production succeeds, and
`reconciliation_checks()` is unchanged at 4/4 `ok`.

`app/supabase/functions/send-push/index.ts` closes the other half: the source
was pulled from the deployed function (version 3) and committed, so the webhook
in `0114` has a target in a rebuild. It is transcribed, not re-derived — checked
structurally (balanced, 152 lines, all seven key markers present), not deployed
from the repo.

### Nightly alarm moved into the database (2026-10-21)

`0139_integrity_daily_scan.sql` adds `integrity_daily_scan()`: it runs
`reconciliation_checks()` and, for every check that is not `ok`, notifies each
holder of `accounting.manage` through the existing `notify()` channel — so a
drift reaches the bell, the badge and (via `0114`'s webhook) the phones with no
new delivery mechanism. It is scheduled by pg_cron at `45 1 * * *`, half an hour
before the notification sweep, and runs whether or not the Next.js app is up.

**The first version of it was broken, and only a simulated drift exposed it.**
Dedup compared `notifications.entity_id` to the check name, but that column is
`uuid`, so the loop raised `operator does not exist: uuid = text` the moment a
check actually drifted — and the zero-drift run returned `{checks: 4,
notifications: 0}` through the non-drifting path, hiding it. The nightly job
would have thrown every night it mattered. Fixed by keying dedup on the
notification title instead, which is stable per check.

Verified on NEWBIZZ, with each simulation inside a rolled-back transaction:

| Check | Result |
|---|---|
| `cron.job` | two active jobs — `notification-daily-scan` `15 2 * * *`, `integrity-daily-scan` `45 1 * * *` |
| real data | `{checks: 4, drifting: 0, notified: 0}`, no notifications written |
| simulated drift | 1 notification, 1 recipient, title `Books do not balance: SIMULATED drift` — the alert path works end to end |
| after rollback | 4 real checks back, no renamed leftover, 0 `integrity` notifications |
| recipients | `resolve_recipients('accounting.manage')` = 1, so the fan-out is not silent |

History and state took an extra step to line up. The buggy body was applied as
`integrity_daily_scan`, so patching the function in place would have left a
migration record that recreates the bug on any rebuild. The corrected body was
therefore applied again as `integrity_daily_scan_dedup_fix`, and the repository
file already carries only the fixed version — so production history is
`integrity_daily_scan` then `integrity_daily_scan_dedup_fix`, while a rebuild
from the repo installs the fix once.

**What that leaves.** The rebuild now reproduces the numbering subsystem, the
field RPCs and the push function, so the remaining differences are the 19 other
function bodies that differ from production (`next_number` and
`next_entity_code` are now reconciled), the stale two-argument
`store_item_prices` — now committed deliberately, awaiting a decision to drop it
once no deployed client calls it — and the still-unexplained 329-vs-328 policy
delta. Separately, `0114`'s webhook URL hardcodes the NEWBIZZ project ref, so any
other project built from this repo would post its notifications back to NEWBIZZ.
