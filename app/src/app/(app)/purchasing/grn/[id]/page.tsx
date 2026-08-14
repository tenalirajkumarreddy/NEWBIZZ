import Link from "next/link";
import { notFound } from "next/navigation";
import { getGrn, type GrnLine } from "@/lib/data/purchases";
import { Panel, Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/Badge";
import { Money } from "@/components/ui/Money";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { PageContainer, PageHeader } from "@/components/ui";
import { dateIST, qty as fmtQty, percent } from "@/lib/format";
import { GrnBillAction } from "./GrnBillAction";

// GRN detail (§5.4). Header + received lines. A received-but-unbilled GRN can be
// billed in one step (post_bill_from_grn): the vendor's bill no. is captured,
// GST + payable booked, and the 2115 clearing cleared.
export default async function GrnDetailPage({ params }: { params: { id: string } }) {
  const grn = await getGrn(params.id);
  if (!grn) notFound();

  const canBill = grn.status === "received" && !grn.billedBillId;

  return (
    <PageContainer width="report">
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <span className="font-mono">{grn.grnNo}</span>
            <StatusBadge status={grn.status} />
          </span>
        }
        subtitle={`${dateIST(grn.grnDate)} · ${grn.supplierName ?? "—"}${grn.poNo ? ` · from PO ${grn.poNo}` : ""}`}
        backHref="/purchasing/grn"
        backLabel="Goods Receipts"
        actions={
          canBill ? (
            <GrnBillAction grnId={grn.id} grnNo={grn.grnNo} />
          ) : grn.billedBillId ? (
            <Link href={`/purchasing/bills/${grn.billedBillId}`} className="text-[12px] font-medium text-brand hover:underline">View bill →</Link>
          ) : null
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Fact label="Supplier" value={grn.supplierName ?? "—"} />
        <Fact label="Supplier DC" value={grn.supplierDcNo ?? "—"} />
        <Fact label="Lines" value={String(grn.lines.length)} />
        <Fact label="Goods value" value={<Money value={grn.goodsValue} />} mono />
      </div>

      <Panel title="Received lines" flush>
        <Table>
          <THead>
            <TR>
              <TH className="w-10">#</TH>
              <TH>Item</TH>
              <TH numeric>Qty</TH>
              <TH numeric>Unit cost</TH>
              <TH numeric>GST</TH>
              <TH numeric>Value</TH>
            </TR>
          </THead>
          <TBody>
            {grn.lines.map((l) => <LineRow key={l.id} line={l} />)}
          </TBody>
        </Table>
      </Panel>

      {grn.notes && (
        <Card className="p-4">
          <div className="eyebrow text-ink-4">Notes</div>
          <p className="mt-1 text-[13px] text-ink-2">{grn.notes}</p>
        </Card>
      )}

      <p className="text-[11px] text-ink-4">Stock rose at these costs when the GRN posted. Billing books input GST and the payable.</p>
    </PageContainer>
  );
}

function LineRow({ line }: { line: GrnLine }) {
  return (
    <TR>
      <TD className="text-ink-4">{line.line_no}</TD>
      <TD>
        <span className="font-medium text-ink">{line.itemName ?? "—"}</span>
        {line.sku && <span className="ml-1.5 font-mono text-[11px] text-ink-4">{line.sku}</span>}
      </TD>
      <TD numeric>{fmtQty(line.qty)}</TD>
      <TD numeric><Money value={line.unitCost} /></TD>
      <TD numeric>{percent(line.gstRate, { alreadyPct: true, decimals: 0 })}</TD>
      <TD numeric><Money value={line.lineValue} /></TD>
    </TR>
  );
}

function Fact({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <Card className="p-3.5">
      <div className="eyebrow text-ink-4">{label}</div>
      <div className={"mt-1 text-[15px] font-semibold text-ink " + (mono ? "font-mono tnum" : "")}>{value}</div>
    </Card>
  );
}
