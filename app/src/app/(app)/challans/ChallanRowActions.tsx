"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { setChallanStatus } from "@/lib/actions/challans";
import type { ChallanStatus } from "@/lib/data/challans";

// Row-level actions for the challan transit machine (§4.4):
//   printed    → Dispatch (in_transit) · Mark delivered · Cancel
//   in_transit → Mark delivered · Cancel
//   delivered / cancelled → terminal, no actions
// "Mark delivered" is the fulfilment event: it bumps qty_fulfilled on the order
// lines and, once every line is complete, closes the order as fulfilled.
export function ChallanRowActions({
  challanId,
  challanNo,
  status,
  orderId,
}: {
  challanId: string;
  challanNo: string;
  status: ChallanStatus;
  orderId: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  const canDispatch = status === "printed";
  const canDeliver = status === "printed" || status === "in_transit";
  const canCancel = status === "printed" || status === "in_transit";
  if (!canDispatch && !canDeliver && !canCancel) return null;

  function move(next: ChallanStatus, okMsg: string) {
    startTransition(async () => {
      const res = await setChallanStatus(challanId, next, orderId);
      setConfirmingCancel(false);
      if (res.ok) {
        toast.success(okMsg, `Challan ${challanNo}`);
        router.refresh();
      } else {
        toast.error("Could not update challan", res.error);
      }
    });
  }

  function onCancel() {
    if (!confirmingCancel) {
      setConfirmingCancel(true);
      return;
    }
    move("cancelled", "Challan cancelled");
  }

  return (
    <div className="flex items-center gap-1.5">
      {!confirmingCancel && canDispatch && (
        <Button variant="ghost" size="sm" onClick={() => move("in_transit", "Marked in transit")} loading={pending}>
          Dispatch
        </Button>
      )}
      {!confirmingCancel && canDeliver && (
        <Button variant="secondary" size="sm" onClick={() => move("delivered", "Delivery recorded")} loading={pending}>
          Mark delivered
        </Button>
      )}
      {canCancel && (
        <>
          {confirmingCancel ? (
            <>
              <Button variant="danger" size="sm" onClick={onCancel} loading={pending}>
                Confirm cancel
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmingCancel(false)} disabled={pending}>
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
