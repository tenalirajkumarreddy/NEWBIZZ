import Link from "next/link";
import { listInvoices, getSalesTodayKpis, listStores, listSellableItems, getHomeStateCode } from "@/lib/data/sales";
import { getSession } from "@/lib/auth/session";
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
  const session = await getSession();
  const claims = session?.claims;

  const canViewInvoices  = !!claims?.is_admin || (claims?.perms.includes("invoice.view")  ?? false);
  const canViewCashMemos = !!claims?.is_admin || (claims?.perms.includes("cashmemo.view") ?? false);
  // Office register (official only) when the desk shows exactly one doc type.
  const isOfficial = canViewInvoices && !canViewCashMemos ? true : !canViewInvoices && canViewCashMemos ? false : undefined;
  const canRecordPayment = !!claims?.is_admin || (claims?.perms.includes("invoice.payment") ?? false);
  const canRecordSale = !!claims?.is_admin || (claims?.perms.includes("invoice.create") ?? false) || (claims?.perms.includes("cashmemo.create") ?? false);

  const [invoices, kpis, fy, stores, items, homeState] = await Promise.all([
    listInvoices({ limit: 200, isOfficial }),
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
        actions={<SalesDeskActions stores={stores} items={items} homeState={homeState} canRecordSale={canRecordSale} />}
      />

      {/* KPI strip — today's desk position. Sales/tax figures cover ALL invoices
          (official + memos), so they are shown only to principals who can view
          official invoices; a memo-only user's register must not leak them. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {canViewInvoices && (
          <>
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
          </>
        )}
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
              canRecordSale ? (
                <Link href="/sales/new">
                  <Button variant="secondary" size="sm">Record a sale</Button>
                </Link>
              ) : undefined
            }
          />
        ) : (
          <SalesTable invoices={invoices} canViewInvoices={canViewInvoices} canViewCashMemos={canViewCashMemos} canRecordPayment={canRecordPayment} />
        )}
      </Panel>
    </PageContainer>
  );
}
