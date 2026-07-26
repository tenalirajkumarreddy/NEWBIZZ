"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { closeBom } from "@/lib/actions/bom";

export function CloseBomButton({ bomId }: { bomId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [showConfirm, setShowConfirm] = useState(false);

  function handleClose() {
    const effectiveTo = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    startTransition(async () => {
      const res = await closeBom(bomId, effectiveTo);
      if (res.ok) {
        toast.success("BOM closed", "This recipe is now expired.");
        router.refresh();
      } else {
        toast.error("Could not close BOM", res.error);
      }
    });
  }

  if (!showConfirm) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setShowConfirm(true)}>
        Close
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-medium text-ink-4">Close this BOM?</span>
      <Button variant="danger" size="sm" loading={pending} onClick={handleClose}>
        Yes, close it
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setShowConfirm(false)}>
        Cancel
      </Button>
    </div>
  );
}
