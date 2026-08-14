import Link from "next/link";
import { notFound } from "next/navigation";
import { get2bReport } from "@/lib/data/gst";
import { Panel, Card } from "@/components/ui/Card";
import { Kpi, PageContainer, PageHeader } from "@/components/ui";
import { StatusBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Money } from "@/components/ui/Money";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { dateIST, count as fmtCount } from "@/lib/format";
import { Reconcile2bButton } from "./Reconcile2bButton";

const STATUS_LABEL: Record<string, string> = {
  matched: "Matched",
  mismatch: "Mismatch",
  missing_in_books: "Not in books",
  missing_in_2b: "Not in 2B",
};

// One GSTR-2B import's reconciliation report (§5.9). Every portal row with its
// match verdict, plus the books-side bills that had no 2B row (ITC to defer).
export default async function Gstr2bDetailPage({ params }: { params: { id: string } }) {
  const report = await get2bReport(params.id);
  if (!report.import) notFound();

  const matched = report.rows.filter((r) => r.matchStatus === "matched").length;
  const mismatch = report.rows.filter((r) => r.matchStatus === "mismatch").length;
  const missingBooks = report.rows.filter((r) => r.matchStatus === "missing_in_books").length;
  const matchedTax = report.rows.filter((r) => r.matchStatus === "matched").reduce((s, r) => s + r.tax, 0);

  return (
    <PageContainer width="wide">
      <PageHeader
        backHref="/gst/2b"
        backLabel="GSTR-2B"
        title={`2B · ${report.import.period}`}
        subtitle={`${fmtCount(report.import.rowCount)} portal rows${report.import.filename ? ` · ${report.import.filename}` : ""}`}
        actions={<Reconcile2bButton importId={report.import.id} />}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Matched" value={fmtCount(matched)} sub="ITC safe to claim" tone="grn" />
        <Kpi label="Mismatch" value={fmtCount(mismatch)} sub="Amounts differ" tone={mismatch > 0 ? "amb" : "grn"} />
        <Kpi label="Not in books" value={fmtCount(missingBooks)} sub="Unrecorded purchase" tone={missingBooks > 0 ? "amb" : "grn"} />
        <Kpi label="Matched ITC" value={<Money value={matchedTax} />} sub="Claimable input tax" />
      </div>

      <Panel title="Portal rows (GSTR-2B)" flush>
        {report.rows.length === 0 ? (
          <EmptyState title="No rows" description="This import has no rows." />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Supplier GSTIN</TH>
                <TH>Invoice</TH>
                <TH>Date</TH>
                <TH numeric>Taxable</TH>
                <TH numeric>Tax</TH>
                <TH>Match</TH>
                <TH>Bill</TH>
              </TR>
            </THead>
            <TBody>
              {report.rows.map((r) => (
                <TR key={r.id}>
                  <TD className="font-mono text-[11px] text-ink-2">{r.supplierGstin ?? "—"}</TD>
                  <TD className="font-mono text-[12px]">{r.invoiceNo ?? "—"}</TD>
                  <TD>{r.invoiceDate ? dateIST(r.invoiceDate) : "—"}</TD>
                  <TD numeric><Money value={r.taxable} /></TD>
                  <TD numeric><Money value={r.tax} /></TD>
                  <TD><StatusBadge status={r.matchStatus} label={STATUS_LABEL[r.matchStatus] ?? r.matchStatus} /></TD>
                  <TD>
                    {r.matchedBillId ? (
                      <Link href={`/purchasing/bills/${r.matchedBillId}`} className="font-mono text-[12px] text-brand hover:underline">
                        {r.matchedBillNo ?? "view"}
                      </Link>
                    ) : "—"}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Panel>

      {report.missingIn2b.length > 0 && (
        <Panel title={`In books, not in 2B · ${fmtCount(report.missingIn2b.length)} bills`} flush>
          <div className="border-b border-line bg-amb-wash px-4 py-2 text-[12px] text-amb">
            Recorded GST bills with no matching 2B row — the ITC on these should be deferred until the supplier files.
          </div>
          <Table>
            <THead>
              <TR>
                <TH>Bill</TH>
                <TH>Vendor Bill</TH>
                <TH>Supplier</TH>
                <TH numeric>Taxable</TH>
                <TH numeric>ITC</TH>
              </TR>
            </THead>
            <TBody>
              {report.missingIn2b.map((b) => (
                <TR key={b.id}>
                  <TD className="p-0">
                    <Link href={`/purchasing/bills/${b.id}`} className="block px-3 py-2.5 font-mono text-[12px] font-semibold text-brand">{b.billNo}</Link>
                  </TD>
                  <TD className="font-mono text-[11px] text-ink-3">{b.supplierBillNo ?? "—"}</TD>
                  <TD>{b.supplierName ?? "—"}</TD>
                  <TD numeric><Money value={b.taxable} /></TD>
                  <TD numeric><Money value={b.tax} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Panel>
      )}

      <Card className="p-3.5">
        <p className="text-[11px] text-ink-4">
          Reconcile matches each portal row to a recorded supplier bill by GSTIN + vendor bill number, comparing taxable and tax (₹1 tolerance). Re-run any time after recording missing bills.
        </p>
      </Card>
    </PageContainer>
  );
}
