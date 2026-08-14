import { listStores, listSellableItems } from "@/lib/data/sales";
import { getCurrentFy } from "@/lib/data/fy";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageContainer, PageHeader } from "@/components/ui";
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
    <PageContainer width="report">
      <PageHeader
        title="New order"
        subtitle={
          <>
            {fy ? `FY ${fy.code}` : "FY —"} · Demand only — nothing posts until the order is invoiced
          </>
        }
        backHref="/orders"
        backLabel="Order Book"
      />

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
    </PageContainer>
  );
}
