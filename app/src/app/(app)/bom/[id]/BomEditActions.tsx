"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { EditBomForm } from "./edit/EditBomForm";
import { CloneBomForm } from "./clone/CloneBomForm";
import type { BomDetail, AlternateGroupRow } from "@/lib/data/bom";
import type { ItemListRow } from "@/lib/data/catalog";

// "Edit" / "Clone" actions for a BOM detail page. Each opens its form in a
// right-side Drawer instead of routing to the deep /bom/[id]/edit or /clone
// page; those routes remain as deep-link fallbacks. Saving stays on the detail
// page and revalidates in place.
export function BomEditActions({
  bom,
  items,
  altGroups,
}: {
  bom: BomDetail;
  items: ItemListRow[];
  altGroups: AlternateGroupRow[];
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);

  const closeAndRefresh = (setter: (v: boolean) => void) => () => {
    setter(false);
    router.refresh();
  };

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
        Edit
      </Button>
      <Button variant="secondary" size="sm" onClick={() => setCloneOpen(true)}>
        Clone
      </Button>

      <Drawer
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title={`Edit — ${bom.parentSku}`}
        description="The existing BOM will be closed and a new version created."
        size="xl"
      >
        <EditBomForm
          bom={bom}
          items={items}
          altGroups={altGroups}
          onDone={closeAndRefresh(setEditOpen)}
          onCancel={() => setEditOpen(false)}
        />
      </Drawer>

      <Drawer
        open={cloneOpen}
        onClose={() => setCloneOpen(false)}
        title={`Clone — ${bom.parentSku}`}
        description="Duplicate this recipe as a new BOM starting today."
        size="xl"
      >
        <CloneBomForm
          bom={bom}
          items={items}
          altGroups={altGroups}
          onDone={closeAndRefresh(setCloneOpen)}
          onCancel={() => setCloneOpen(false)}
        />
      </Drawer>
    </>
  );
}