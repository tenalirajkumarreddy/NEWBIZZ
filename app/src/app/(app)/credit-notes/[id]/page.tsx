import Link from "next/link";
import { notFound } from "next/navigation";
import { getCreditNote, type CreditNoteReturnLine } from "@/lib/data/creditnotes";
import { Panel, Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/Badge";
import { Money } from "@/components/ui/Money";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { dateIST, qty as fmtQty } from "@/lib/format";
import { REASON_LABEL } from "../CreditNotesTable";

// Credit-note detail — the AR-reducing document. Header facts, the value split
// (base + reversed tax), the reference invoice, and — for a sales return — the
// per-line goods that came back. Money already posted via journal_entry_id;
// this view is read-only.
export default async function CreditNoteDetailPage({ params }: { params: { id: string } }) {
  const cn = await getCreditNote(params.id);
  if (!cn) notFound();

  const isReturn = cn.reason === "sales_adjustment";

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-4 px-6 py-6 lg:px-8">
      {/* Breadcrumb + header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/credit-notes" className="text-[12px] font-medium text-ink-4 hover:text-brand">
            ← Credit Notes
          </Link>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="font-mono text-[22px] font-bold tracking-tight text-ink">{cn.credit_note_no}</h1>
            <StatusBadge status={cn.status} />
            <StatusBadge status={cn.reason} label={REASON_LABEL[cn.reason]} dot={false} />
          </div>
          <p className="mt-0.5 text-[13px] text-ink-3">
            {dateIST(cn.createdAt)} · {cn.storeName ?? "—"}
            {cn.customerName ? ` · ${cn.customerName}` : ""}
          </p>
        </div>
        {cn.referenceSaleId && cn.referenceInvoiceNo && (
          <Link
            href={`/invoices/${cn.referenceSaleId}`}
            className="text-[12px] font-medium text-brand hover:underline"
          >
            Against {cn.referenceInvoiceNo} →
          </Link>
        )}
      </div>

      {/* Facts */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Fact label="Customer" value={cn.customerName ?? "—"} />
        <Fact label="Store" value={cn.storeName ?? "—"} />
        <Fact label="Taxable" value={<Money value={cn.baseAmount} />} mono />
        <Fact label="Credit total" value={<Money value={cn.amount} />} mono />
      </div>

      {/* Value split */}
      <div className="flex justify-end">
        <Card className="w-full max-w-sm p-4">
          <dl className="flex flex-col gap-1.5 text-[13px]">
            <Row label="Taxable value" value={cn.baseAmount} />
            {cn.taxAmount > 0 && <Row label="GST reversed" value={cn.taxAmount} />}
            <div className="mt-1 flex items-center justify-between border-t border-line pt-1.5">
              <dt className="font-semibold text-ink">Credit to customer</dt>
              <dd className="font-mono text-[18px] font-bold text-ink tnum">
                <Money value={cn.amount} />
              </dd>
            </div>
          </dl>
        </Card>
      </div>

      {/* Returned goods (sales returns only) */}
      {isReturn && cn.returnLines.length > 0 && (
        <Panel title="Returned goods" flush>
          <Table>
            <THead>
              <TR>
                <TH className="w-10">#</TH>
                <TH>Item</TH>
                <TH numeric>Qty returned</TH>
                <TH numeric>Unit cost</TH>
                <TH numeric>Taxable</TH>
                <TH numeric>GST</TH>
              </TR>
            </THead>
            <TBody>
              {cn.returnLines.map((l) => (
                <LineRow key={l.id} line={l} />
              ))}
            </TBody>
          </Table>
        </Panel>
      )}

      {cn.narration && (
        <Card className="p-4">
          <div className="eyebrow text-ink-4">Narration</div>
          <p className="mt-1 text-[13px] text-ink-2">{cn.narration}</p>
        </Card>
      )}

      <p className="text-[11px] text-ink-4">
        This credit note reduced the customer&rsquo;s outstanding when it was posted
        {isReturn ? " and restocked the returned goods at their original cost." : "."}
      </p>
    </div>
  );
}

function LineRow({ line }: { line: CreditNoteReturnLine }) {
  return (
    <TR>
      <TD className="text-ink-4">{line.line_no}</TD>
      <TD>
        <span className="font-medium text-ink">{line.itemName ?? "—"}</span>
        {line.sku && <span className="ml-1.5 font-mono text-[11px] text-ink-4">{line.sku}</span>}
      </TD>
      <TD numeric>{fmtQty(line.qty)}</TD>
      <TD numeric><Money value={line.unitCogs} /></TD>
      <TD numeric><Money value={line.taxableAmount} /></TD>
      <TD numeric><Money value={line.taxAmount} /></TD>
    </TR>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-ink-3">{label}</dt>
      <dd className="font-mono tnum text-ink"><Money value={value} /></dd>
    </div>
  );
}

function Fact({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <Card className="p-3.5">
      <div className="eyebrow text-ink-4">{label}</div>
      <div className={"mt-1 text-[15px] font-semibold text-ink " + (mono ? "font-mono tnum" : "")}>
        {value}
      </div>
    </Card>
  );
}
