# Challan Lifecycle Linkage — Design (Web order book → challan → print → cancel cascade)

Date: 2026-09-14
Status: Approved by product owner
Scope: web app (`app/`), ONE new migration (`app/supabase/migrations/0120_…`), one mobile URL
correction + APK rebuild. The core model (challan = goods-in-transit, delivery posts the
value event, `qty_fulfilled` rollup auto-completes orders) is already correct and UNCHANGED.

## 1. Problem (verified, not theory)

1. **No challan-raising path exists in the live web UI.** `createChallan` action +
   `create_challan` RPC are fully built, but the only UI that ever called them
   (`orders/[id]/OrderFulfilment.tsx`) is DEAD CODE — the order detail page renders
   `FulfilOrderAction.tsx` (fulfil-as-sale only). Users literally cannot "create a
   delivery challan for the orders that he wanted, before delivery."
2. **Challan print/PDF does not exist anywhere**, and `mobile/src/data/challans.ts`
   `challanPdfUrl()` points at `/challans/[id]/print`, a route that doesn't exist (404).
3. **Creator blindness (real RLS bug):** `read_challans` (0107:193) hides every challan
   until the office "releases" it; `create_challan` never registers a release — so an
   operator/manager who raises a challan cannot see his own challan afterwards.
4. **No cancel linkage, both directions broken:**
   - `cancel_order` (live = 0102:643) only permits `draft|confirmed`, so an
     `approved` order can NEVER be cancelled — yet the web UI shows Cancel for approved
     (orders/[id]/page.tsx:22) and fails at the RPC.
   - When an order with open challans could be cancelled, the challans would be left
     dangling (no cascade exists).

## 2. Agreed model (user-confirmed)

```
order created → challan raised (goods leave, tracking only)
             → vehicle transports (in_transit)
             → mark delivered   → stock + revenue post; qty_fulfilled rolls up;
                                  order auto-flips to fulfilled when nothing remains
order cancelled  → every OPEN (printed/in_transit) challan auto-cancels
order has DELIVERED challans → cannot cancel (revenue already posted); use
                                  credit/collection flows — RPC raises a guidance error
```
Partial/multi-trip = multiple challans per order (remaining-qty validated per line).
"Fulfil all & deliver" (post_delivery) remains the one-click shortcut and already
auto-fulfils the order (0060:174).

## 3. Changes

### 3.1 Migration `0120_challan_lifecycle_linkage.sql` (apply via Supabase MCP to live
project `wmpxwpubfxpexybqnynz`, per repo convention)

a. **Creator carve-out** — replace `read_challans` and `read_challan_lines` policies by
   copies of the 0107 versions PLUS `or created_by = public.current_app_user()`
   (mirrors the field-document carve-out 0107 itself describes for own memos).
   `current_app_user()` exists (0004:13); `delivery_challans.created_by` is nullable
   and always set by create_challan.

b. **`cancel_order` redefinition** — copy the live 0102 body verbatim, then:
   - allowed statuses become `draft, confirmed, approved`;
   - new guard BEFORE the status update: if the order has a `delivered` challan →
     `raise 'cancel_order: order % has delivered challans — cancel would strand posted revenue. Deliver the rest or use office reconciliation.'`;
   - after flipping the order to cancelled: cascade
     `update delivery_challans set status='cancelled' where order_id = p_order and
      status in ('printed','in_transit')` with one `write_audit('update','delivery_challans',
      <id>, 'Auto-cancelled: order <no> cancelled', …, v_actor)` per row, plus the order's
      existing audit message gains the auto-cancel count;
   - keep `order.cancel` permission gate, `for update` lock, grants/revoke as 0102:1497.
   Open challans have zero accounting side effects (value posts only at delivery, 0060),
   so the cascade is a pure status flip — safe.

### 3.2 Web — raise challan from the order book
- New client component `orders/[id]/RaiseChallanAction.tsx`: same Drawer pattern as
  `FulfilOrderAction.tsx`, but simpler: per-line remaining qty prefilled
  (`l.qty - l.qtyFulfilled`, 0/blank allowed), NO price/GST editing (challan is
  tracking-only), one optional notes field. Submit → `createChallan()` server action
  (already exists) → toast → `router.push('/challans/' + challanId)`. Client-side
  per-line cap at remaining; server RPC re-validates.
- Mount on `orders/[id]/page.tsx` beside Fulfil when `canFulfil`; supports
  `?action=challan` auto-open (Next 14 `searchParams` prop).
- `OrdersTable.tsx` row: add a ghost **"Challan"** link → `/orders/<id>?action=challan`
  for `confirmed|approved` (next to existing Fulfil). This is the user's
  "every order shall have a delivery challan create action button".
- Delete dead `orders/[id]/OrderFulfilment.tsx`.

### 3.3 Web — printable challan
- New top-level route `app/src/app/print/layout.tsx` + `app/src/app/print/challan/[id]/page.tsx`
  (own `<html><body>`, outside the (app) shell — middleware keeps it login-gated,
  `getChallan` keeps it RLS-gated; creator + release managers + challan.view-released can open).
- Document layout: NEWBIZZ header + company GSTIN/state, "DELIVERY CHALLAN" +
  challan_no/date, order ref, customer + store + address, carried-by, eway bill,
  lines table (item, SKU, qty, unit), totals, signature block. Small sticky
  "Print" button (client, `window.print()`) hidden via `@media print`, plus
  auto-open print dialog param `?p=1` (deferred — button only for v1).
- Add Print link (opens new tab) in `ChallansTable.tsx` rows and
  `challans/[id]/page.tsx` header actions.

### 3.4 Mobile
- `challanPdfUrl()` → `${base}/print/challan/${id}` (matches 3.3). No other code change;
  the creator carve-out makes the operator's own challans appear in his Challans list.
- Known limitation (accepted, follow-up): in-app WebBrowser has no web session → the
  office prints the challan PDF; tokenized mobile share is a later feature.
- Bump `app.json` 1.0.2 / versionCode 3 (+ build.gradle), rebuild, install.

## 4. Explicitly out of scope
Auto-releasing challans on create; tokenized print URLs for mobile; close_partial
challan cascade (order closes only when nothing remains; no dangling window);
invoicing changes; mobile UI changes beyond the URL fix.

## 5. Verification
- Migration smoke: `select` new policy definitions via MCP; JWT-impersonation DO-block
  test (as repo's 0940-style smokes) asserting creator sees own unreleased challan and a
  plain operator does NOT see others'.
- cancel_order: raise matrix (draft/confirmed ok; approved-no-delivered ok + cascade
  count; approved-with-delivered rejected) against the live project in a scratch FY?
  — NO: use a transactional test order created+rolled back via MCP execute_sql single
  session (begin/rollback) to avoid production data impact.
- Web: `npm run typecheck`, `npm run lint`, `npm run build`; manual: order book →
  Challan → drawer → created challan page → print.
- Mobile: tsc + jest green, assembleRelease, install; operator Challans tab lists his
  own new challan.
