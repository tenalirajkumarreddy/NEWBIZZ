"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { NewDebitNoteForm } from "./new/DebitNoteForm";
import type { SupplierOption } from "@/lib/data/suppliers";
import type { StockableItemOption } from "@/lib/data/stock";

// "New debit note" for the debit-notes list. Opens the form in a right-side
// Drawer instead of routing to /purchasing/debit-notes/new; that route remains
// as a deep-link fallback. Saving stays on the list and revalidates in place.
export function CreateDebitNoteActions({
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
        New debit note
      </Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="New debit note"
        description="Return goods to a supplier. Saving keeps you on the debit-notes list."
        size="xl"
      >
        <NewDebitNoteForm suppliers={suppliers} items={items} onDone={onDone} onCancel={() => setOpen(false)} />
      </Drawer>
    </>
  );
}