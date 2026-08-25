"use client";

// =====================================================================
// components/shell/panels/forms/SupplierPaymentForm.tsx — quick money-out
// for quick-attach: supplier, amount, mode, reference, date. Unallocated
// by design (allocations: []) so the payment sits as an advance on the
// supplier ledger. Mode vocabulary + source-account mapping mirror the
// /purchasing/pay page.
// =====================================================================

import { useState, useTransition } from "react";
import { Field, Input, Select } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { paySupplier } from "@/lib/actions/purchases";
import { pickSuppliers } from "@/lib/actions/quick-attach";
import { MiniPicker } from "../MiniPicker";
import { todayIST } from "@/lib/constants";
import type { PickerOption } from "@/lib/actions/quick-attach";

// Same mode vocabulary as the /purchasing/pay page (cash credits 1110,
// everything else settles out of bank 1120).
const MODES = [
  { value: "bank", label: "Bank", account: "1120" },
  { value: "cash", label: "Cash", account: "1110" },
  { value: "upi", label: "UPI", account: "1120" },
  { value: "cheque", label: "Cheque", account: "1120" },
  { value: "card", label: "Card", account: "1120" },
] as const;

export function SupplierPaymentForm({ onCreated }: { onCreated: (entityType: string, entityId: string) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [supplier, setSupplier] = useState<PickerOption | null>(null);
  const [mode, setMode] = useState<(typeof MODES)[number]["value"]>("bank");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayIST());

  const canSubmit = !!supplier && Number(amount) > 0 && !pending;

  function submit() {
    if (!canSubmit || !supplier) return;
    setError(null);
    startTransition(async () => {
      // Unallocated = advance against the supplier.
      const res = await paySupplier({
        supplier_id: supplier.id,
        mode,
        amount: Number(amount),
        payment_date: paymentDate,
        reference: reference.trim() || undefined,
        source_account: MODES.find((m) => m.value === mode)?.account,
        allocations: [],
      });
      if (res.ok) onCreated("supplier_payment", res.paymentId);
      else setError(res.error ?? "Could not save the payment.");
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <MiniPicker label="Supplier" load={pickSuppliers} value={supplier} onSelect={setSupplier} placeholder="Search suppliers…" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount">
          <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="text-right" />
        </Field>
        <Field label="Mode">
          <Select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
            {MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Reference" hint="UTR / cheque no.">
          <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UTR-…" className="font-mono" />
        </Field>
        <Field label="Date">
          <Input type="date" max={todayIST()} value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
        </Field>
      </div>

      {error && <p className="text-[11px] font-medium text-red">{error}</p>}
      <Button variant="primary" onClick={submit} loading={pending} disabled={!canSubmit}>Create payment</Button>
    </div>
  );
}
