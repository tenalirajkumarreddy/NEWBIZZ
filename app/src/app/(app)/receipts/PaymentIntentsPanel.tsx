"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Panel } from "@/components/ui/Card";
import { Drawer } from "@/components/ui/Drawer";
import { Button, ConfirmDialog, Money, EmptyState } from "@/components/ui";
import { Input } from "@/components/ui/Field";
import { voidPaymentIntent } from "@/lib/actions/collections";
import { useToast } from "@/components/ui/Toast";
import { titleCase, dateTimeIST } from "@/lib/format";
import type { PaymentIntentRow } from "@/lib/data/collections";
import type { StoreOption, PaymentMethodOption } from "@/lib/data/collections";
import { ReconcileIntentDrawer } from "./ReconcileIntentDrawer";

// Portal "I paid" suggestions awaiting staff action. Reconcile turns one into
// a real receipt; Void rejects it without touching the ledger. Only pending
// intents are actionable here; matched/void are listed for context.
export function PaymentIntentsPanel({
  intents,
  stores,
  paymentMethods,
}: {
  intents: PaymentIntentRow[];
  stores: StoreOption[];
  paymentMethods: PaymentMethodOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [reconciling, setReconciling] = useState<PaymentIntentRow | null>(null);
  const [voiding, setVoiding] = useState<PaymentIntentRow | null>(null);
  const [voidPending, startVoid] = useTransition();

  const pending = useMemo(() => intents.filter((i) => i.status === "pending"), [intents]);
  const history = useMemo(() => intents.filter((i) => i.status !== "pending"), [intents]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pending;
    return pending.filter(
      (i) =>
        (i.customerName ?? "").toLowerCase().includes(q) ||
        (i.reference ?? "").toLowerCase().includes(q) ||
        i.mode.toLowerCase().includes(q),
    );
  }, [pending, query]);

  function confirmVoid() {
    if (!voiding) return;
    startVoid(async () => {
      const res = await voidPaymentIntent(voiding.id);
      if (res.ok) {
        toast.success("Intent voided", "The customer's submission was rejected.");
        setVoiding(null);
        router.refresh();
      } else {
        toast.error("Could not void intent", res.error);
      }
    });
  }

  return (
    <Panel flush>
      <div className="flex flex-col gap-2 border-b border-line px-4 py-3 sm:flex-row sm:items-center">
        <div className="flex-1">
          <h2 className="text-[14px] font-semibold text-ink">Customer payment intents</h2>
          <p className="text-[12px] text-ink-3">
            {pending.length === 0
              ? "No pending \"I paid\" submissions."
              : `${pending.length} pending — reconcile as payments arrive.`}
          </p>
        </div>
        {pending.length > 1 && (
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search customer, ref, mode…"
            className="sm:max-w-[240px]"
            aria-label="Filter intents"
          />
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={history.length === 0 ? "No customer payment intents yet" : "No matching intents"}
          description={
            history.length === 0
              ? "When a customer records a payment from the portal, it lands here for you to reconcile against their open invoices."
              : "No pending intents match the current search."
          }
        />
      ) : (
        <ul className="divide-y divide-line">
          {filtered.map((i) => (
            <li
              key={i.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-bold tabular-nums text-ink">
                    <Money value={i.amount} />
                  </span>
                  <span className="font-medium text-ink">{i.customerName ?? "—"}</span>
                  <span className="rounded bg-fill px-1.5 py-0.5 text-[11px] capitalize text-ink-2">
                    {titleCase(i.mode)}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-[12px] text-ink-3">
                  {i.reference ? <span className="font-mono">{i.reference}</span> : "no reference"}
                  {i.note ? ` · ${i.note}` : ""}
                  <span className="text-ink-4"> · {dateTimeIST(i.createdAt)}</span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => setReconciling(i)}>
                  Reconcile
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setVoiding(i)}>
                  Void
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {history.length > 0 && (
        <div className="border-t border-line px-4 py-3">
          <details>
            <summary className="cursor-pointer text-[12px] font-medium text-ink-3 hover:text-ink">
              History · {history.length} matched/voided
            </summary>
            <ul className="mt-2 space-y-1.5">
              {history.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3 text-[12px]">
                  <span className="text-ink">
                    {i.customerName ?? "—"} · <Money value={i.amount} />{" "}
                    {i.matchedReceiptNo ? (
                      <span className="font-mono text-brand">→ {i.matchedReceiptNo}</span>
                    ) : null}
                  </span>
                  <span className="capitalize text-ink-3">{i.status}</span>
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}

      <Drawer
        open={!!reconciling}
        onClose={() => setReconciling(null)}
        title="Reconcile payment intent"
        description="Record the customer's portal payment as a posted receipt."
        size="lg"
      >
        {reconciling && (
          <ReconcileIntentDrawer
            intent={reconciling}
            stores={stores}
            paymentMethods={paymentMethods}
            onDone={() => {
              setReconciling(null);
              router.refresh();
            }}
            onCancel={() => setReconciling(null)}
          />
        )}
      </Drawer>

      <ConfirmDialog
        open={!!voiding}
        onClose={() => setVoiding(null)}
        onConfirm={confirmVoid}
        title="Void this payment intent?"
        description="This rejects the customer's 'I paid' submission without touching the ledger. They'll still see it as voided in their portal."
        confirmLabel="Void intent"
        danger
        loading={voidPending}
      />
    </Panel>
  );
}