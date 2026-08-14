"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { NewGrnForm } from "./new/GrnForm";
import type { SupplierOption } from "@/lib/data/suppliers";
import type { StockableItemOption } from "@/lib/data/stock";

// "Receive goods" for the GRN list. Opens the form in a right-side Drawer
// instead of routing to /purchasing/grn/new; that route remains as a
// deep-link fallback. Saving stays on the list and revalidates in place.
export function ReceiveGoodsActions({
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
        Receive goods
      </Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Receive goods"
        description="Books received goods into stock at cost. Saving keeps you on the GRN list."
        size="xl"
      >
        <NewGrnForm suppliers={suppliers} items={items} onDone={onDone} onCancel={() => setOpen(false)} />
      </Drawer>
    </>
  );
}