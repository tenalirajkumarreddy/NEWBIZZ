"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { removeAlternateGroupMember } from "@/lib/actions/bom";

export function RemoveMemberButton({
  groupId,
  itemId,
  itemName,
}: {
  groupId: string;
  itemId: string;
  itemName: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState(false);

  if (!confirm) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setConfirm(true)}>
        Remove
      </Button>
    );
  }

  function handleRemove() {
    startTransition(async () => {
      const res = await removeAlternateGroupMember(groupId, itemId);
      if (res.ok) {
        toast.success("Removed", `${itemName} removed from group.`);
        setConfirm(false);
        router.refresh();
      } else {
        toast.error("Could not remove", res.error);
      }
    });
  }

  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] text-ink-4">Remove?</span>
      <Button variant="danger" size="sm" loading={pending} onClick={handleRemove}>
        Yes
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirm(false)}>
        No
      </Button>
    </div>
  );
}
