"use client";

// =====================================================================
// components/shell/panels/forms/GrnForm.tsx — quick goods receipt for
// quick-attach: supplier, date, and received lines (item + qty + cost).
// Books stock IN at cost via the module's postGrn action; the bill
// later books GST and the payable.
// =====================================================================

import { useState, useTransition } from "react";
import { Field, Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { postGrn } from "@/lib/actions/purchases";
import { pickItems, pickSuppliers } from "@/lib/actions/quick-attach";
import { MiniPicker } from "../MiniPicker";
import { todayIST } from "@/lib/constants";
import type { PickerOption } from "@/lib/actions/quick-attach";

interface LineDraft {
  key: string;
  item: PickerOption | null;
  qty: string;
  unit_cost: string;
}

let seq = 0;
const newLine = (): LineDraft => ({ key: `qg${seq++}`, item: null, qty: "", unit_cost: "" });

export function GrnForm({ onCreated }: { onCreated: (entityType: string, entityId: string) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [supplier, setSupplier] = useState<PickerOption | null>(null);
  const [grnDate, setGrnDate] = useState(todayIST());
  const [lines, setLines] = useState<LineDraft[]>([newLine()]);

  function setLine(key: string, patch: Partial<LineDraft>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function submit() {
    if (!supplier || pending) return;
    setError(null);
    const payload = lines
      .filter((l) => l.item && Number(l.qty) > 0 && Number(l.unit_cost) >= 0)
      .map((l) => ({ item_id: l.item!.id, qty: Number(l.qty), unit_cost: Number(l.unit_cost) }));
    if (payload.length === 0) {
      setError("Add at least one line with an item, a quantity and a rate.");
      return;
    }
    startTransition(async () => {
      const res = await postGrn({
        supplier_id: supplier.id,
        grn_date: grnDate,
        lines: payload,
      });
      if (res.ok) onCreated("purchase_receipt", res.grnId);
      else setError(res.error ?? "Could not save the receipt.");
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <MiniPicker label="Supplier" load={pickSuppliers} value={supplier} onSelect={setSupplier} placeholder="Search suppliers…" />
        <Field label="GRN date">
          <Input type="date" max={todayIST()} value={grnDate} onChange={(e) => setGrnDate(e.target.value)} />
        </Field>
      </div>

      {lines.map((l) => (
        <div key={l.key} className="flex flex-col gap-2 rounded-lg border border-line p-2">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <MiniPicker label="Item" load={pickItems} value={l.item} onSelect={(o) => setLine(l.key, { item: o })} placeholder="Search items…" />
            </div>
            <button
              type="button"
              onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : ls))}
              disabled={lines.length === 1}
              className="mt-[18px] text-[12px] text-ink-4 hover:text-red disabled:opacity-40"
            >
              ✕
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input type="number" min="0" step="any" value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} placeholder="Qty" aria-label="Quantity" className="h-8 text-right text-[13px]" />
            <Input type="number" min="0" step="any" value={l.unit_cost} onChange={(e) => setLine(l.key, { unit_cost: e.target.value })} placeholder="Unit cost" aria-label="Unit cost" className="h-8 text-right text-[13px]" />
          </div>
        </div>
      ))}
      <Button variant="ghost" size="sm" block onClick={() => setLines((ls) => [...ls, newLine()])}>+ line</Button>

      {error && <p className="text-[11px] font-medium text-red">{error}</p>}
      <Button variant="primary" onClick={submit} loading={pending} disabled={!supplier}>Create GRN</Button>
    </div>
  );
}
