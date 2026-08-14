import { listStores, listSellableItems, getHomeStateCode } from "@/lib/data/sales";
import { getCurrentFy } from "@/lib/data/fy";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageContainer, PageHeader } from "@/components/ui";
import { RecordSaleForm } from "./RecordSaleForm";

// Record a sale — the Sales Desk's create surface. Loads the store + item
// masters (and our home state, for the GST preview) server-side under RLS,
// then hands them to the client form, which calls the recordSale Server
// Action. That posts a tax invoice: revenue + GST + AR journalled and stock
// issued at WAC, in one transaction. Use the Order Book when demand precedes
// delivery.
export default async function RecordSalePage() {
  const [stores, items, homeState, fy] = await Promise.all([
    listStores(),
    listSellableItems(),
    getHomeStateCode(),
    getCurrentFy(),
  ]);

  return (
    <PageContainer width="report">
      <PageHeader
        title="Record a sale"
        subtitle={
          <>
            {fy ? `FY ${fy.code}` : "FY —"} · Revenue, GST and stock posted in one transaction
          </>
        }
        backHref="/sales"
        backLabel="Sales Desk"
      />

      {stores.length === 0 || items.length === 0 ? (
        <EmptyState
          tone="error"
          title="Masters not ready"
          description={
            stores.length === 0
              ? "No active customer stores are available to you yet. Add a store before recording a sale."
              : "No active sellable items are available yet. Add items to the catalog before recording a sale."
          }
        />
      ) : (
        <RecordSaleForm stores={stores} items={items} homeState={homeState} />
      )}
    </PageContainer>
  );
}
