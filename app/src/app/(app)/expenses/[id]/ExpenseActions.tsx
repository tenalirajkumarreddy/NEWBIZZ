"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { approveExpense, rejectExpense } from "@/lib/actions/expenses";

// Approve/reject a pending expense (§5.6). Approve posts the journal and
// decrements the source; reject captures a reason (two-step confirm) and is
// terminal with no ledger movement.
export function ExpenseActions({ expenseId, expenseNo }: { expenseId: string; expenseNo: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  function onApprove() {
    startTransition(async () => {
      const res = await approveExpense(expenseId);
      if (res.ok) {
        toast.success("Expense approved", `${expenseNo} posted to the ledger.`);
        router.refresh();
      } else {
        toast.error("Could not approve", res.error);
      }
    });
  }

  function onReject() {
    if (!rejecting) {
      setRejecting(true);
      return;
    }
    startTransition(async () => {
      const res = await rejectExpense(expenseId, reason.trim() || undefined);
      if (res.ok) {
        toast.success("Expense rejected", expenseNo);
        setRejecting(false);
        setReason("");
        router.refresh();
      } else {
        toast.error("Could not reject", res.error);
      }
    });
  }

  if (rejecting) {
    return (
      <div className="flex flex-col items-end gap-2">
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" className="w-56" aria-label="Rejection reason" />
        <div className="flex items-center gap-1.5">
          <Button variant="danger" size="sm" onClick={onReject} loading={pending}>Confirm reject</Button>
          <Button variant="ghost" size="sm" onClick={() => setRejecting(false)} disabled={pending}>Cancel</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <Button variant="ghost" size="sm" onClick={onReject} disabled={pending}>Reject</Button>
      <Button variant="primary" size="sm" onClick={onApprove} loading={pending}>Approve &amp; post</Button>
    </div>
  );
}
