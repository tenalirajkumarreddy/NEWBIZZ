"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Panel } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Select, Input } from "@/components/ui/Field";
import { Money } from "@/components/ui/Money";
import { useToast } from "@/components/ui/Toast";
import { recordReceipt } from "@/lib/actions/collections";
import type { StoreOption } from "@/lib/data/collections";
import type { PaymentMethodOption } from "@/lib/data/collections";

export function RecordReceiptForm({
  stores = [],
  paymentMethods,
  initialStoreId = "",
  onDone,
  onCancel,
}: {
  stores: StoreOption[];
  paymentMethods: PaymentMethodOption[];
  initialStoreId?: string;
  // Passed when hosted in a Drawer so the user stays on /receipts. Undefined on
  // the standalone /new page, where the form navigates via router instead.
  onDone?: () => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [storeId, setStoreId] = useState(initialStoreId);
  const [methodId, setMethodId] = useState(paymentMethods[0]?.id ?? "");
  const [depositAccount, setDepositAccount] = useState("");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");

  const selectedStore = useMemo(
    () => stores.find((s) => s.id === storeId) ?? null,
    [stores, storeId],
  );

  const methodsById = useMemo(() => new Map(paymentMethods.map((m) => [m.id, m])), [paymentMethods]);

  function onMethodChange(id: string) {
    setMethodId(id);
    setDepositAccount("");
  }

  const amountNum = Number(amount);

  const canSubmit = !!storeId && Number.isFinite(amountNum) && amountNum > 0 && !pending;

  function submit() {
    if (!canSubmit || !selectedStore) return;
    startTransition(async () => {
      const res = await recordReceipt({
        customer_id: selectedStore.customerId,
        store_id: storeId,
        method_id: methodId,
        amount: amountNum,
        ...(depositAccount.trim() ? { deposit_account: depositAccount.trim() } : {}),
        ...(reference.trim() ? { reference: reference.trim() } : {}),
      });
      if (res.ok) {
        toast.success("Payment recorded", "Auto-allocated against open invoices (oldest first).");
        if (onDone) {
          onDone();
        } else {
          router.push("/receipts");
          router.refresh();
        }
      } else {
        toast.error("Could not record payment", res.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Panel title="Received from">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Store" required htmlFor="store">
            <Select
              id="store"
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
            >
              <option value="">Select a store…</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code}) — {s.customerName}
                </option>
              ))}
            </Select>
            {selectedStore && (
              <p className="mt-0.5 text-[11px] text-ink-4">
                Customer: {selectedStore.customerName} · {selectedStore.kind}
              </p>
            )}
          </Field>
          <Field label="Amount received" required htmlFor="amount">
            <Input
              id="amount"
              mono
              inputMode="decimal"
              className="text-right"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </Field>
          <Field label="Payment method" required htmlFor="method">
            <Select
              id="method"
              value={methodId}
              onChange={(e) => onMethodChange(e.target.value)}
            >
              {paymentMethods.map((pm) => (
                <option key={pm.id} value={pm.id}>
                  {pm.name}
                </option>
              ))}
            </Select>
            {methodId && methodsById.get(methodId) && (
              <p className="mt-0.5 text-[11px] text-ink-4">
                → {methodsById.get(methodId)!.destinationLabel}
              </p>
            )}
          </Field>
          <Field label="Deposit account (override)" htmlFor="deposit">
            <Select
              id="deposit"
              value={depositAccount}
              onChange={(e) => setDepositAccount(e.target.value)}
            >
              <option value="">Default (from method)</option>
              <option value="1110">Cash in hand (1110)</option>
              <option value="1120">Bank (1120)</option>
              <option value="2140">Field custody (2140)</option>
            </Select>
          </Field>
          <Field label="Reference" htmlFor="reference" hint="UPI ref · cheque no · txn id">
            <Input
              id="reference"
              mono
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Optional"
            />
          </Field>
        </div>
      </Panel>

      <div className="flex items-center justify-between rounded-lg border border-line bg-surface p-4">
        <p className="text-[13px] text-ink-3">
          {amountNum > 0
            ? <>Payment of <Money value={amountNum} /> will be auto-allocated against open invoices (oldest first).</>
            : "Enter the amount to record the payment."}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => (onCancel ? onCancel() : router.push("/receipts"))}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={submit}
            loading={pending}
            disabled={!canSubmit}
          >
            Record payment
          </Button>
        </div>
      </div>
    </div>
  );
}
