"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, ConfirmDialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Field, Textarea } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { reverseProductionRun } from "@/lib/actions/production";

// ReverseRunDialog — destructive reversal of a posted production run. Requires
// an explicit reason; the RPC also enforces FY + permission guards.
export function ReverseRunDialog({ runId, runNo }: { runId: string; runNo: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  function doReverse() {
    startTransition(async () => {
      const res = await reverseProductionRun(runId, reason);
      if (res.ok) {
        toast.success("Run reversed", `Run ${runNo} reversed — stock and journal restored.`);
        setOpen(false);
        setReason("");
        router.refresh();
        router.push("/production");
      } else {
        toast.error("Could not reverse run", res.error);
      }
    });
  }

  return (
    <>
      <Button variant="danger" size="md" onClick={() => setOpen(true)}>
        Reverse run
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Reverse run ${runNo}`}
        description="This posts a compensating journal: consumed inputs return to stock and the output is removed. This cannot be undone."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => setConfirming(true)}
              disabled={!reason.trim() || pending}
            >
              Continue
            </Button>
          </>
        }
      >
        <Field label="Reversal reason" required htmlFor="rev-reason" hint="Required — recorded in the audit trail">
          <Textarea
            id="rev-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this run being reversed?"
          />
        </Field>
      </Dialog>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={doReverse}
        title="Reverse this run?"
        description={`Run ${runNo} will be marked reversed and all its journal entries compensated. This is final.`}
        confirmLabel="Reverse run"
        danger
        loading={pending}
      />
    </>
  );
}
