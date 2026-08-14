"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { NewPoForm } from "./new/PoForm";
import type { SupplierOption } from "@/lib/data/suppliers";
import type { StockableItemOption } from "@/lib/data/stock";

// "New PO" for the PO list. Opens the form in a right-side Drawer instead of
// routing to /purchasing/po/new; that route remains as a deep-link fallback.
// Saving stays on the list and revalidates in place.
export function CreatePoActions({
  suppliers,
  items,
}: {
  suppliers: SupplierOption[];
  items: StockableItemOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const onDone = () => {
    setOpen(false);
    router.refresh();
  };

  return (
    <>
      <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
        New PO
      </Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="New purchase order"
        description="Records intent to buy. Saving keeps you on the PO list."
        size="xl"
      >
        <NewPoForm suppliers={suppliers} items={items} onDone={onDone} onCancel={() => setOpen(false)} />
      </Drawer>
    </>
  );
}