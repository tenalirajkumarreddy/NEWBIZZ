"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { generateGstInvoice } from "@/lib/actions/sales";

// Delivery is the value event: a delivered order has already posted stock, AR,
// revenue and GST. The GST invoice that follows is a DOCUMENT linked to that
// delivery journal — it posts no accounting of its own, so invoicing a
// delivered order can never double-count the sale.
export function RaiseInvoiceAction({
  orderId,
  orderNo,
}: {
  orderId: string;
  orderNo: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  function onRaise() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    startTransition(async () => {
      const res = await generateGstInvoice(orderId);
      setConfirming(false);
      if (res.ok) {
        toast.success("GST invoice raised", `Linked to the delivery of ${orderNo}.`);
        router.push(`/invoices/${res.invoiceId}`);
        router.refresh();
      } else {
        toast.error("Could not raise the GST invoice", res.error);
      }
    });
  }

  if (!confirming) {
    return (
      <Button variant="primary" size="sm" onClick={onRaise} disabled={pending}>
        Raise GST invoice
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] text-ink-4">
        Documents the delivery of {orderNo}; no second posting.
      </span>
      <Button variant="primary" size="sm" onClick={onRaise} loading={pending}>
        Confirm
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={pending}>
        Cancel
      </Button>
    </div>
  );
}
