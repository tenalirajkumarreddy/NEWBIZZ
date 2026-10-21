"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { decideReversal } from "@/lib/actions/approvals";

// One row of the maker-checker queue. Approving runs the void in this user's
// transaction; the database refuses an approval by the person who filed it.
export function ApprovalActions({
  requestId,
  docNo,
  amountLabel,
}: {
  requestId: string;
  docNo: string;
  amountLabel: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  function decide(approve: boolean) {
    startTransition(async () => {
      const res = await decideReversal(requestId, approve, note);
      if (res.ok) {
        toast.success(
          approve ? "Reversal approved" : "Reversal rejected",
          approve
            ? `${docNo} (${amountLabel}) is void and reversed.`
            : `${docNo} stays posted.`,
        );
        setOpen(false);
        setNote("");
        router.refresh();
      } else {
        toast.error(approve ? "Could not approve" : "Could not reject", res.error);
      }
    });
  }

  if (!open) {
    return (
      <div className="flex items-center justify-end gap-1.5">
        <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
          Review
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="Why (optional) — stored on the request and the audit log"
        className="w-full min-w-[240px]"
      />
      <div className="flex items-center gap-1.5">
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
        <Button variant="secondary" size="sm" onClick={() => decide(false)} disabled={pending}>
          Reject
        </Button>
        <Button variant="danger" size="sm" onClick={() => decide(true)} loading={pending}>
          Approve void
        </Button>
      </div>
    </div>
  );
}
