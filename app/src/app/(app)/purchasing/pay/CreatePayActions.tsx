"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { PaySupplierForm } from "./new/PayForm";
import type { SupplierOption } from "@/lib/data/suppliers";

// "Pay supplier" for the payments list. Opens the form in a right-side Drawer
// instead of routing to /purchasing/pay/new; that route remains as a deep-link
// fallback. Saving stays on the list and revalidates in place.
export function CreatePayActions({ suppliers }: { suppliers: SupplierOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const onDone = () => {
    setOpen(false);
    router.refresh();
  };

  return (
    <>
      <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
        Pay supplier
      </Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Pay supplier"
        description="Settle open bills, or leave the remainder as an advance. Saving keeps you on the payments list."
        size="lg"
      >
        <PaySupplierForm suppliers={suppliers} onDone={onDone} onCancel={() => setOpen(false)} />
      </Drawer>
    </>
  );
}