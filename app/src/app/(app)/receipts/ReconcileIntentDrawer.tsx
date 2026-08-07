"use client";

import { useMemo, useState, useTransition } from "react";
import { Panel } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Select } from "@/components/ui/Field";
import { Money } from "@/components/ui/Money";
import { useToast } from "@/components/ui/Toast";
import { reconcilePaymentIntent } from "@/lib/actions/collections";
import type { PaymentIntentRow } from "@/lib/data/collections";
import type { StoreOption, PaymentMethodOption } from "@/lib/data/collections";

// Reconcile a customer's portal "I paid" suggestion into a real posted receipt.
// The amount and customer come from the intent row; staff only pick where it
// was collected (store), the instrument (method), and optional overrides.
export function ReconcileIntentDrawer({
  intent,
  stores,
  paymentMethods,
  onDone,
  onCancel,
}: {
  intent: PaymentIntentRow;
  stores: StoreOption[];
  paymentMethods: PaymentMethodOption[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const customerStores = useMemo(
    () =>
      stores.filter((s) => !intent.customerId || s.customerId === intent.customerId),
    [stores, intent.customerId],
  );

  const [storeId, setStoreId] = useState(customerStores[0]?.id ?? "");
  const [methodId, setMethodId] = useState(paymentMethods[0]?.id ?? "");
  const [depositAccount, setDepositAccount] = useState("");

  const methodsById = useMemo(() => new Map(paymentMethods.map((m) => [m.id, m])), [paymentMethods]);

  const canSubmit = !!storeId && !!methodId && !pending;

  function submit() {
    if (!canSubmit) return;
    startTransition(async () => {
      const res = await reconcilePaymentIntent({
        intent_id: intent.id,
        store_id: storeId,
        method_id: methodId,
        ...(depositAccount.trim() ? { deposit_account: depositAccount.trim() } : {}),
      });
      if (res.ok) {
        toast.success("Payment reconciled", "The receipt was posted and the intent marked matched.");
        onDone();
      } else {
        toast.error("Could not reconcile payment", res.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Panel title="Customer's intent">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] sm:grid-cols-4">
          <div>
            <dt className="text-[11px] text-ink-4">Customer</dt>
            <dd className="mt-0.5 font-medium text-ink">{intent.customerName ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-ink-4">Amount</dt>
            <dd className="mt-0.5 font-bold tabular-nums text-ink">
              <Money value={intent.amount} />
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-ink-4">Mode</dt>
            <dd className="mt-0.5 capitalize text-ink">{intent.mode}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-ink-4">Reference</dt>
            <dd className="mt-0.5 font-mono text-[12px] text-ink-3">
              {intent.reference ?? "—"}
            </dd>
          </div>
        </dl>
        {intent.note && (
          <p className="mt-2 text-[12px] text-ink-3">
            <span className="text-ink-4">Note: </span>
            {intent.note}
          </p>
        )}
      </Panel>

      <Panel title="Receipt details">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Store received at" required htmlFor="store">
            <Select id="store" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
              <option value="">Select a store…</option>
              {customerStores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </Select>
            {customerStores.length === 0 && (
              <p className="mt-0.5 text-[11px] text-amb">
                No active store found for this customer — reconcile from the customer page.
              </p>
            )}
          </Field>
          <Field label="Payment method" required htmlFor="method">
            <Select id="method" value={methodId} onChange={(e) => setMethodId(e.target.value)}>
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
        </div>
      </Panel>

      <div className="flex items-center justify-between rounded-lg border border-line bg-surface p-4">
        <p className="text-[13px] text-ink-3">
          <Money value={intent.amount} /> will be recorded as a posted receipt and auto-allocated
          against the customer&apos;s open invoices (oldest first).
        </p>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" size="md" onClick={submit} loading={pending} disabled={!canSubmit}>
            Reconcile payment
          </Button>
        </div>
      </div>
    </div>
  );
}
