"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Panel, Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Select, Input } from "@/components/ui/Field";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { Money } from "@/components/ui/Money";
import { useToast } from "@/components/ui/Toast";
import { placePurchaseOrder } from "@/lib/actions/purchases";
import { todayIST } from "@/lib/constants";
import type { SupplierOption } from "@/lib/data/suppliers";
import type { StockableItemOption } from "@/lib/data/stock";

interface LineDraft {
  key: string;
  item_id: string;
  qty: string;
  unit_cost: string;
  gst_rate: string;
}

let seq = 0;
const newLine = (): LineDraft => ({ key: `l${seq++}`, item_id: "", qty: "", unit_cost: "", gst_rate: "" });

// Raise a purchase order (§5.4) — supplier + expected date + item lines. No
// ledger impact; receiving (GRN) books stock, the bill books the payable.
export function NewPoForm({
  suppliers,
  items,
}: {
  suppliers: SupplierOption[];
  items: StockableItemOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [supplierId, setSupplierId] = useState("");
  const [poDate, setPoDate] = useState(todayIST());
  const [expected, setExpected] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([newLine()]);

  function setLine(key: string, patch: Partial<LineDraft>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function onItemPick(key: string, itemId: string) {
    setLine(key, { item_id: itemId });
  }

  const total = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unit_cost) || 0), 0);

  function onSubmit() {
    const payload = lines
      .filter((l) => l.item_id && Number(l.qty) > 0)
      .map((l) => ({
        item_id: l.item_id,
        qty: Number(l.qty),
        unit_cost: Number(l.unit_cost) || 0,
        gst_rate: l.gst_rate === "" ? undefined : Number(l.gst_rate),
      }));
    if (!supplierId) {
      toast.error("Pick a supplier", "Select who the order goes to.");
      return;
    }
    if (payload.length === 0) {
      toast.error("Add a line", "Add at least one item with a quantity.");
      return;
    }
    startTransition(async () => {
      const res = await placePurchaseOrder({
        supplier_id: supplierId,
        po_date: poDate,
        expected_date: expected || undefined,
        notes: notes || undefined,
        lines: payload,
      });
      if (res.ok) {
        toast.success("PO placed", "Purchase order created.");
        router.push(`/purchasing/po/${res.poId}`);
        router.refresh();
      } else {
        toast.error("Could not place PO", res.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Panel title="Order details">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Supplier" required className="sm:col-span-1">
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">Select a supplier…</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="PO date" required>
            <Input type="date" value={poDate} max={todayIST()} onChange={(e) => setPoDate(e.target.value)} />
          </Field>
          <Field label="Expected date">
            <Input type="date" value={expected} min={poDate} onChange={(e) => setExpected(e.target.value)} />
          </Field>
        </div>
      </Panel>

      <Panel title="Lines" flush>
        <Table>
          <THead>
            <TR>
              <TH>Item</TH>
              <TH numeric className="w-28">Qty</TH>
              <TH numeric className="w-32">Rate</TH>
              <TH numeric className="w-24">GST %</TH>
              <TH numeric className="w-32">Amount</TH>
              <TH className="w-16"></TH>
            </TR>
          </THead>
          <TBody>
            {lines.map((l) => {
              const amt = (Number(l.qty) || 0) * (Number(l.unit_cost) || 0);
              return (
                <TR key={l.key}>
                  <TD>
                    <Select value={l.item_id} onChange={(e) => onItemPick(l.key, e.target.value)}>
                      <option value="">Select…</option>
                      {items.map((i) => <option key={i.id} value={i.id}>{i.sku} — {i.name}</option>)}
                    </Select>
                  </TD>
                  <TD numeric><Input type="number" min={0} step="any" value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} className="text-right" /></TD>
                  <TD numeric><Input type="number" min={0} step="any" value={l.unit_cost} onChange={(e) => setLine(l.key, { unit_cost: e.target.value })} className="text-right" /></TD>
                  <TD numeric><Input type="number" min={0} step="any" value={l.gst_rate} onChange={(e) => setLine(l.key, { gst_rate: e.target.value })} className="text-right" placeholder="auto" /></TD>
                  <TD numeric><Money value={amt} /></TD>
                  <TD>
                    <Button variant="ghost" size="sm" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : ls))} disabled={lines.length === 1}>✕</Button>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
        <div className="flex items-center justify-between border-t border-line px-4 py-3">
          <Button variant="ghost" size="sm" onClick={() => setLines((ls) => [...ls, newLine()])}>+ Add line</Button>
          <span className="text-[13px] text-ink-3">
            Order value <span className="ml-1 font-mono font-semibold text-ink tnum"><Money value={total} /></span>
            <span className="ml-1 text-[11px] text-ink-4">(ex-GST)</span>
          </span>
        </div>
      </Panel>

      <Panel title="Notes">
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Delivery instructions, reference…" />
      </Panel>

      <Card className="flex items-center justify-end gap-2 p-4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/purchasing/po")}>Cancel</Button>
        <Button variant="primary" size="md" onClick={onSubmit} loading={pending} disabled={!supplierId}>Place PO</Button>
      </Card>
    </div>
  );
}
