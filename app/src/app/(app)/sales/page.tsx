import Link from "next/link";
import { listInvoices, getSalesTodayKpis, listStores, listSellableItems, getHomeStateCode } from "@/lib/data/sales";
import { getCurrentFy } from "@/lib/data/fy";
import { Panel } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Kpi, PageContainer, PageHeader } from "@/components/ui";
import { EmptyState } from "@/components/ui/EmptyState";
import { Money } from "@/components/ui/Money";
import { count as fmtCount } from "@/lib/format";
import { SalesTable } from "./SalesTable";
import { SalesDeskActions } from "./SalesDeskActions";

// Sales Desk — the operational sales register (§4.5). A recorded sale IS a tax
// invoice, so this page is the invoice register with a working desk around it:
// today's KPIs on top, every recorded sale below with row actions (view, record
// payment), and "Record sale" as the primary act. /invoices redirects here.
export const metadata = { title: "Sales — NEWBIZZ" };
export default async function SalesDeskPage() {
  const [invoices, kpis, fy, stores, items, homeState] = await Promise.all([
    listInvoices({ limit: 200 }),
    getSalesTodayKpis(),
    getCurrentFy(),
    listStores(),
    listSellableItems(),
    getHomeStateCode(),
  ]);

  const outstanding = invoices.filter((i) => i.status === "posted" || i.status === "part_paid");
  const outstandingValue = outstanding.reduce((s, i) => s + (i.grandTotal - i.amountPaid), 0);

  return (
    <PageContainer width="full">
      <PageHeader
        title="Sales Desk"
        subtitle={
          <>
            {fy ? `FY ${fy.code}` : "FY —"} · {fmtCount(invoices.length)} sales recorded
            {outstanding.length > 0 ? ` · ${fmtCount(outstanding.length)} awaiting payment` : ""}
          </>
        }
        actions={<SalesDeskActions stores={stores} items={items} homeState={homeState} />}
      />

      {/* KPI strip — today's desk position */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Sales today"
          value={<Money value={kpis.salesTotal} />}
          sub={`${fmtCount(kpis.invoiceCount)} ${kpis.invoiceCount === 1 ? "invoice" : "invoices"}`}
        />
        <Kpi
          label="Tax charged today"
          value={<Money value={kpis.taxTotal} />}
          sub="Output GST + cess"
        />
        <Kpi
          label="Collections today"
          value={<Money value={kpis.collectionsTotal} />}
          sub={`${fmtCount(kpis.receiptCount)} ${kpis.receiptCount === 1 ? "receipt" : "receipts"}`}
        />
        <Kpi
          label="Outstanding"
          value={<Money value={outstandingValue} />}
          sub={`${fmtCount(outstanding.length)} open ${outstanding.length === 1 ? "invoice" : "invoices"}`}
          tone={outstandingValue > 0 ? "amb" : "grn"}
        />
      </div>

      {/* Register */}
      <Panel title="Recorded sales" flush>
        {invoices.length === 0 ? (
          <EmptyState
            title="No sales recorded yet"
            description="Record a sale to raise the first tax invoice — revenue, GST and stock post in one transaction."
            action={
              <Link href="/sales/new">
                <Button variant="secondary" size="sm">Record a sale</Button>
              </Link>
            }
          />
        ) : (
          <SalesTable invoices={invoices} />
        )}
      </Panel>
    </PageContainer>
  );
}
