"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Panel, Button, Field, Select, Input, useToast, Money } from "@/components/ui";
import { portalCreateOrder } from "@/lib/actions/portal";
import type { PortalCatalogRow, PortalStoreRow } from "@/lib/data/portal";

interface Line {
  key: number;
  itemId: string;
  qty: string;
  price: string;
}

export function OrderForm({
  stores,
  catalog,
}: {
  stores: PortalStoreRow[];
  catalog: PortalCatalogRow[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([{ key: Date.now(), itemId: "", qty: "1", price: "" }]);
  const [lastKey, setLastKey] = useState(Date.now());

  const priceFor = (itemId: string) => catalog.find((c) => c.id === itemId)?.defaultPrice ?? 0;

  function updateLine(idx: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((ls) => [...ls, { key: lastKey + 1, itemId: "", qty: "1", price: "" }]);
    setLastKey((k) => k + 1);
  }

  function removeLine(idx: number) {
    setLines((ls) => ls.filter((_, i) => i !== idx));
  }

  function subtotal(): number {
    return lines.reduce((sum, l) => {
      const unit = l.price !== "" ? Number(l.price) : priceFor(l.itemId);
      return sum + unit * (Number(l.qty) || 0);
    }, 0);
  }

  function submit() {
    const valid = lines.filter((l) => l.itemId && Number(l.qty) > 0);
    if (!storeId) {
      toast.error("Select a store for the order.");
      return;
    }
    if (valid.length === 0) {
      toast.error("Add at least one item with a quantity.");
      return;
    }
    startTransition(async () => {
      const res = await portalCreateOrder({
        store_id: storeId,
        notes: notes.trim() || undefined,
        lines: valid.map((l) => ({
          item_id: l.itemId,
          qty: Number(l.qty),
          ...(l.price !== "" ? { unit_price: Number(l.price) } : {}),
        })),
      });
      if (res.ok) {
        toast.success("Order placed. We'll confirm it shortly.");
        router.push("/portal/orders");
        router.refresh();
      } else {
        toast.error("Could not place order", res.error);
      }
    });
  }

  return (
    <Panel title="New order" subtitle="Placing an order doesn't change your balance — we confirm and invoice it.">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Store">
          <Select value={storeId} onChange={(e) => setStoreId(e.target.value)}>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.code})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Notes (optional)">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Delivery instructions, etc." />
        </Field>
      </div>

      <div className="mt-5">
        <div className="mb-2 grid grid-cols-[1fr_90px_90px_36px] gap-2 text-[11px] font-semibold uppercase tracking-wide text-ink-4">
          <span>Item</span>
          <span>Qty</span>
          <span>Price</span>
          <span />
        </div>
        {lines.map((l, idx) => (
          <div key={l.key} className="mb-2 grid grid-cols-[1fr_90px_90px_36px] items-center gap-2">
            <Select value={l.itemId} onChange={(e) => updateLine(idx, { itemId: e.target.value })}>
              <option value="">— select item —</option>
              {catalog.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.sku}) — <Money value={c.defaultPrice} />
                </option>
              ))}
            </Select>
            <Input
              inputMode="numeric"
              mono
              value={l.qty}
              onChange={(e) => updateLine(idx, { qty: e.target.value })}
            />
            <Input
              inputMode="decimal"
              mono
              value={l.price}
              onChange={(e) => updateLine(idx, { price: e.target.value })}
              placeholder={`${priceFor(l.itemId) || "price"}`}
            />
            <button
              type="button"
              onClick={() => removeLine(idx)}
              className="grid h-8 w-8 place-items-center rounded-lg text-[15px] text-ink-4 transition-colors hover:bg-red-wash hover:text-red"
              aria-label="Remove line"
            >
              ×
            </button>
          </div>
        ))}
        <Button variant="ghost" size="sm" onClick={addLine}>
          + Add line
        </Button>
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-line pt-4">
        <div className="text-[14px] font-semibold text-ink">
          Subtotal <span className="tabular-nums"><Money value={subtotal()} /></span>
          <span className="ml-2 text-[12px] font-normal text-ink-4">
            (tax added by us at confirmation)
          </span>
        </div>
        <Button onClick={submit} loading={pending} disabled={!storeId}>
          Place order
        </Button>
      </div>
    </Panel>
  );
}