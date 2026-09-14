# Challan Lifecycle Linkage — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the order book a working "raise delivery challan" flow, a printable challan page, creator-visibility for challans, and cancel-cascade between orders and their open challans.

**Architecture:** One SQL migration (policies + `cancel_order` redefinition), one web client component + row action (Drawer pattern cloned from `FulfilOrderAction.tsx`), one standalone print route under a bare layout, one mobile URL constant + APK rebuild. No RPC changes to `create_challan`/`post_delivery`/`set_challan_status`.

**Tech Stack:** Next.js 14.2 app router (sync `params`, Tailwind + `components/ui` primitives), Postgres RLS + SECURITY DEFINER functions, Expo RN mobile.

**Spec:** `docs/superpowers/specs/2026-09-14-challan-lifecycle-design.md`

## Global Constraints

- Live DB is Supabase project `wmpxwpubfxpexybqnynz`; migrations are applied by the CONTROLLER via the Supabase MCP `apply_migration` tool (subagents write the .sql file only). Migration sequence number: **0120** (feature numbering; 09xx smoke sentinels untouched).
- Money/stock/cash mutations only via existing SECURITY DEFINER RPCs. The new migration contains: two `create policy` swaps + one `create or replace function cancel_order` (plpgsql, `security definer`, `set search_path = public`) following 0102 house style exactly, ending with the same `revoke ... from public, anon; grant execute ... to authenticated;` pair.
- `delivery_challans` has NO `updated_at` column (status flips only). Audit via `write_audit(event, entity, entity_id, message, meta jsonb, actor)`.
- Permission codes unchanged: create/status = `challan.record`, cancel = `order.cancel`; `current_app_user()` (0004) is the RLS identity helper.
- Challan documents never print prices/GST (goods tracking only) — line table shows item, SKU, qty.
- Web UI must reuse existing components only: `Button`, `Drawer`, `Panel`/`Card`, `Field`/`Input`, `Table` family, `useToast`, `StatusBadge`, `PageContainer`/`PageHeader`, `getChallan`, `getCompany`, `createChallan` (server action, `@/lib/actions/challans`).
- Web gates: `cd app; npm run typecheck && npm run lint`. Mobile gates: `cd mobile; npx tsc --noEmit && npm test` (currently 50/50). No emojis.
- Work on branch `feat/mobile-phase2`. One commit per task.

## File Structure

| File | Action |
|---|---|
| `app/supabase/migrations/0120_challan_lifecycle_linkage.sql` | Create (T1) |
| `app/src/app/(app)/orders/[id]/RaiseChallanAction.tsx` | Create (T2) |
| `app/src/app/(app)/orders/[id]/page.tsx` | Modify (T2 mount + autoOpen param) |
| `app/src/app/(app)/orders/OrdersTable.tsx` | Modify (T2 row link) |
| `app/src/app/(app)/orders/[id]/OrderFulfilment.tsx` | Delete (T2) |
| `app/src/app/print/layout.tsx` | Create (T3) |
| `app/src/app/print/challan/[id]/page.tsx` | Create (T3) |
| `app/src/app/(app)/challans/ChallansTable.tsx` | Modify (T3 Print link) |
| `app/src/app/(app)/challans/[id]/page.tsx` | Modify (T3 Print link) |
| `mobile/src/data/challans.ts` | Modify (T4 challanPdfUrl) |
| `mobile/app.json`, `mobile/android/app/build.gradle` | Modify (T4 version bump) |

---

### Task 1: Migration 0120 — creator visibility + cancel cascade

**Files:**
- Create: `app/supabase/migrations/0120_challan_lifecycle_linkage.sql`

**Interfaces:**
- Produces: `read_challans`/`read_challan_lines` policies that add `or created_by = public.current_app_user()` (lines policy via parent-challan EXISTS); `cancel_order(uuid, text)` that accepts `draft|confirmed|approved`, rejects when a `delivered` challan exists, and auto-cancels `printed|in_transit` challans with audits. Consumed by T2/T4 flows and live DB.

- [ ] **Step 1: Write the migration file**

```sql
-- 0120_challan_lifecycle_linkage.sql
-- Challan lifecycle linkage (spec 2026-09-14-challan-lifecycle-design):
--   1. Creator carve-out: whoever raises a challan can always read it (and its
--      lines) even before the office releases it. Mirrors the field-document
--      carve-out 0107 describes for own memos.
--   2. cancel_order cascade: cancelling an order auto-cancels its OPEN
--      (printed/in_transit) challans - those carry zero accounting (value
--      posts only at delivery, 0060). An order with DELIVERED challans can no
--      longer be cancelled (revenue already posted) - error guides the user.
--      Approved orders become cancellable (previously the RPC refused while the
--      web UI offered the button - mismatch fixed here).

-- =====================================================================
-- 1. Read policies: add creator carve-out
-- =====================================================================
drop policy if exists read_challans on public.delivery_challans;
create policy read_challans on public.delivery_challans
  for select to authenticated
  using (
    has_permission('release.manage')
    or (created_by is not null and created_by = public.current_app_user())
    or (has_permission('challan.view') and public.document_is_released('challans', delivery_challans.id))
  );

drop policy if exists read_challan_lines on public.delivery_challan_lines;
create policy read_challan_lines on public.delivery_challan_lines
  for select to authenticated
  using (
    has_permission('release.manage')
    or exists (
      select 1 from public.delivery_challans c
      where c.id = delivery_challan_lines.challan_id
        and c.created_by is not null
        and c.created_by = public.current_app_user()
    )
    or (has_permission('challan.view') and public.document_is_released('challans', delivery_challan_lines.challan_id))
  );

-- =====================================================================
-- 2. cancel_order: + approved, + delivered-challan guard, + open-challan cascade
-- =====================================================================
create or replace function cancel_order(p_order uuid, p_reason text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status order_status;
  v_no     text;
  v_delivered int := 0;
  v_cascade   int := 0;
  v_c     record;
  v_actor uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
begin
  if not has_permission('order.cancel') then
    raise exception 'cancel_order: not authorized (order.cancel required)';
  end if;
  if p_order is null then raise exception 'cancel_order: order id required'; end if;

  select status, order_no into v_status, v_no
    from sales_orders where id = p_order for update;
  if v_status is null then
    raise exception 'cancel_order: unknown order %', p_order;
  end if;
  if v_status not in ('draft','confirmed','approved') then
    raise exception 'cancel_order: order % is % - only draft/confirmed/approved orders can be cancelled', v_no, v_status;
  end if;

  select count(*) into v_delivered
    from delivery_challans
    where order_id = p_order and status = 'delivered';
  if v_delivered > 0 then
    raise exception 'cancel_order: order % has delivered challan(s) - revenue is already posted. Deliver the rest or ask the office to reconcile; cancellation is not possible.', v_no;
  end if;

  update sales_orders
     set status = 'cancelled',
         notes  = case
                    when nullif(trim(coalesce(p_reason,'')),'') is null then notes
                    when notes is null or notes = '' then 'Cancelled: '||trim(p_reason)
                    else notes || E'\n' || 'Cancelled: '||trim(p_reason)
                  end
   where id = p_order;

  for v_c in
    select id, challan_no from delivery_challans
     where order_id = p_order and status in ('printed','in_transit')
     for update
  loop
    update delivery_challans set status = 'cancelled' where id = v_c.id;
    insert into document_releases (entity_type, entity_id, released_at, released_by)
      select 'challans', v_c.id, now(), v_actor
      where not exists (
        select 1 from document_releases r
        where r.entity_type = 'challans' and r.entity_id = v_c.id
      );
    perform write_audit('update','delivery_challans', v_c.id,
              format('Challan %s auto-cancelled: order %s cancelled', v_c.challan_no, v_no),
              jsonb_build_object('challan_no', v_c.challan_no, 'from', 'printed/in_transit', 'to', 'cancelled', 'order_no', v_no),
              v_actor);
    v_cascade := v_cascade + 1;
  end loop;

  perform write_audit('update','sales_orders', p_order::text,
            format('Order %s cancelled%s%s', v_no,
                   case when nullif(trim(coalesce(p_reason,'')),'') is null
                        then '' else ': '||trim(p_reason) end,
                   case when v_cascade > 0
                        then format(' (%s open challan(s) auto-cancelled)', v_cascade)
                        else '' end),
            jsonb_build_object('order_no', v_no, 'from', v_status, 'to', 'cancelled', 'challans_cancelled', v_cascade),
            v_actor);
  return p_order;
end $$;

revoke all on function cancel_order(uuid, text) from public, anon;
grant execute on function cancel_order(uuid, text) to authenticated;
```

DECISION BODIES THE DOC: the `document_releases` insert inside the cascade makes each
auto-cancelled challan permanently visible to challan.view holders (status cancelled),
otherwise cancelled challans would be invisible to the office and audit-unfindable.
Verify `document_releases` column names against 0107:50-57 before finalizing
(entity_type, entity_id, released_at, released_by; PK on the pair).

- [ ] **Step 2: Self-check the SQL against live schema truth**
Read `0107_fine_grained_release.sql` policy texts + `document_releases` DDL and the live
`delivery_challans` column list (from `app/src/lib/supabase/database.types.ts` ~:2233);
confirm: no `updated_at` used, FK names valid, `order_status`/`challan_status` enums spelled
right, `has_permission`/`current_app_user`/`write_audit`/`document_is_released` signatures match usage.

- [ ] **Step 3: Commit**
`git add app/supabase/migrations/0120_challan_lifecycle_linkage.sql` →
`git commit -m "feat(db): challan creator visibility + order-cancel cascade (0120)"`

CONTROLLER (not subagent): after review approval, apply via Supabase MCP
`apply_migration(project_id wmpxwpubfxpexybqnynz, name challan_lifecycle_linkage, query = file)`
then run the read-only smoke:
`select polname, polqual is not null from pg_policy where polname in ('read_challans','read_challan_lines');` and
`select prosrc from pg_proc where proname='cancel_order' and prosrc like '%auto-cancelled%';`

---

### Task 2: Web — Raise Challan from order book + detail

**Files:**
- Create: `app/src/app/(app)/orders/[id]/RaiseChallanAction.tsx`
- Modify: `app/src/app/(app)/orders/[id]/page.tsx`
- Modify: `app/src/app/(app)/orders/OrdersTable.tsx`
- Delete: `app/src/app/(app)/orders/[id]/OrderFulfilment.tsx`

**Interfaces:**
- Consumes: `OrderLine` from `@/lib/data/sales` (`id, item_id, itemName, sku, qty, qtyFulfilled, unit_price, gst_rate, line_no`); `createChallan({ order_id, lines: {order_line_id, qty}[], notes? })` → `{ ok, challanId } | { ok:false, error }`; Drawer/Button/Input/Toast as used in FulfilOrderAction.
- Produces: `<RaiseChallanAction orderId orderNo lines autoOpen />`; order-book row link `/orders/<id>?action=challan`.

- [ ] **Step 1: `RaiseChallanAction.tsx`** — clone FulfilOrderAction's structure, stripped:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Panel, Card } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Field";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { createChallan } from "@/lib/actions/challans";
import type { OrderLine } from "@/lib/data/sales";

// Delivery challan = goods-in-transit note. Tracking only: no prices, no
// accounting. Delivery (or "Fulfil all & deliver") is what posts value.
export function RaiseChallanAction({
  orderId, orderNo, lines, autoOpen = false,
}: {
  orderId: string;
  orderNo: string;
  lines: OrderLine[];
  autoOpen?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(autoOpen);
  const [pending, startTransition] = useTransition();
  const [notes, setNotes] = useState("");
  const [qtys, setQtys] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      lines.map((l) => [l.id, String(Math.max(l.qty - l.qtyFulfilled, 0))]),
    ),
  );

  function setQty(id: string, v: string) {
    setQtys((xs) => ({ ...xs, [id]: v.replace(/[^0-9.]/g, "") }));
  }

  const entries = lines
    .map((l) => ({ line: l, qty: Number(qtys[l.id] ?? "") }))
    .filter((e) => Number.isFinite(e.qty) && e.qty > 0);
  const over = entries.find((e) => e.qty > Math.max(e.line.qty - e.line.qtyFulfilled, 0));
  const canSubmit = entries.length > 0 && !over && !pending;

  function submit() {
    if (!canSubmit) return;
    startTransition(async () => {
      const res = await createChallan({
        order_id: orderId,
        lines: entries.map((e) => ({ order_line_id: e.line.id, qty: e.qty })),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
      if (res.ok) {
        toast.success("Challan raised", `Delivery note created for ${orderNo}.`);
        router.push(`/challans/${res.challanId}`);
        router.refresh();
      } else {
        toast.error("Could not raise challan", res.error);
      }
    });
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Raise challan
      </Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={`Delivery challan for ${orderNo}`}
        description="Goods-out tracking note. No prices, no accounting until delivery."
        size="lg"
      >
        <div className="flex flex-col gap-4">
          <Panel title="Delivering now" flush>
            <Table>
              <THead>
                <TR>
                  <TH>Item</TH>
                  <TH numeric className="w-24">Remaining</TH>
                  <TH numeric className="w-28">Qty</TH>
                </TR>
              </THead>
              <TBody>
                {lines.map((l) => {
                  const remaining = Math.max(l.qty - l.qtyFulfilled, 0);
                  const bad = over?.line.id === l.id;
                  return (
                    <TR key={l.id}>
                      <TD>
                        <span className="font-medium text-ink">{l.itemName}</span>
                        {l.sku && <span className="ml-1.5 font-mono text-[11px] text-ink-4">{l.sku}</span>}
                      </TD>
                      <TD numeric className="font-mono text-[12px] text-ink-3 tnum">{remaining}</TD>
                      <TD numeric>
                        <Input
                          mono
                          inputMode="decimal"
                          className={"w-full text-right" + (bad ? " border-red" : "")}
                          value={qtys[l.id] ?? ""}
                          onChange={(e) => setQty(l.id, e.target.value)}
                        />
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
            {over && (
              <p className="px-4 pb-3 text-[12px] text-red">
                {over.line.itemName}: cannot deliver more than its remaining {Math.max(over.line.qty - over.line.qtyFulfilled, 0)}.
              </p>
            )}
          </Panel>
          <Field label="Notes (optional)">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Vehicle, driver, seal no…" />
          </Field>
          <Card className="flex items-center justify-end gap-2 p-4">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
            <Button variant="primary" size="md" onClick={submit} loading={pending} disabled={!canSubmit}>
              Create challan
            </Button>
          </Card>
        </div>
      </Drawer>
    </>
  );
}
```

(Confirm `Button` supports `variant="secondary"` — read Button.tsx; if only primary/ghost exist, use ghost.)

- [ ] **Step 2: Mount on detail page** — `orders/[id]/page.tsx`: signature becomes
`{ params, searchParams }: { params: { id: string }; searchParams: { action?: string } }`;
import RaiseChallanAction; inside the `canFulfil` render block next to `<FulfilOrderAction ... />`
add `<RaiseChallanAction orderId={order.id} orderNo={order.orderNo} lines={order.lines} autoOpen={searchParams.action === "challan"} />`
(match the real prop names/order shape by reading the file first).

- [ ] **Step 3: Order book row action** — in `OrdersTable.tsx` at the confirmed/approved
block (lines 110-114) keep "Fulfill" and add beside it:
`<Link href={`/orders/${o.id}?action=challan`}><Button variant="ghost" size="sm">Challan</Button></Link>`

- [ ] **Step 4: Delete dead file** — `git rm "app/src/app/(app)/orders/[id]/OrderFulfilment.tsx"`
(verify zero importers first: grep src for "OrderFulfilment" — must be only its own file;
`closePartialOrder` action stays — unused elsewhere is fine, server action).

- [ ] **Step 5: Gates** — `cd app; npm run typecheck && npm run lint` clean.

- [ ] **Step 6: Commit** — `git commit -m "feat(orders): raise delivery challan from order book and detail; drop dead fulfilment UI"`

---

### Task 3: Web — printable challan page

**Files:**
- Create: `app/src/app/print/layout.tsx`
- Create: `app/src/app/print/challan/[id]/page.tsx`
- Modify: `app/src/app/(app)/challans/ChallansTable.tsx`
- Modify: `app/src/app/(app)/challans/[id]/page.tsx`

**Interfaces:**
- Consumes: `getChallan(id)` → `ChallanDetail | null` (fields listed in data/challans.ts:
id, challan_no, status, orderId, orderNo, customerName, storeName, storeCode, agentName,
ewayBillNo, notes, printedAt, dispatchedAt, deliveredAt, lines[{itemName, sku, qty}], totalQty);
`getCompany()` from `@/lib/data/settings` (check exact return fields used by the receipt page:
legalName/address/gstin/state — mirror how sales/receipt/[id]/page.tsx maps it).
- Produces: route `GET /print/challan/<id>` (login-gated by existing middleware, RLS-scoped),
opened via new-tab links from both challan surfaces.

- [ ] **Step 1: Bare print layout** — `app/src/app/print/layout.tsx`:

```tsx
import type { Metadata } from "next";
export const metadata: Metadata = { title: "NEWBIZZ — Delivery Challan" };

export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ background: "#fff" }}>{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: Print page** — `app/src/app/print/challan/[id]/page.tsx`: server component;
`getSession()` → redirect `/login` if none (belt over middleware); `getChallan`; notFound
if null; company via `getCompany()` (mirror the mapping receipt page does); document:
NEWBIZZ / company name + address + GSTIN line; h1 "DELIVERY CHALLAN"; meta grid
(challan no + date IST, order no, customer, store + code, carried by, eway bill);
lines table (Sr, Item, SKU, Qty) + total row; notes; signature blocks (Dispatched by /
Received by); date/time footer. A sticky "Print" client button — create
`app/src/app/print/PrintButton.tsx` (`"use client"; <Button onClick={() => window.print()}>Print</Button>`
with `className="print:hidden"` on its wrapper). Styling: Tailwind, ink fonts from the
existing design tokens/classes, `@media print` handled by Tailwind `print:` variants
(print:shadow-none, hide app chrome). Keep it one clean A4.

- [ ] **Step 3: Links** — ChallansTable row actions cell: prepend
`<Link href={`/print/challan/${c.id}`} target="_blank" className="text-[12px] text-brand hover:underline">Print</Link>`
(match existing link styling in that file). Detail page `challans/[id]/page.tsx`: add a Print
link/button into the `<PageHeader actions={...}>` alongside `ChallanRowActions`.

- [ ] **Step 4: Gates** — `npm run typecheck && npm run lint` in app/.

- [ ] **Step 5: Commit** — `git commit -m "feat(challans): printable delivery challan page with links"`

---

### Task 4: Mobile — point Print at the real route + release

**Files:**
- Modify: `mobile/src/data/challans.ts:63-66`
- Modify: `mobile/app.json`, `mobile/android/app/build.gradle`

**Interfaces:**
- Produces: `challanPdfUrl(id) = ${base}/print/challan/${id}`; APK 1.0.2 (versionCode 3).

- [ ] **Step 1:** change the URL path in `challanPdfUrl` to `/print/challan/${challanId}`.
- [ ] **Step 2:** `npx tsc --noEmit` (0 errors) + `npm test` (50/50) in mobile/.
- [ ] **Step 3:** `app.json`: version `1.0.2`, `expo.android.versionCode` 3; same in
`android/app/build.gradle` (`versionCode 3`, `versionName "1.0.2"`).
- [ ] **Step 4:** commit `fix(mobile): challan print URL + release 1.0.2`.
- [ ] **Step 5 (controller):** `gradlew assembleRelease` (~4 min), `adb install -r`, verify
operator Challans tab lists his own challan post-migration (needs T1 applied first).

---

### Task 5 (controller-only): apply migration, smoke, device pass

- [ ] Apply 0120 via MCP `apply_migration` (after T1 review).
- [ ] Read-only smoke queries per Task 1 note; also
  `select count(*) from pg_policy where polname='read_challans';` = 1.
- [ ] `npm run build` in app/ (catches Next route issues) and deploy is the user's call.
- [ ] Device pass (operator account): Orders tab → approved order → Print → challan PDF-ish
  page opens in office session context OR shows login (accepted limitation); Challans tab
  shows the operator's own freshly-raised challan immediately.

## Self-Review Notes

- Spec §3.1→T1, §3.2→T2, §3.3→T3, §3.4→T4, §5→T5. The cancelled-challan release-insert is
an explicit decision, documented in T1's body comment.
- `getCompany()` field mapping is deliberately left as "mirror the receipt page" — the
implementer must copy the exact mapping, not invent one.
