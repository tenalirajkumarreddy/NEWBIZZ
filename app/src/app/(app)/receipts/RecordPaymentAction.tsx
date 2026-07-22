"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { RecordReceiptForm } from "./new/RecordReceiptForm";
import type { StoreOption, PaymentMethodOption } from "@/lib/data/collections";

// "Record payment" header action for Collections. Opens the existing
// RecordReceiptForm in a right-side Drawer instead of routing to /receipts/new;
// the /new route stays as a deep-link fallback (it also handles ?store=).
// Masters are preloaded on the list page (server).
export function RecordPaymentAction({
  stores,
  paymentMethods,
}: {
  stores: StoreOption[];
  paymentMethods: PaymentMethodOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
        Record payment
      </Button>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Record payment"
        description="Auto-allocated against open invoices (oldest first)."
        size="lg"
      >
        {stores.length > 0 ? (
          <RecordReceiptForm
            stores={stores}
            paymentMethods={paymentMethods}
            onCancel={() => setOpen(false)}
            onDone={() => {
              setOpen(false);
              router.refresh();
            }}
          />
        ) : (
          <p className="text-[13px] text-ink-3">
            No active stores are available yet. Add a customer with a store before recording a
            payment.
          </p>
        )}
      </Drawer>
    </>
  );
}
