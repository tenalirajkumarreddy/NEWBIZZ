"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { fulfilOrder, generateGstInvoice, invoiceOrder, cancelOrder } from "@/lib/actions/sales";
import type { OrderStatus } from "@/lib/data/sales";

// Row-level actions for the Order Book:
//   confirmed/approved → Deliver (post accounting) · Cancel
//   fulfilled         → Generate GST invoice (optional) · Cancel
//   invoiced / cancelled → no actions
// Cancel asks for confirmation inline.
export function OrderRowActions({
  orderId,
  orderNo,
  status,
}: {
  orderId: string;
  orderNo: string;
  status: OrderStatus;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  const canDeliver = status === "confirmed" || status === "approved" || status === "partially_fulfilled";
  const canInvoice = status === "fulfilled";
  const canCancel = status === "confirmed" || status === "approved" || status === "draft";
  if (!canDeliver && !canInvoice && !canCancel) return null;

  function onDeliver() {
    startTransition(async () => {
      const res = await fulfilOrder(orderId);
      if (res.ok) {
        toast.success("Order fulfilled", `${orderNo} delivered — revenue, GST and stock posted.`);
        router.push(`/challans/${res.challanId}`);
        router.refresh();
      } else {
        toast.error("Could not deliver", res.error);
      }
    });
  }

  function onGstInvoice() {
    startTransition(async () => {
      const res = await generateGstInvoice(orderId);
      if (res.ok) {
        toast.success("GST invoice generated", `${orderNo} — linked to delivery journal.`);
        router.push(`/invoices/${res.invoiceId}`);
        router.refresh();
      } else {
        toast.error("Could not generate invoice", res.error);
      }
    });
  }

  function onCancel() {
    if (!confirmingCancel) {
      setConfirmingCancel(true);
      return;
    }
    startTransition(async () => {
      const res = await cancelOrder(orderId);
      setConfirmingCancel(false);
      if (res.ok) {
        toast.success("Order cancelled", `${orderNo} is closed.`);
        router.refresh();
      } else {
        toast.error("Could not cancel order", res.error);
      }
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      {canDeliver && !confirmingCancel && (
        <Button variant="primary" size="sm" onClick={onDeliver} loading={pending}>
          Deliver
        </Button>
      )}
      {canInvoice && !confirmingCancel && (
        <Button variant="secondary" size="sm" onClick={onGstInvoice} loading={pending}>
          Generate GST invoice
        </Button>
      )}
      {canCancel && (
        <>
          {confirmingCancel ? (
            <>
              <Button variant="danger" size="sm" onClick={onCancel} loading={pending}>
                Confirm cancel
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmingCancel(false)}
                disabled={pending}
              >
                Keep
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
              Cancel
            </Button>
          )}
        </>
      )}
    </div>
  );
}
