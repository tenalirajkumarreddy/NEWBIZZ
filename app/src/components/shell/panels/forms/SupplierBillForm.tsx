"use client";

// =====================================================================
// components/shell/panels/forms/SupplierBillForm.tsx — quick AP bill for
// quick-attach: supplier, date, vendor bill no, and charge lines.
// Each line debits an expense account (post_supplier_bill books pure
// charge lines against their expense account; stock-item bills stay on
// the full /purchasing/bills form). GST left blank posts untaxed.
// =====================================================================

import { useState, useTransition } from "react";
import { Field, Input, Select } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { postSupplierBill } from "@/lib/actions/purchases";
import { pickExpenseAccounts, pickSuppliers } from "@/lib/actions/quick-attach";
import { MiniPicker } from "../MiniPicker";
import { todayIST } from "@/lib/constants";
import type { PickerOption } from "@/lib/actions/quick-attach";

interface LineDraft {
  key: string;
  description: string;
  expense_account: string;
  qty: string;
  unit_cost: string;
  gst_rate: string;
}

let seq = 0;
const newLine = (): LineDraft => ({
  key: `qb${seq++}`,
  description: "",
  expense_account: "",
  qty: "1",
  unit_cost: "",
  gst_rate: "",
});

export function SupplierBillForm({ onCreated }: { onCreated: (entityType: string, entityId: string) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [accounts, setAccounts] = useState<{ id: string; label: string }[]>([]);
  const [supplier, setSupplier] = useState<PickerOption | null>(null);
  const [billDate, setBillDate] = useState(todayIST());
  const [billNo, setBillNo] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([newLine()]);

  function loadAccounts() {
    if (accounts.length) return;
    startTransition(async () => {
      const res = await pickExpenseAccounts();
      if (res.ok && res.options) setAccounts(res.options.map((o) => ({ id: o.id, label: o.label })));
    });
  }

  function setLine(key: string, patch: Partial<LineDraft>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function submit() {
    if (!supplier || pending) return;
    setError(null);
    const payload = lines
      .filter((l) => l.expense_account && l.unit_cost !== "" && Number(l.unit_cost) >= 0)
      .map((l) => ({
        description: l.description || undefined,
        expense_account: l.expense_account,
        qty: Number(l.qty) || 1,
        unit_cost: Number(l.unit_cost),
        ...(l.gst_rate.trim() !== "" ? { gst_rate: Number(l.gst_rate) } : {}),
      }));
    if (payload.length === 0) {
      setError("Each line needs an expense account and a rate.");
      return;
    }
    startTransition(async () => {
      const res = await postSupplierBill({
        supplier_id: supplier.id,
        bill_date: billDate,
        supplier_bill_no: billNo.trim() || undefined,
        lines: payload,
      });
      if (res.ok) onCreated("supplier_bill", res.billId);
      else setError(res.error ?? "Could not save the bill.");
    });
  }

  return (
    <div className="flex flex-col gap-3" onMouseDownCapture={loadAccounts}>
      <div className="grid grid-cols-2 gap-3">
        <MiniPicker label="Supplier" load={pickSuppliers} value={supplier} onSelect={setSupplier} placeholder="Search suppliers…" />
        <Field label="Bill date">
          <Input type="date" max={todayIST()} value={billDate} onChange={(e) => setBillDate(e.target.value)} />
        </Field>
      </div>
      <Field label="Vendor bill no.">
        <Input value={billNo} onChange={(e) => setBillNo(e.target.value)} placeholder="INV-8821" className="font-mono" />
      </Field>

      {lines.map((l) => (
        <div key={l.key} className="flex flex-col gap-2 rounded-lg border border-line p-2">
          <div className="flex items-center gap-2">
            <Input
              value={l.description}
              onChange={(e) => setLine(l.key, { description: e.target.value })}
              placeholder="Description (optional)"
              className="h-8 text-[13px]"
            />
            <button
              type="button"
              onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : ls))}
              disabled={lines.length === 1}
              className="text-[12px] text-ink-4 hover:text-red disabled:opacity-40"
            >
              ✕
            </button>
          </div>
          <Select value={l.expense_account} onChange={(e) => setLine(l.key, { expense_account: e.target.value })} className="h-8 text-[13px]">
            <option value="">Charge to account…</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </Select>
          <div className="grid grid-cols-3 gap-2">
            <Input type="number" min="0" step="any" value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} placeholder="Qty" aria-label="Quantity" className="h-8 text-right text-[13px]" />
            <Input type="number" min="0" step="any" value={l.unit_cost} onChange={(e) => setLine(l.key, { unit_cost: e.target.value })} placeholder="Rate" aria-label="Unit cost" className="h-8 text-right text-[13px]" />
            <Input type="number" min="0" step="any" value={l.gst_rate} onChange={(e) => setLine(l.key, { gst_rate: e.target.value })} placeholder="GST %" aria-label="GST rate" className="h-8 text-right text-[13px]" />
          </div>
        </div>
      ))}
      <Button variant="ghost" size="sm" block onClick={() => setLines((ls) => [...ls, newLine()])}>+ line</Button>

      {error && <p className="text-[11px] font-medium text-red">{error}</p>}
      <Button variant="primary" onClick={submit} loading={pending} disabled={!supplier}>Create bill</Button>
    </div>
  );
}
