"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { postBillFromGrn } from "@/lib/actions/purchases";

// Bill a received GRN in one step (post_bill_from_grn). Captures the vendor's
// bill number, then books GST + payable and clears the 2115 GRN-clearing.
export function GrnBillAction({ grnId, grnNo }: { grnId: string; grnNo: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [billNo, setBillNo] = useState("");

  function onBill() {
    startTransition(async () => {
      const res = await postBillFromGrn(grnId, billNo || undefined);
      if (res.ok) {
        toast.success("Bill created", `Payable booked for ${grnNo}.`);
        router.push(`/purchasing/bills/${res.billId}`);
        router.refresh();
      } else {
        toast.error("Could not create bill", res.error);
      }
    });
  }

  if (!open) {
    return <Button variant="primary" size="sm" onClick={() => setOpen(true)}>Create bill</Button>;
  }

  return (
    <div className="flex items-center gap-1.5">
      <Input
        value={billNo}
        onChange={(e) => setBillNo(e.target.value)}
        placeholder="Vendor bill no."
        className="h-8 w-40"
        aria-label="Vendor bill number"
      />
      <Button variant="primary" size="sm" onClick={onBill} loading={pending}>Book</Button>
      <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
    </div>
  );
}
