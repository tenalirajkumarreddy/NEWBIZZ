"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Panel, Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Select, Input } from "@/components/ui/Field";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { Money } from "@/components/ui/Money";
import { useToast } from "@/components/ui/Toast";
import { postGrn } from "@/lib/actions/purchases";
import { todayIST } from "@/lib/constants";
import type { SupplierOption } from "@/lib/data/suppliers";
import type { StockableItemOption } from "@/lib/data/stock";

interface LineDraft {
  key: string;
  item_id: string;
  qty: string;
  unit_cost: string;
}

let seq = 0;
const newLine = (): LineDraft => ({ key: `g${seq++}`, item_id: "", qty: "", unit_cost: "" });

// Goods receipt (§5.4). Books received goods into stock at cost — the STOCK
// event (Dr inventory / Cr 2115 clearing, WAC recomputed). Ex-GST; the bill
// books input tax and the payable. Only stockable (non-service) items.
export function NewGrnForm({
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
  const [grnDate, setGrnDate] = useState(todayIST());
  const [dcNo, setDcNo] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([newLine()]);

  // GRN receives physical goods — services can't be stocked.
  const stockItems = items.filter((i) => i.type !== "service");

  function setLine(key: string, patch: Partial<LineDraft>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  const total = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unit_cost) || 0), 0);

  function onSubmit() {
    const payload = lines
      .filter((l) => l.item_id && Number(l.qty) > 0)
      .map((l) => ({ item_id: l.item_id, qty: Number(l.qty), unit_cost: Number(l.unit_cost) || 0 }));
    if (!supplierId) {
      toast.error("Pick a supplier", "Select who supplied the goods.");
      return;
    }
    if (payload.length === 0) {
      toast.error("Add a line", "Add at least one received item with a quantity and cost.");
      return;
    }
    startTransition(async () => {
      const res = await postGrn({
        supplier_id: supplierId,
        grn_date: grnDate,
        supplier_dc_no: dcNo || undefined,
        notes: notes || undefined,
        lines: payload,
      });
      if (res.ok) {
        toast.success("Goods received", "Stock booked at cost.");
        router.push(`/purchasing/grn/${res.grnId}`);
        router.refresh();
      } else {
        toast.error("Could not receive goods", res.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Panel title="Receipt details">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Supplier" required>
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">Select a supplier…</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Receipt date" required>
            <Input type="date" value={grnDate} max={todayIST()} onChange={(e) => setGrnDate(e.target.value)} />
          </Field>
          <Field label="Supplier DC no." hint="Delivery challan / docket">
            <Input value={dcNo} onChange={(e) => setDcNo(e.target.value)} placeholder="DC-1234" />
          </Field>
        </div>
      </Panel>

      <Panel title="Received lines" flush>
        <Table>
          <THead>
            <TR>
              <TH>Item</TH>
              <TH numeric className="w-28">Qty</TH>
              <TH numeric className="w-32">Unit cost</TH>
              <TH numeric className="w-32">Value</TH>
              <TH className="w-16"></TH>
            </TR>
          </THead>
          <TBody>
            {lines.map((l) => {
              const amt = (Number(l.qty) || 0) * (Number(l.unit_cost) || 0);
              return (
                <TR key={l.key}>
                  <TD>
                    <Select value={l.item_id} onChange={(e) => setLine(l.key, { item_id: e.target.value })}>
                      <option value="">Select…</option>
                      {stockItems.map((i) => <option key={i.id} value={i.id}>{i.sku} — {i.name}</option>)}
                    </Select>
                  </TD>
                  <TD numeric><Input type="number" min={0} step="any" value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} className="text-right" /></TD>
                  <TD numeric><Input type="number" min={0} step="any" value={l.unit_cost} onChange={(e) => setLine(l.key, { unit_cost: e.target.value })} className="text-right" /></TD>
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
            Goods value <span className="ml-1 font-mono font-semibold text-ink tnum"><Money value={total} /></span>
          </span>
        </div>
      </Panel>

      <Panel title="Notes">
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Condition, remarks…" />
      </Panel>

      <Card className="flex items-center justify-end gap-2 p-4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/purchasing/grn")}>Cancel</Button>
        <Button variant="primary" size="md" onClick={onSubmit} loading={pending} disabled={!supplierId}>Receive goods</Button>
      </Card>
    </div>
  );
}
