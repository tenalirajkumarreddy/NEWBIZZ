import Link from "next/link";
import { notFound } from "next/navigation";
import { getPurchaseOrder, type PoLine } from "@/lib/data/purchases";
import { Panel, Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/Badge";
import { Money } from "@/components/ui/Money";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { PageContainer, PageHeader } from "@/components/ui";
import { dateIST, qty as fmtQty, percent } from "@/lib/format";
import { PoReceiveAction } from "./PoReceiveAction";

// Purchase-order detail (§5.4). Header facts + lines. A draft/confirmed PO can
// be received in full (post_grn_from_po), which books stock at cost and marks
// the PO received. Partial receipts use the standalone GRN form.
export default async function PoDetailPage({ params }: { params: { id: string } }) {
  const po = await getPurchaseOrder(params.id);
  if (!po) notFound();

  const canReceive = po.status === "draft" || po.status === "confirmed";

  return (
    <PageContainer width="report">
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <span className="font-mono">{po.poNo}</span>
            <StatusBadge status={po.status} />
          </span>
        }
        subtitle={`${dateIST(po.poDate)} · ${po.supplierName ?? "—"}${po.expectedDate ? ` · expected ${dateIST(po.expectedDate)}` : ""}`}
        backHref="/purchasing/po"
        backLabel="Purchase Orders"
        actions={canReceive && <PoReceiveAction poId={po.id} poNo={po.poNo} />}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Fact label="Supplier" value={po.supplierName ?? "—"} />
        <Fact label="Lines" value={String(po.lines.length)} />
        <Fact label="Expected" value={po.expectedDate ? dateIST(po.expectedDate) : "—"} />
        <Fact label="Value (ex-GST)" value={<Money value={po.netValue} />} mono />
      </div>

      <Panel title="Order lines" flush>
        <Table>
          <THead>
            <TR>
              <TH className="w-10">#</TH>
              <TH>Item</TH>
              <TH numeric>Qty</TH>
              <TH numeric>Rate</TH>
              <TH numeric>GST</TH>
              <TH numeric>Amount</TH>
            </TR>
          </THead>
          <TBody>
            {po.lines.map((l) => <LineRow key={l.id} line={l} />)}
          </TBody>
        </Table>
      </Panel>

      {po.notes && (
        <Card className="p-4">
          <div className="eyebrow text-ink-4">Notes</div>
          <p className="mt-1 text-[13px] text-ink-2">{po.notes}</p>
        </Card>
      )}
    </PageContainer>
  );
}

function LineRow({ line }: { line: PoLine }) {
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
      <TD numeric><Money value={line.qty * line.unitCost} /></TD>
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
