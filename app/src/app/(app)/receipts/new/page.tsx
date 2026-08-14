import { listAllStores, listPaymentMethods } from "@/lib/data/collections";
import { getCurrentFy } from "@/lib/data/fy";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageContainer, PageHeader } from "@/components/ui";
import { RecordReceiptForm } from "./RecordReceiptForm";

export default async function NewReceiptPage({
  searchParams,
}: {
  searchParams: { store?: string };
}) {
  const [stores, paymentMethods, fy] = await Promise.all([
    listAllStores(),
    listPaymentMethods(),
    getCurrentFy(),
  ]);

  const initialStoreId = searchParams.store ?? "";

  return (
    <PageContainer width="report">
      <PageHeader
        title="Record payment"
        subtitle={
          <>
            {fy ? `FY ${fy.code}` : "FY —"} · Payment auto-allocated against open invoices (oldest first)
          </>
        }
        backHref="/receipts"
        backLabel="Collections"
      />

      {stores.length === 0 ? (
        <EmptyState
          tone="error"
          title="Masters not ready"
          description="No active stores are available. Add a customer with a store before recording a payment."
        />
      ) : (
        <RecordReceiptForm
          stores={stores}
          paymentMethods={paymentMethods}
          initialStoreId={initialStoreId}
        />
      )}
    </PageContainer>
  );
}
