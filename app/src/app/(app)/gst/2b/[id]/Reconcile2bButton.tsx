"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { reconcileGstr2b } from "@/lib/actions/gst";

// Re-run the match between this 2B import and recorded supplier bills (§5.9).
export function Reconcile2bButton({ importId }: { importId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  function onReconcile() {
    startTransition(async () => {
      const res = await reconcileGstr2b(importId);
      if (res.ok) {
        toast.success("Reconciled", `${res.matched} rows matched to recorded bills.`);
        router.refresh();
      } else {
        toast.error("Could not reconcile", res.error);
      }
    });
  }

  return (
    <Button variant="primary" size="sm" onClick={onReconcile} loading={pending}>
      Reconcile
    </Button>
  );
}
