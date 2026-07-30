import Link from "next/link";
import { listPurchaseOrders, listGrns, listBills, listSupplierPayments, listDebitNotes, listUnbilledGrns } from "@/lib/data/purchases";
import { getCurrentFy } from "@/lib/data/fy";
import { Panel, Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Kpi } from "@/components/ui";
import { StatusBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Money } from "@/components/ui/Money";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { dateIST, count as fmtCount } from "@/lib/format";

// Purchasing hub (§5.4) — the buy-side control tower. PO (intent) → GRN (goods
// in at cost) → Bill (GST + payable) → Payment. Each doc has its own register;
// this page gives the open-work picture and the entry points.
export default async function PurchasingPage() {
  const [pos, grns, bills, payments, debitNotes, unbilled, fy] = await Promise.all([
    listPurchaseOrders({ limit: 8 }),
    listGrns({ limit: 8 }),
    listBills({ limit: 8 }),
    listSupplierPayments({ limit: 5 }),
    listDebitNotes({ limit: 5 }),
    listUnbilledGrns(),
    getCurrentFy(),
  ]);

  const openPos = pos.filter((p) => p.status === "draft" || p.status === "confirmed").length;
  const unpaidBills = bills.filter((b) => b.status === "posted" || b.status === "part_paid");
  const payableOpen = unpaidBills.reduce((s, b) => s + (b.grandTotal - b.amountPaid), 0);

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-6 py-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-ink">Purchasing</h1>
          <p className="mt-0.5 text-[13px] text-ink-3">
            {fy ? `FY ${fy.code}` : "FY —"} · PO → GRN → Bill → Payment
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Link href="/purchasing/po/new"><Button variant="secondary" size="sm">New PO</Button></Link>
          <Link href="/purchasing/grn/new"><Button variant="secondary" size="sm">Receive goods</Button></Link>
          <Link href="/purchasing/bills/new"><Button variant="primary" size="sm">Record bill</Button></Link>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Open POs" value={fmtCount(openPos)} sub="Awaiting receipt" tone={openPos > 0 ? "amb" : "grn"} />
        <Kpi label="GRNs to bill" value={fmtCount(unbilled.length)} sub="Received, not billed" tone={unbilled.length > 0 ? "amb" : "grn"} />
        <Kpi label="Payable open" value={<Money value={payableOpen} />} sub={`${fmtCount(unpaidBills.length)} unpaid bills`} tone={payableOpen > 0 ? "amb" : "grn"} />
        <Kpi label="Debit notes" value={fmtCount(debitNotes.length)} sub="Purchase returns" />
      </div>

      {/* Register tabs (simple links) */}
      <div className="flex flex-wrap gap-2">
        <TabLink href="/purchasing/po" label="Purchase Orders" count={pos.length} />
        <TabLink href="/purchasing/grn" label="Goods Receipts" count={grns.length} />
        <TabLink href="/purchasing/bills" label="Bills" count={bills.length} />
        <TabLink href="/purchasing/pay" label="Payments" count={payments.length} />
        <TabLink href="/purchasing/debit-notes" label="Debit Notes" count={debitNotes.length} />
      </div>

      {/* GRNs awaiting a bill — the actionable queue */}
      <Panel
        title="Received goods awaiting a bill"
        actions={<Link href="/purchasing/grn" className="text-[12px] font-medium text-brand hover:underline">All GRNs →</Link>}
        flush
      >
        {unbilled.length === 0 ? (
          <EmptyState title="Nothing waiting to bill" description="Received goods that haven't been matched to a supplier bill will queue here." />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>GRN No</TH>
                <TH>Date</TH>
                <TH>Supplier</TH>
                <TH>From PO</TH>
                <TH numeric>Goods value</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {unbilled.map((g) => (
                <TR key={g.id} interactive>
                  <TD className="p-0">
                    <Link href={`/purchasing/grn/${g.id}`} className="block px-3 py-2.5 font-mono text-[12px] font-semibold text-brand">{g.grnNo}</Link>
                  </TD>
                  <TD>{dateIST(g.grnDate)}</TD>
                  <TD className="font-medium text-ink">{g.supplierName ?? "—"}</TD>
                  <TD className="font-mono text-[12px] text-ink-3">{g.poNo ?? "—"}</TD>
                  <TD numeric><Money value={g.goodsValue} /></TD>
                  <TD><StatusBadge status={g.status} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Panel>

      <Card className="p-3.5">
        <p className="text-[11px] text-ink-4">
          Stock and Input GST rise on the GRN (goods in) and bill (tax booked) — never on the PO.
          A bill can be raised directly (ad-hoc buy) or matched to a GRN.
        </p>
      </Card>
    </div>
  );
}

function TabLink({ href, label, count }: { href: string; label: string; count: number }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] font-medium text-ink-2 hover:border-brand/40 hover:text-brand"
    >
      {label}
      <span className="rounded-full bg-fill px-1.5 py-0.5 font-mono text-[10px] text-ink-4">{count}</span>
    </Link>
  );
}
