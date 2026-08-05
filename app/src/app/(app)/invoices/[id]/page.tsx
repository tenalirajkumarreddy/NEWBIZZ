import Link from "next/link";
import { notFound } from "next/navigation";
import { getInvoice, type InvoiceLine } from "@/lib/data/sales";
import { getReturnedByLine } from "@/lib/data/creditnotes";
import { Panel, Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/Badge";
import { Money } from "@/components/ui/Money";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { dateIST, qty, percent } from "@/lib/format";
import { SalesReturnPanel } from "./SalesReturnPanel";
import { InvoiceCorrectionPanel } from "./InvoiceCorrectionPanel";
import { DocumentAttachPanel } from "@/components/documents/DocumentAttachPanel";

// Invoice detail — the value document. Header facts, GST-broken-out lines, and
// the tax summary (CGST/SGST or IGST by place of supply, plus round-off). Money
// and stock already posted when the invoice was raised; corrections are made
// via a sales return (§4.5), which issues a credit note — the invoice itself
// stays immutable.
export default async function InvoiceDetailPage({ params }: { params: { id: string } }) {
  const inv = await getInvoice(params.id);
  if (!inv) notFound();

  const taxTotal = inv.cgstAmount + inv.sgstAmount + inv.igstAmount + inv.cessAmount;
  const totalCogs = inv.lines.reduce((s, l) => s + l.unitCogs * l.qty, 0);
  // A non-void invoice can be returned; fetch prior returns to show remainders.
  const returnedByLine = inv.status !== "void" ? await getReturnedByLine(inv.id) : {};

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-4 px-6 py-6 lg:px-8">
      {/* Breadcrumb + header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/invoices" className="text-[12px] font-medium text-ink-4 hover:text-brand">
            ← Invoicing
          </Link>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="font-mono text-[22px] font-bold tracking-tight text-ink">{inv.invoice_no}</h1>
            <StatusBadge status={inv.status} />
          </div>
          <p className="mt-0.5 text-[13px] text-ink-3">
            {dateIST(inv.invoice_date)} · {inv.storeName ?? "—"}
            {inv.customerName ? ` · ${inv.customerName}` : ""}
            {!inv.isOfficial && <span> · <span className="text-amb">Cash memo (no GST)</span></span>}
          </p>
        </div>
        {inv.orderId && inv.orderNo && (
          <Link
            href={`/orders/${inv.orderId}`}
            className="text-[12px] font-medium text-brand hover:underline"
          >
            From order {inv.orderNo} →
          </Link>
        )}
      </div>

      {/* Facts */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Fact label="Store" value={inv.storeName ?? "—"} sub={inv.storeCode ?? undefined} />
        <Fact label="Customer" value={inv.customerName ?? "—"} sub={inv.customerGstin ?? undefined} />
        <Fact
          label="Place of supply"
          value={`State ${inv.placeOfSupply}`}
          sub={inv.isOfficial ? (inv.isInterstate ? "Inter-state" : "Intra-state") : "Cash memo"}
          mono
        />
        <Fact label="Grand total" value={<Money value={inv.grandTotal} />} mono />
      </div>

      {/* Lines */}
      <Panel title="Invoice lines" flush>
        <Table>
          <THead>
            <TR>
              <TH className="w-10">#</TH>
              <TH>Item</TH>
              <TH numeric>Qty</TH>
              <TH numeric>Rate</TH>
              <TH numeric>{inv.isOfficial ? "Taxable" : "Amount"}</TH>
              {inv.isOfficial && <TH numeric>GST%</TH>}
              {inv.isOfficial && inv.isInterstate && <TH numeric>IGST</TH>}
              {inv.isOfficial && !inv.isInterstate && <TH numeric>CGST</TH>}
              {inv.isOfficial && !inv.isInterstate && <TH numeric>SGST</TH>}
              <TH numeric>Line Total</TH>
            </TR>
          </THead>
          <TBody>
            {inv.lines.map((l) => (
              <LineRow key={l.id} line={l} interstate={inv.isInterstate} isOfficial={inv.isOfficial} />
            ))}
          </TBody>
        </Table>
      </Panel>

      {/* Tax summary */}
      <div className="flex justify-end">
        <Card className="w-full max-w-sm p-4">
          <dl className="flex flex-col gap-1.5 text-[13px]">
            {inv.isOfficial && <Row label="Taxable value" value={inv.taxableAmount} />}
            {inv.isOfficial && !inv.isInterstate && inv.cgstAmount > 0 && <Row label="CGST" value={inv.cgstAmount} />}
            {inv.isOfficial && !inv.isInterstate && inv.sgstAmount > 0 && <Row label="SGST" value={inv.sgstAmount} />}
            {inv.isOfficial && inv.isInterstate && inv.igstAmount > 0 && <Row label="IGST" value={inv.igstAmount} />}
            {inv.isOfficial && inv.cessAmount > 0 && <Row label="Cess" value={inv.cessAmount} />}
            {inv.isOfficial && Math.abs(inv.roundOff) >= 0.005 && (
              <Row label="Round-off" value={inv.roundOff} muted />
            )}
            <div className="mt-1 flex items-center justify-between border-t border-line pt-1.5">
              <dt className="font-semibold text-ink">Grand total</dt>
              <dd className="font-mono text-[18px] font-bold text-ink tnum">
                <Money value={inv.grandTotal} />
              </dd>
            </div>
            {inv.status !== "void" && totalCogs > 0 && (
              <div className="flex items-center justify-between pt-0.5">
                <dt className="text-ink-4">COGS</dt>
                <dd className="font-mono text-ink-3 tnum"><Money value={totalCogs} /></dd>
              </div>
            )}
            {inv.amountPaid > 0 && (
              <div className="flex items-center justify-between pt-0.5">
                <dt className="text-ink-3">Paid</dt>
                <dd className="font-mono text-grn tnum"><Money value={inv.amountPaid} /></dd>
              </div>
            )}
            {inv.grandTotal - inv.amountPaid > 0.005 && (
              <div className="flex items-center justify-between">
                <dt className="text-ink-3">Balance due</dt>
                <dd className="font-mono text-ink tnum">
                  <Money value={inv.grandTotal - inv.amountPaid} />
                </dd>
              </div>
            )}
          </dl>
        </Card>
      </div>

      {inv.status !== "void" && (
        <SalesReturnPanel
          invoiceId={inv.id}
          invoiceNo={inv.invoice_no}
          lines={inv.lines}
          returnedByLine={returnedByLine}
          interstate={inv.isInterstate}
        />
      )}

      {inv.status !== "void" && (
        <InvoiceCorrectionPanel
          invoiceId={inv.id}
          invoiceNo={inv.invoice_no}
          isOfficial={inv.isOfficial}
          amountPaid={inv.amountPaid}
        />
      )}

      <DocumentAttachPanel entityType="invoice" entityId={inv.id} entityLabel={inv.invoice_no} />

      <p className="text-[11px] text-ink-4">
        {inv.isOfficial
          ? <>Tax total {taxTotal > 0 ? <Money value={taxTotal} /> : "nil"} · </>
          : "Cash memo (no tax) · "}
        Money and stock were posted to the ledger when this invoice was raised.
      </p>
    </div>
  );
}

function LineRow({ line, interstate, isOfficial }: { line: InvoiceLine; interstate: boolean; isOfficial: boolean }) {
  return (
    <TR>
      <TD className="text-ink-4">{line.line_no}</TD>
      <TD>
        <span className="font-medium text-ink">{line.itemName ?? "—"}</span>
        {line.sku && <span className="ml-1.5 font-mono text-[11px] text-ink-4">{line.sku}</span>}
      </TD>
      <TD numeric>{qty(line.qty)}</TD>
      <TD numeric><Money value={line.unit_price} /></TD>
      <TD numeric><Money value={line.taxable_amount} /></TD>
      {isOfficial && <TD numeric>{percent(line.gst_rate, { alreadyPct: true, decimals: 0 })}</TD>}
      {isOfficial && interstate && <TD numeric><Money value={line.igst_amount} /></TD>}
      {isOfficial && !interstate && <TD numeric><Money value={line.cgst_amount} /></TD>}
      {isOfficial && !interstate && <TD numeric><Money value={line.sgst_amount} /></TD>}
      <TD numeric><Money value={line.line_total} /></TD>
    </TR>
  );
}

function Row({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className={muted ? "text-ink-4" : "text-ink-3"}>{label}</dt>
      <dd className={"font-mono tnum " + (muted ? "text-ink-3" : "text-ink")}>
        <Money value={value} />
      </dd>
    </div>
  );
}

function Fact({
  label,
  value,
  sub,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  mono?: boolean;
}) {
  return (
    <Card className="p-3.5">
      <div className="eyebrow text-ink-4">{label}</div>
      <div className={"mt-1 text-[15px] font-semibold text-ink " + (mono ? "font-mono tnum" : "")}>
        {value}
      </div>
      {sub && <div className="mt-0.5 font-mono text-[11px] text-ink-4">{sub}</div>}
    </Card>
  );
}
