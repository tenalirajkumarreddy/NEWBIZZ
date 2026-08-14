"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { NewBomForm } from "./new/NewBomForm";
import type { ItemListRow } from "@/lib/data/catalog";
import type { AlternateGroupRow } from "@/lib/data/bom";

// "New BOM" for the BOM list. Opens the form in a right-side Drawer instead of
// routing to /bom/new; that route remains as a deep-link fallback. Saving stays
// on the list and revalidates in place.
export function NewBomActions({
  items,
  altGroups,
}: {
  items: ItemListRow[];
  altGroups: AlternateGroupRow[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const onDone = () => {
    setOpen(false);
    router.refresh();
  };

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        New BOM
      </Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="New BOM"
        description="Define the components needed to manufacture one item. Saving keeps you on the BOM list."
        size="xl"
      >
        <NewBomForm items={items} altGroups={altGroups} onDone={onDone} onCancel={() => setOpen(false)} />
      </Drawer>
    </>
  );
}