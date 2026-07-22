"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { postGrnFromPo } from "@/lib/actions/purchases";

// Receive a whole PO into stock in one GRN (post_grn_from_po). Two-click confirm
// since it books stock + value. Partial receipts use the standalone GRN form.
export function PoReceiveAction({ poId, poNo }: { poId: string; poNo: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState(false);

  function onReceive() {
    if (!confirm) {
      setConfirm(true);
      return;
    }
    startTransition(async () => {
      const res = await postGrnFromPo(poId);
      setConfirm(false);
      if (res.ok) {
        toast.success("Goods received", `GRN raised for ${poNo}.`);
        router.push(`/purchasing/grn/${res.grnId}`);
        router.refresh();
      } else {
        toast.error("Could not receive", res.error);
      }
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      {confirm ? (
        <>
          <Button variant="secondary" size="sm" onClick={onReceive} loading={pending}>Confirm receive all</Button>
          <Button variant="ghost" size="sm" onClick={() => setConfirm(false)} disabled={pending}>Cancel</Button>
        </>
      ) : (
        <Button variant="primary" size="sm" onClick={onReceive}>Receive all</Button>
      )}
    </div>
  );
}
