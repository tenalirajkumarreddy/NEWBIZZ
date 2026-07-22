"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { reverseJournal } from "@/lib/actions/accounting";

// Reverse a posted entry (§5.1). Posted journals are immutable, so a correction
// is a mirror entry via reverse_journal. Two-step confirm captures the reason,
// which lands on the reversal's narration and the audit log.
export function JournalEntryActions({ entryId, entryNo }: { entryId: string; entryNo: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");

  function onReverse() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    startTransition(async () => {
      const res = await reverseJournal(entryId, reason.trim() || undefined);
      if (res.ok) {
        toast.success("Entry reversed", `A reversal was posted for ${entryNo}.`);
        setConfirming(false);
        setReason("");
        router.push(`/journal/${res.entryId}`);
        router.refresh();
      } else {
        toast.error("Could not reverse entry", res.error);
      }
    });
  }

  if (!confirming) {
    return (
      <Button variant="ghost" size="sm" onClick={onReverse} disabled={pending}>
        Reverse entry
      </Button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <Input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (optional)"
        className="w-56"
        aria-label="Reversal reason"
      />
      <div className="flex items-center gap-1.5">
        <Button variant="danger" size="sm" onClick={onReverse} loading={pending}>
          Confirm reversal
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
