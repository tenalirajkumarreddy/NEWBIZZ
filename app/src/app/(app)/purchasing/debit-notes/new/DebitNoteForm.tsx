"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Panel, Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Select, Input, Textarea } from "@/components/ui/Field";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { recordPurchaseReturn } from "@/lib/actions/purchases";
import { todayIST } from "@/lib/constants";
import type { SupplierOption } from "@/lib/data/suppliers";
import type { StockableItemOption } from "@/lib/data/stock";

const REASONS = [
  { value: "return", label: "Return" },
  { value: "rate_difference", label: "Rate difference" },
  { value: "shortage", label: "Shortage" },
  { value: "other", label: "Other" },
] as const;

interface LineDraft {
  key: string;
  item_id: string;
  qty: string;
  gst_rate: string;
}

let seq = 0;
const newLine = (): LineDraft => ({ key: `d${seq++}`, item_id: "", qty: "", gst_rate: "" });

// Record a purchase return / debit note (§5.5). Moves stock out at the current
// WA cost and reverses the payable + input GST. Qty × WAC is computed server-
// side; this form just captures what's going back.
export function NewDebitNoteForm({
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
  const [date, setDate] = useState(todayIST());
  const [reason, setReason] = useState<(typeof REASONS)[number]["value"]>("return");
  const [narration, setNarration] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([newLine()]);

  const stockItems = items.filter((i) => i.type !== "service");

  function setLine(key: string, patch: Partial<LineDraft>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function onSubmit() {
    const payload = lines
      .filter((l) => l.item_id && Number(l.qty) > 0)
      .map((l) => ({ item_id: l.item_id, qty: Number(l.qty), gst_rate: l.gst_rate === "" ? undefined : Number(l.gst_rate) }));
    if (!supplierId) {
      toast.error("Pick a supplier", "Select who the goods go back to.");
      return;
    }
    if (payload.length === 0) {
      toast.error("Add a line", "Add at least one returned item with a quantity.");
      return;
    }
    startTransition(async () => {
      const res = await recordPurchaseReturn({
        supplier_id: supplierId,
        date,
        reason,
        narration: narration || undefined,
        lines: payload,
      });
      if (res.ok) {
        toast.success("Debit note posted", "Payable reduced and stock reversed.");
        router.push(`/purchasing/debit-notes/${res.debitNoteId}`);
        router.refresh();
      } else {
        toast.error("Could not post debit note", res.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Panel title="Return details">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Supplier" required>
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">Select a supplier…</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Date" required>
            <Input type="date" value={date} max={todayIST()} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Reason" required>
            <Select value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}>
              {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </Select>
          </Field>
        </div>
      </Panel>

      <Panel title="Returned lines" subtitle="Value = qty × current weighted-average cost" flush>
        <Table>
          <THead>
            <TR>
              <TH>Item</TH>
              <TH numeric className="w-28">Qty</TH>
              <TH numeric className="w-24">GST %</TH>
              <TH className="w-16"></TH>
            </TR>
          </THead>
          <TBody>
            {lines.map((l) => (
              <TR key={l.key}>
                <TD>
                  <Select value={l.item_id} onChange={(e) => setLine(l.key, { item_id: e.target.value })}>
                    <option value="">Select…</option>
                    {stockItems.map((i) => <option key={i.id} value={i.id}>{i.sku} — {i.name}</option>)}
                  </Select>
                </TD>
                <TD numeric><Input type="number" min={0} step="any" value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} className="text-right" /></TD>
                <TD numeric><Input type="number" min={0} step="any" value={l.gst_rate} onChange={(e) => setLine(l.key, { gst_rate: e.target.value })} className="text-right" placeholder="auto" /></TD>
                <TD>
                  <Button variant="ghost" size="sm" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : ls))} disabled={lines.length === 1}>✕</Button>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        <div className="border-t border-line px-4 py-3">
          <Button variant="ghost" size="sm" onClick={() => setLines((ls) => [...ls, newLine()])}>+ Add line</Button>
        </div>
      </Panel>

      <Panel title="Narration">
        <Textarea rows={2} value={narration} onChange={(e) => setNarration(e.target.value)} placeholder="Why the goods are going back…" />
      </Panel>

      <Card className="flex items-center justify-end gap-2 p-4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/purchasing/debit-notes")}>Cancel</Button>
        <Button variant="primary" size="md" onClick={onSubmit} loading={pending} disabled={!supplierId}>Post debit note</Button>
      </Card>
      <p className="text-[11px] text-ink-4">Stock leaves at its current weighted-average cost; the payable and input GST reverse by that value.</p>
    </div>
  );
}
