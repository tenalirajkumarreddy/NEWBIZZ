import Link from "next/link";
import { listReceipts, listAllStores, listPaymentMethods, listPaymentIntents } from "@/lib/data/collections";
import { getCurrentFy } from "@/lib/data/fy";
import { Panel } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Kpi, PageContainer, PageHeader } from "@/components/ui";
import { EmptyState } from "@/components/ui/EmptyState";
import { Money } from "@/components/ui/Money";
import { count as fmtCount } from "@/lib/format";
import { ReceiptsTable } from "./ReceiptsTable";
import { RecordPaymentAction } from "./RecordPaymentAction";
import { PaymentIntentsPanel } from "./PaymentIntentsPanel";

// Collections — the receipts register (§4.6). Every rupee in lands here:
// Dr cash/bank/custody, Cr AR. Allocated = knocked down to invoices;
// the remainder sits on-account against the customer.
export const metadata = { title: "Collections — NEWBIZZ" };
export default async function ReceiptsPage() {
  const [receipts, fy, stores, paymentMethods, intents] = await Promise.all([
    listReceipts({ limit: 200 }),
    getCurrentFy(),
    listAllStores(),
    listPaymentMethods(),
    listPaymentIntents(),
  ]);

  const posted = receipts.filter((r) => r.status === "posted");
  const total = posted.reduce((s, r) => s + r.amount, 0);
  const allocated = posted.reduce((s, r) => s + r.allocatedAmount, 0);
  const onAccount = total - allocated;
  const cashCustody = posted
    .filter((r) => r.depositAccount === "1110" || r.depositAccount === "2140")
    .reduce((s, r) => s + r.amount, 0);
  const pendingIntents = intents.filter((i) => i.status === "pending");
  const pendingIntentAmount = pendingIntents.reduce((s, i) => s + i.amount, 0);

  return (
    <PageContainer width="full">
      <PageHeader
        title="Collections"
        subtitle={
          <>
            {fy ? `FY ${fy.code}` : "FY —"} · {fmtCount(receipts.length)} receipts
          </>
        }
        actions={<RecordPaymentAction stores={stores} paymentMethods={paymentMethods} />}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Collected"
          value={<Money value={total} />}
          sub={`${fmtCount(posted.length)} posted ${posted.length === 1 ? "receipt" : "receipts"}`}
        />
        <Kpi
          label="Allocated to invoices"
          value={<Money value={allocated} />}
          sub="Knocked down against AR"
        />
        <Kpi
          label="On account"
          value={<Money value={onAccount} />}
          sub="Unallocated — sits on the customer"
          tone={onAccount > 0.005 ? "amb" : "grn"}
        />
        <Kpi
          label="Cash & custody"
          value={<Money value={cashCustody} />}
          sub="Not yet in the bank"
        />
      </div>

      {intents.length > 0 && (
        <PaymentIntentsPanel intents={intents} stores={stores} paymentMethods={paymentMethods} />
      )}

      <Panel flush>
        {receipts.length === 0 ? (
          <EmptyState
            title="No receipts yet"
            description="Payments you record land here — cash, UPI, bank, cheque or card, allocated against open invoices."
            action={
              <Link href="/receipts/new">
                <Button variant="secondary" size="sm">Record a payment</Button>
              </Link>
            }
          />
        ) : (
          <ReceiptsTable receipts={receipts} />
        )}
      </Panel>
    </PageContainer>
  );
}
