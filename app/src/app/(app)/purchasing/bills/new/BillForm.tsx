"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Panel, Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Select, Input } from "@/components/ui/Field";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { Money } from "@/components/ui/Money";
import { useToast } from "@/components/ui/Toast";
import { postSupplierBill } from "@/lib/actions/purchases";
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
const newLine = (): LineDraft => ({ key: `b${seq++}`, item_id: "", qty: "1", unit_cost: "", gst_rate: "" });

// Record a supplier bill directly (§5.4) — item lines with GST. Books input GST
// + payable (and clears 2115 if the item was received via GRN, but a direct
// bill posts inventory too). Interstate uses the supplier's state vs home.
export function NewBillForm({
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
  const [billDate, setBillDate] = useState(todayIST());
  const [vendorBillNo, setVendorBillNo] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([newLine()]);

  const stockItems = useMemo(() => items.filter((i) => i.type !== "service"), [items]);

  function setLine(key: string, patch: Partial<LineDraft>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  const totals = lines.reduce(
    (acc, l) => {
      const taxable = (Number(l.qty) || 0) * (Number(l.unit_cost) || 0);
      const tax = (taxable * (Number(l.gst_rate) || 0)) / 100;
      acc.taxable += taxable;
      acc.tax += tax;
      return acc;
    },
    { taxable: 0, tax: 0 },
  );

  function onSubmit() {
    const payload = lines
      .filter((l) => l.item_id && Number(l.unit_cost) >= 0)
      .map((l) => ({
        item_id: l.item_id,
        qty: Number(l.qty) || 1,
        unit_cost: Number(l.unit_cost) || 0,
        gst_rate: l.gst_rate === "" ? undefined : Number(l.gst_rate),
      }));
    if (!supplierId) {
      toast.error("Pick a supplier", "Select who billed you.");
      return;
    }
    if (payload.length === 0) {
      toast.error("Add a line", "Add at least one item line with a cost.");
      return;
    }
    startTransition(async () => {
      const res = await postSupplierBill({
        supplier_id: supplierId,
        bill_date: billDate,
        supplier_bill_no: vendorBillNo || undefined,
        due_date: dueDate || undefined,
        notes: notes || undefined,
        lines: payload,
      });
      if (res.ok) {
        toast.success("Bill recorded", "Input GST and payable booked.");
        router.push(`/purchasing/bills/${res.billId}`);
        router.refresh();
      } else {
        toast.error("Could not record bill", res.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Panel title="Bill details">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Supplier" required className="lg:col-span-2">
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">Select a supplier…</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Bill date" required>
            <Input type="date" value={billDate} max={todayIST()} onChange={(e) => setBillDate(e.target.value)} />
          </Field>
          <Field label="Vendor bill no.">
            <Input value={vendorBillNo} onChange={(e) => setVendorBillNo(e.target.value)} placeholder="INV-8821" />
          </Field>
          <Field label="Due date">
            <Input type="date" value={dueDate} min={billDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
        </div>
      </Panel>

      <Panel title="Lines" flush>
        <Table>
          <THead>
            <TR>
              <TH>Item</TH>
              <TH numeric className="w-24">Qty</TH>
              <TH numeric className="w-32">Rate</TH>
              <TH numeric className="w-24">GST %</TH>
              <TH numeric className="w-32">Taxable</TH>
              <TH className="w-16"></TH>
            </TR>
          </THead>
          <TBody>
            {lines.map((l) => {
              const taxable = (Number(l.qty) || 0) * (Number(l.unit_cost) || 0);
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
                  <TD numeric><Input type="number" min={0} step="any" value={l.gst_rate} onChange={(e) => setLine(l.key, { gst_rate: e.target.value })} className="text-right" placeholder="auto" /></TD>
                  <TD numeric><Money value={taxable} /></TD>
                  <TD>
                    <Button variant="ghost" size="sm" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : ls))} disabled={lines.length === 1}>✕</Button>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3">
          <Button variant="ghost" size="sm" onClick={() => setLines((ls) => [...ls, newLine()])}>+ Add line</Button>
          <span className="text-[13px] text-ink-3">
            Taxable <span className="font-mono font-semibold text-ink tnum"><Money value={totals.taxable} /></span>
            <span className="mx-1 text-ink-4">·</span>
            GST <span className="font-mono font-semibold text-ink tnum"><Money value={totals.tax} /></span>
            <span className="mx-1 text-ink-4">·</span>
            Total <span className="font-mono font-bold text-ink tnum"><Money value={totals.taxable + totals.tax} /></span>
          </span>
        </div>
      </Panel>

      <Panel title="Notes">
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Reference, remarks…" />
      </Panel>

      <Card className="flex items-center justify-end gap-2 p-4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/purchasing/bills")}>Cancel</Button>
        <Button variant="primary" size="md" onClick={onSubmit} loading={pending} disabled={!supplierId}>Record bill</Button>
      </Card>
      <p className="text-[11px] text-ink-4">GST is auto-derived from each item if left blank. Place of supply (interstate vs intra) follows the supplier&rsquo;s state.</p>
    </div>
  );
}
