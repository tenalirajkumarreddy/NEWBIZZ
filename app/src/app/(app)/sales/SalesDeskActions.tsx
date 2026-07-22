"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { RecordSaleForm } from "./new/RecordSaleForm";
import { NewOrderForm } from "../orders/new/NewOrderForm";
import type { StoreOption, ItemOption } from "@/lib/data/sales";

// Header actions for the Sales Desk. Instead of routing to /sales/new and
// /orders/new (deep-into-pages, then back-arrow), each button opens the existing
// form in a right-side Drawer so the user never leaves the register. The
// /new routes still exist as deep-link fallbacks. Master data is loaded once on
// the list page (server) and passed down, so opening the drawer is instant.
export function SalesDeskActions({
  stores,
  items,
  homeState,
}: {
  stores: StoreOption[];
  items: ItemOption[];
  homeState: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<null | "sale" | "order">(null);

  const mastersReady = stores.length > 0 && items.length > 0;

  return (
    <>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => setOpen("order")}>
          New order
        </Button>
        <Button variant="primary" size="sm" onClick={() => setOpen("sale")}>
          Record sale
        </Button>
      </div>

      <Drawer
        open={open === "sale"}
        onClose={() => setOpen(null)}
        title="Record a sale"
        description="Revenue, GST and stock post in one transaction."
        size="xl"
      >
        {mastersReady ? (
          <RecordSaleForm
            stores={stores}
            items={items}
            homeState={homeState}
            onCancel={() => setOpen(null)}
            onDone={() => {
              setOpen(null);
              router.refresh();
            }}
          />
        ) : (
          <MastersNotReady kind="sale" />
        )}
      </Drawer>

      <Drawer
        open={open === "order"}
        onClose={() => setOpen(null)}
        title="New order"
        description="Confirmed demand — no accounting impact until invoiced."
        size="xl"
      >
        {mastersReady ? (
          <NewOrderForm
            stores={stores}
            items={items}
            onCancel={() => setOpen(null)}
            onDone={() => {
              setOpen(null);
              router.refresh();
            }}
          />
        ) : (
          <MastersNotReady kind="order" />
        )}
      </Drawer>
    </>
  );
}

function MastersNotReady({ kind }: { kind: "sale" | "order" }) {
  return (
    <p className="text-[13px] text-ink-3">
      No active stores or sellable items are available yet. Add them before recording a{" "}
      {kind === "sale" ? "sale" : "n order"}.
    </p>
  );
}
