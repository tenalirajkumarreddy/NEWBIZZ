"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { NewTransferPanel } from "./NewTransferPanel";
import { money, qty as fmtQty } from "@/lib/format";
import type { AppClaims } from "@/lib/auth/claims";
import type { UserOption } from "@/lib/data/holdings";
import type { BranchOption, StockableItemOption } from "@/lib/data/stock";

export interface MyStockOption {
  itemId: string;
  sku: string;
  name: string;
  qty: number;
  baseUnitCode: string | null;
}

// "New handover" header action for the Holdings page. Opens the create form in
// a right-side Drawer so the page stays on custody + the register. Saving
// closes the drawer and revalidates in place.
export function NewHandoverButton({
  claims,
  users,
  branches,
  items,
  myUserId,
  myCash,
  myStock,
}: {
  claims: AppClaims;
  users: UserOption[];
  branches: BranchOption[];
  items: StockableItemOption[];
  myUserId: string | null;
  myCash: number;
  myStock: MyStockOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const myUnits = myStock.reduce((s, x) => s + x.qty, 0);

  const onDone = () => {
    setOpen(false);
    router.refresh();
  };

  return (
    <>
      <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
        New handover
      </Button>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="New handover"
        description={`Your custody right now: ${money(myCash)} cash · ${fmtQty(myUnits)} units of stock`}
        size="xl"
      >
        <NewTransferPanel
          claims={claims}
          users={users}
          branches={branches}
          items={items}
          myUserId={myUserId}
          myCash={myCash}
          myStock={myStock}
          bare
          onDone={onDone}
        />
      </Drawer>
    </>
  );
}