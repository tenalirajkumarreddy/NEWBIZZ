"use client";

// =====================================================================
// components/shell/panels/forms/CustomerReceiptForm.tsx — quick collection
// for quick-attach: one store picker (carries the parent customerId),
// amount, method, reference, date. recordReceipt needs BOTH customer_id
// and store_id; pickCustomerStores supplies both on a single option.
// =====================================================================

import { useState, useTransition } from "react";
import { Field, Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { recordReceipt } from "@/lib/actions/collections";
import { pickCustomerStores, pickPaymentMethods } from "@/lib/actions/quick-attach";
import { MiniPicker } from "../MiniPicker";
import { todayIST } from "@/lib/constants";
import type { PickerOption } from "@/lib/actions/quick-attach";

export function CustomerReceiptForm({ onCreated }: { onCreated: (entityType: string, entityId: string) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [store, setStore] = useState<PickerOption | null>(null);
  const [method, setMethod] = useState<PickerOption | null>(null);
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [receiptDate, setReceiptDate] = useState(todayIST());

  const canSubmit =
    !!store && !!store.customerId && !!method && Number(amount) > 0 && !pending;

  function submit() {
    if (!canSubmit || !store?.customerId || !method) return;
    setError(null);
    startTransition(async () => {
      const res = await recordReceipt({
        customer_id: store.customerId!,
        store_id: store.id,
        method_id: method.id,
        amount: Number(amount),
        reference: reference.trim() || undefined,
        receipt_date: receiptDate,
      });
      if (res.ok) onCreated("customer_receipt", res.receiptId);
      else setError(res.error ?? "Could not save the receipt.");
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <MiniPicker label="Customer store" load={pickCustomerStores} value={store} onSelect={setStore} placeholder="Search stores…" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount">
          <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="text-right" />
        </Field>
        <MiniPicker label="Method" load={pickPaymentMethods} value={method} onSelect={setMethod} placeholder="Cash / UPI / …" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Reference">
          <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Txn / voucher no." className="font-mono" />
        </Field>
        <Field label="Date">
          <Input type="date" max={todayIST()} value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} />
        </Field>
      </div>

      {error && <p className="text-[11px] font-medium text-red">{error}</p>}
      {!error && store && !store.customerId && (
        <p className="text-[11px] font-medium text-red">That store isn’t linked to a customer — pick another.</p>
      )}
      <Button variant="primary" onClick={submit} loading={pending} disabled={!canSubmit}>Create receipt</Button>
    </div>
  );
}
