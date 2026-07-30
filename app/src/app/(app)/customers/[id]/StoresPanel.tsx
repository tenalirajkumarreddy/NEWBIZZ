"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Panel } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Drawer } from "@/components/ui/Drawer";
import { count as fmtCount, titleCase } from "@/lib/format";
import type { StoreListRow } from "@/lib/data/customers";
import type { PriceListRow } from "@/lib/data/catalog";
import { NewStoreForm } from "./stores/new/NewStoreForm";

const KIND_TONE: Record<string, "brand" | "grn" | "amb" | "slate"> = {
  retail: "brand",
  wholesale: "grn",
  distributor: "amb",
  institution: "slate",
};

export function StoresPanel({
  customerId,
  stores,
  priceLists = [],
}: {
  customerId: string;
  stores: StoreListRow[];
  priceLists?: PriceListRow[];
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <Panel
      title={`Stores (${fmtCount(stores.length)})`}
      actions={
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setDrawerOpen(true)}>
            Add store
          </Button>
        </div>
      }
    >
      {stores.length === 0 ? (
        <EmptyState
          title="No stores yet"
          description="A store is a ship-to outlet under this customer."
          action={<Button variant="secondary" size="sm" onClick={() => setDrawerOpen(true)}>Add store</Button>}
        />
      ) : (
        <div className="flex flex-col gap-2 p-3">
          {stores.map((s) => (
            <Link
              key={s.id}
              href={`/customers/${customerId}/stores/${s.id}`}
              className="group flex items-start gap-3 rounded-lg border border-line bg-surface p-3.5 transition hover:border-ink-2 hover:shadow-sm active:scale-[0.99]"
            >
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-fill">
                {s.imageUrl ? (
                  <img src={s.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <span className="text-[13px] font-bold text-ink-3">
                      {s.name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("")}
                    </span>
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] font-semibold text-brand">{s.code}</span>
                      {s.isPrimary && <Badge tone="brand" size="sm">Primary</Badge>}
                    </div>
                    <div className="mt-0.5 truncate text-[14px] font-medium text-ink group-hover:text-brand">{s.name}</div>
                  </div>
                  <Badge tone={KIND_TONE[s.kind] ?? "slate"} size="sm">{titleCase(s.kind)}</Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-ink-3">
                  {s.city && <span>{s.city}</span>}
                  {s.phone && <span>{s.phone}</span>}
                  {s.priceListName && <span>Rate: {s.priceListName}</span>}
                </div>
                <div className="mt-1.5">
                  <Badge tone={s.status === "active" ? "grn" : "slate"} size="sm">{s.status}</Badge>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Add store" description="A store is a ship-to outlet under this customer." size="lg">
        <NewStoreForm customerId={customerId} priceLists={priceLists} hasExistingStores={stores.length > 0} onClose={() => setDrawerOpen(false)} />
      </Drawer>
    </Panel>
  );
}
