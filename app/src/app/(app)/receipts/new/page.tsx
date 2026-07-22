import Link from "next/link";
import { listAllStores, listPaymentMethods } from "@/lib/data/collections";
import { getCurrentFy } from "@/lib/data/fy";
import { EmptyState } from "@/components/ui/EmptyState";
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
    <div className="mx-auto flex max-w-[1100px] flex-col gap-4 px-6 py-6 lg:px-8">
      <div>
        <Link href="/receipts" className="text-[12px] font-medium text-ink-4 hover:text-brand">
          ← Collections
        </Link>
        <h1 className="mt-1 text-[22px] font-bold tracking-tight text-ink">Record payment</h1>
        <p className="mt-0.5 text-[13px] text-ink-3">
          {fy ? `FY ${fy.code}` : "FY —"} · Payment auto-allocated against open invoices (oldest first)
        </p>
      </div>

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
    </div>
  );
}
