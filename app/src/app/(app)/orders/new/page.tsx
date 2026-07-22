import Link from "next/link";
import { listStores, listSellableItems } from "@/lib/data/sales";
import { getCurrentFy } from "@/lib/data/fy";
import { EmptyState } from "@/components/ui/EmptyState";
import { NewOrderForm } from "./NewOrderForm";

// New order — demand capture (§4.4). place_order confirms the order with no
// ledger or stock impact; the value event happens later via "Deliver".
export default async function NewOrderPage() {
  const [stores, items, fy] = await Promise.all([
    listStores(),
    listSellableItems(),
    getCurrentFy(),
  ]);

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-4 px-6 py-6 lg:px-8">
      <div>
        <Link href="/orders" className="text-[12px] font-medium text-ink-4 hover:text-brand">
          ← Order Book
        </Link>
        <h1 className="mt-1 text-[22px] font-bold tracking-tight text-ink">New order</h1>
        <p className="mt-0.5 text-[13px] text-ink-3">
          {fy ? `FY ${fy.code}` : "FY —"} · Demand only — nothing posts until the order is invoiced
        </p>
      </div>

      {stores.length === 0 || items.length === 0 ? (
        <EmptyState
          tone="error"
          title="Masters not ready"
          description={
            stores.length === 0
              ? "No active customer stores are available to you yet. Add a store before placing an order."
              : "No active sellable items are available yet. Add items to the catalog before placing an order."
          }
        />
      ) : (
        <NewOrderForm stores={stores} items={items} />
      )}
    </div>
  );
}
