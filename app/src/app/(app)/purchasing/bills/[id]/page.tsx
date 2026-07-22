import Link from "next/link";
import { notFound } from "next/navigation";
import { getBill, type BillLine } from "@/lib/data/purchases";
import { Panel, Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Money } from "@/components/ui/Money";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { dateIST, qty as fmtQty, percent } from "@/lib/format";

// Supplier-bill detail (§5.4). Header, GST-broken-out lines, and the tax
// summary. Money/stock already posted when the bill was booked; an open bill
// links to the payment form (pre-filled by supplier).
export default async function BillDetailPage({ params }: { params: { id: string } }) {
  const bill = await getBill(params.id);
  if (!bill) notFound();

  const due = bill.grandTotal - bill.amountPaid;
  const open = bill.status === "posted" || bill.status === "part_paid";

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-4 px-6 py-6 lg:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/purchasing/bills" className="text-[12px] font-medium text-ink-4 hover:text-brand">← Supplier Bills</Link>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="font-mono text-[22px] font-bold tracking-tight text-ink">{bill.billNo}</h1>
            <StatusBadge status={bill.status} />
          </div>
          <p className="mt-0.5 text-[13px] text-ink-3">
            {dateIST(bill.billDate)} · {bill.supplierName ?? "—"}
            {bill.supplierBillNo ? ` · vendor ${bill.supplierBillNo}` : ""}
          </p>
        </div>
        {open && (
          <Link href={`/purchasing/pay/new?supplier=${bill.supplierId}`}>
            <Button variant="primary" size="sm">Pay supplier</Button>
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Fact label="Supplier" value={bill.supplierName ?? "—"} />
        <Fact label="Place of supply" value={bill.isInterstate ? "Inter-state" : "Intra-state"} />
        <Fact label="Grand total" value={<Money value={bill.grandTotal} />} mono />
        <Fact label="Balance due" value={<Money value={due} />} mono tone={due > 0.005 ? "amb" : "grn"} />
      </div>

      <Panel title="Bill lines" flush>
        <Table>
          <THead>
            <TR>
              <TH className="w-10">#</TH>
              <TH>Item / expense</TH>
              <TH numeric>Qty</TH>
              <TH numeric>Rate</TH>
              <TH numeric>Taxable</TH>
              <TH numeric>GST%</TH>
              {bill.isInterstate ? <TH numeric>IGST</TH> : (<><TH numeric>CGST</TH><TH numeric>SGST</TH></>)}
              <TH numeric>Line total</TH>
            </TR>
          </THead>
          <TBody>
            {bill.lines.map((l) => <LineRow key={l.id} line={l} interstate={bill.isInterstate} />)}
          </TBody>
        </Table>
      </Panel>

      <div className="flex justify-end">
        <Card className="w-full max-w-sm p-4">
          <dl className="flex flex-col gap-1.5 text-[13px]">
            <Row label="Taxable value" value={bill.taxableAmount} />
            {!bill.isInterstate && bill.cgstAmount > 0 && <Row label="Input CGST" value={bill.cgstAmount} />}
            {!bill.isInterstate && bill.sgstAmount > 0 && <Row label="Input SGST" value={bill.sgstAmount} />}
            {bill.isInterstate && bill.igstAmount > 0 && <Row label="Input IGST" value={bill.igstAmount} />}
            {bill.cessAmount > 0 && <Row label="Cess" value={bill.cessAmount} />}
            {Math.abs(bill.roundOff) >= 0.005 && <Row label="Round-off" value={bill.roundOff} muted />}
            <div className="mt-1 flex items-center justify-between border-t border-line pt-1.5">
              <dt className="font-semibold text-ink">Grand total</dt>
              <dd className="font-mono text-[18px] font-bold text-ink tnum"><Money value={bill.grandTotal} /></dd>
            </div>
            {bill.amountPaid > 0 && (
              <div className="flex items-center justify-between pt-0.5">
                <dt className="text-ink-3">Paid</dt>
                <dd className="font-mono text-grn tnum"><Money value={bill.amountPaid} /></dd>
              </div>
            )}
          </dl>
        </Card>
      </div>

      <p className="text-[11px] text-ink-4">Input GST and the payable were posted when this bill was booked.</p>
    </div>
  );
}

function LineRow({ line, interstate }: { line: BillLine; interstate: boolean }) {
  return (
    <TR>
      <TD className="text-ink-4">{line.line_no}</TD>
      <TD>
        <span className="font-medium text-ink">{line.itemName ?? line.description ?? line.expenseAccount ?? "—"}</span>
        {line.sku && <span className="ml-1.5 font-mono text-[11px] text-ink-4">{line.sku}</span>}
        {!line.itemId && line.expenseAccount && <span className="ml-1.5 font-mono text-[10px] text-ink-4">A/c {line.expenseAccount}</span>}
      </TD>
      <TD numeric>{fmtQty(line.qty)}</TD>
      <TD numeric><Money value={line.unitCost} /></TD>
      <TD numeric><Money value={line.taxableAmount} /></TD>
      <TD numeric>{percent(line.gstRate, { alreadyPct: true, decimals: 0 })}</TD>
      {interstate ? (
        <TD numeric><Money value={line.igstAmount} /></TD>
      ) : (
        <><TD numeric><Money value={line.cgstAmount} /></TD><TD numeric><Money value={line.sgstAmount} /></TD></>
      )}
      <TD numeric><Money value={line.lineTotal} /></TD>
    </TR>
  );
}

function Row({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className={muted ? "text-ink-4" : "text-ink-3"}>{label}</dt>
      <dd className={"font-mono tnum " + (muted ? "text-ink-3" : "text-ink")}><Money value={value} /></dd>
    </div>
  );
}

function Fact({ label, value, mono, tone }: { label: string; value: React.ReactNode; mono?: boolean; tone?: "amb" | "grn" }) {
  const toneClass = tone === "amb" ? "text-amb" : tone === "grn" ? "text-grn" : "text-ink";
  return (
    <Card className="p-3.5">
      <div className="eyebrow text-ink-4">{label}</div>
      <div className={"mt-1 text-[15px] font-semibold " + toneClass + (mono ? " font-mono tnum" : "")}>{value}</div>
    </Card>
  );
}
