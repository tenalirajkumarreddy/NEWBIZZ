"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { cancelOrder } from "@/lib/actions/sales";
import type { OrderStatus } from "@/lib/data/sales";

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

  const canCancel = status === "confirmed" || status === "approved" || status === "draft";
  if (!canCancel) return null;

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
