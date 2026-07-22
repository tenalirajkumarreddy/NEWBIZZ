"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { NewOrderForm } from "./new/NewOrderForm";
import type { StoreOption, ItemOption } from "@/lib/data/sales";

// "New order" header action for the Order Book. Opens the existing NewOrderForm
// in a right-side Drawer instead of routing to /orders/new; /orders/new remains
// as a deep-link fallback. Masters are preloaded on the list page (server).
export function NewOrderAction({
  stores,
  items,
}: {
  stores: StoreOption[];
  items: ItemOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const mastersReady = stores.length > 0 && items.length > 0;

  return (
    <>
      <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
        New order
      </Button>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="New order"
        description="Confirmed demand — no accounting impact until invoiced."
        size="xl"
      >
        {mastersReady ? (
          <NewOrderForm
            stores={stores}
            items={items}
            onCancel={() => setOpen(false)}
            onDone={() => {
              setOpen(false);
              router.refresh();
            }}
          />
        ) : (
          <p className="text-[13px] text-ink-3">
            No active stores or sellable items are available yet. Add them before placing an
            order.
          </p>
        )}
      </Drawer>
    </>
  );
}
