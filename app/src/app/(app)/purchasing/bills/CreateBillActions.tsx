"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { NewBillForm } from "./new/BillForm";
import type { SupplierOption } from "@/lib/data/suppliers";
import type { StockableItemOption } from "@/lib/data/stock";

// "Record bill" for the bills list. Opens the form in a right-side Drawer
// instead of routing to /purchasing/bills/new; that route remains as a
// deep-link fallback. Saving stays on the list and revalidates in place.
export function CreateBillActions({
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
        Record bill
      </Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Record supplier bill"
        description="Books input GST and the payable. Saving keeps you on the bills list."
        size="xl"
      >
        <NewBillForm suppliers={suppliers} items={items} onDone={onDone} onCancel={() => setOpen(false)} />
      </Drawer>
    </>
  );
}