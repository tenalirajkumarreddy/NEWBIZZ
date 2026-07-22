"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Panel, Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Field, Select, Input } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { Money } from "@/components/ui/Money";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { qty as fmtQty } from "@/lib/format";
import { upsertAvl, removeAvl } from "@/lib/actions/suppliers";
import type { AvlItemRow } from "@/lib/data/suppliers";
import type { StockableItemOption } from "@/lib/data/stock";

// Approved Vendor List panel on a supplier (§5.3). Lists the items this
// supplier sells (price/lead-time/MOQ, one preferred), with an inline add form
// and per-row remove. Setting preferred clears any other preferred for the item.
export function SupplierAvlPanel({
  supplierId,
  avl,
  items,
}: {
  supplierId: string;
  avl: AvlItemRow[];
  items: StockableItemOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const [itemId, setItemId] = useState("");
  const [price, setPrice] = useState("");
  const [lead, setLead] = useState("");
  const [moq, setMoq] = useState("");
  const [preferred, setPreferred] = useState(false);

  // Items not already on the AVL (avoid dupes; upsert would update anyway).
  const available = useMemo(() => {
    const used = new Set(avl.map((a) => a.itemId));
    return items.filter((i) => !used.has(i.id));
  }, [avl, items]);

  function resetForm() {
    setItemId("");
    setPrice("");
    setLead("");
    setMoq("");
    setPreferred(false);
  }

  function onAdd() {
    if (!itemId) {
      toast.error("Pick an item", "Choose the item this supplier sells.");
      return;
    }
    startTransition(async () => {
      const res = await upsertAvl({
        item_id: itemId,
        supplier_id: supplierId,
        unit_price: Number(price) || 0,
        lead_time_days: Number(lead) || 0,
        min_order_qty: Number(moq) || 0,
        preferred,
      });
      if (res.ok) {
        toast.success("AVL updated", "Item added to this supplier.");
        resetForm();
        setAdding(false);
        router.refresh();
      } else {
        toast.error("Could not update AVL", res.error);
      }
    });
  }

  function onTogglePreferred(row: AvlItemRow) {
    startTransition(async () => {
      const res = await upsertAvl({
        item_id: row.itemId,
        supplier_id: supplierId,
        unit_price: row.unitPrice,
        lead_time_days: row.leadTimeDays,
        min_order_qty: row.minOrderQty,
        preferred: !row.preferred,
      });
      if (res.ok) router.refresh();
      else toast.error("Could not update", res.error);
    });
  }

  function onRemove(row: AvlItemRow) {
    if (confirmRemove !== row.id) {
      setConfirmRemove(row.id);
      return;
    }
    startTransition(async () => {
      const res = await removeAvl(row.id, supplierId);
      setConfirmRemove(null);
      if (res.ok) {
        toast.success("Removed", "Item removed from this supplier.");
        router.refresh();
      } else {
        toast.error("Could not remove", res.error);
      }
    });
  }

  return (
    <Panel
      title="Approved Vendor List"
      subtitle="Items this supplier sells, with price and terms"
      actions={
        !adding && available.length > 0 ? (
          <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>Add item</Button>
        ) : undefined
      }
      flush
    >
      {adding && (
        <div className="flex flex-col gap-3 border-b border-line p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Item" required className="sm:col-span-2">
              <Select value={itemId} onChange={(e) => setItemId(e.target.value)}>
                <option value="">Select an item…</option>
                {available.map((i) => (
                  <option key={i.id} value={i.id}>{i.sku} — {i.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Unit price (₹)">
              <Input type="number" min={0} step="any" value={price} onChange={(e) => setPrice(e.target.value)} className="text-right" placeholder="0.00" />
            </Field>
            <Field label="Lead time (days)">
              <Input type="number" min={0} value={lead} onChange={(e) => setLead(e.target.value)} className="text-right" placeholder="0" />
            </Field>
            <Field label="Min order qty">
              <Input type="number" min={0} step="any" value={moq} onChange={(e) => setMoq(e.target.value)} className="text-right" placeholder="0" />
            </Field>
            <label className="flex items-center gap-1.5 text-[13px] text-ink-2">
              <input type="checkbox" checked={preferred} onChange={(e) => setPreferred(e.target.checked)} className="h-4 w-4 rounded border-line" />
              Preferred source
            </label>
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => { resetForm(); setAdding(false); }} disabled={pending}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={onAdd} loading={pending}>Add to AVL</Button>
          </div>
        </div>
      )}

      {avl.length === 0 ? (
        <EmptyState
          title="No items yet"
          description="Add the items this supplier sells so purchase orders can price them and the BOM cost rollup can source them."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Item</TH>
              <TH numeric>Unit price</TH>
              <TH numeric>Lead (d)</TH>
              <TH numeric>MOQ</TH>
              <TH>Preferred</TH>
              <TH className="w-40">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {avl.map((a) => (
              <TR key={a.id}>
                <TD>
                  <span className="font-medium text-ink">{a.itemName ?? "—"}</span>
                  {a.sku && <span className="ml-1.5 font-mono text-[11px] text-ink-4">{a.sku}</span>}
                </TD>
                <TD numeric><Money value={a.unitPrice} /></TD>
                <TD numeric>{a.leadTimeDays}</TD>
                <TD numeric>{fmtQty(a.minOrderQty)}</TD>
                <TD>
                  {a.preferred ? (
                    <Badge tone="grn" size="sm">Preferred</Badge>
                  ) : (
                    <button className="text-[12px] text-ink-4 hover:text-brand" onClick={() => onTogglePreferred(a)} disabled={pending}>
                      Make preferred
                    </button>
                  )}
                </TD>
                <TD>
                  {confirmRemove === a.id ? (
                    <div className="flex items-center gap-1.5">
                      <Button variant="danger" size="sm" onClick={() => onRemove(a)} loading={pending}>Confirm</Button>
                      <Button variant="ghost" size="sm" onClick={() => setConfirmRemove(null)} disabled={pending}>Keep</Button>
                    </div>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => onRemove(a)} disabled={pending}>Remove</Button>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      {available.length === 0 && !adding && avl.length > 0 && (
        <Card className="border-0 bg-transparent px-4 py-2.5 shadow-none">
          <p className="text-[11px] text-ink-4">All stockable items are already on this supplier&rsquo;s AVL.</p>
        </Card>
      )}
    </Panel>
  );
}
