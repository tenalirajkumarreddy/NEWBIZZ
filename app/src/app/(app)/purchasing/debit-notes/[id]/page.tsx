import Link from "next/link";
import { notFound } from "next/navigation";
import { getDebitNote, type DebitNoteLine } from "@/lib/data/purchases";
import { Panel, Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/Badge";
import { Money } from "@/components/ui/Money";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { PageContainer, PageHeader } from "@/components/ui";
import { dateIST, qty as fmtQty, titleCase } from "@/lib/format";

// Debit-note detail (§5.5) — the purchase return. Header, returned lines at WA
// cost, and the value split (goods + reversed input GST). Payable already
// reduced via journal_entry_id.
export default async function DebitNoteDetailPage({ params }: { params: { id: string } }) {
  const dn = await getDebitNote(params.id);
  if (!dn) notFound();

  return (
    <PageContainer width="report">
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <span className="font-mono">{dn.debitNoteNo}</span>
            <StatusBadge status={dn.status} />
          </span>
        }
        subtitle={`${dateIST(dn.createdAt)} · ${dn.supplierName ?? "—"} · ${titleCase(dn.reason)}`}
        backHref="/purchasing/debit-notes"
        backLabel="Debit Notes"
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Fact label="Supplier" value={dn.supplierName ?? "—"} />
        <Fact label="Goods reversed" value={<Money value={dn.baseAmount} />} mono />
        <Fact label="Input GST reversed" value={<Money value={dn.taxAmount} />} mono />
        <Fact label="Debited to supplier" value={<Money value={dn.amount} />} mono />
      </div>

      <Panel title="Returned goods" flush>
        <Table>
          <THead>
            <TR>
              <TH className="w-10">#</TH>
              <TH>Item</TH>
              <TH numeric>Qty</TH>
              <TH numeric>Unit cost</TH>
              <TH numeric>Taxable</TH>
              <TH numeric>GST</TH>
            </TR>
          </THead>
          <TBody>
            {dn.lines.map((l) => <LineRow key={l.id} line={l} />)}
          </TBody>
        </Table>
      </Panel>

      {dn.narration && (
        <Card className="p-4">
          <div className="eyebrow text-ink-4">Narration</div>
          <p className="mt-1 text-[13px] text-ink-2">{dn.narration}</p>
        </Card>
      )}

      <p className="text-[11px] text-ink-4">This debit note reduced the supplier&rsquo;s payable and reversed inventory + input GST when posted.</p>
    </PageContainer>
  );
}

function LineRow({ line }: { line: DebitNoteLine }) {
  return (
    <TR>
      <TD className="text-ink-4">{line.line_no}</TD>
      <TD>
        <span className="font-medium text-ink">{line.itemName ?? "—"}</span>
        {line.sku && <span className="ml-1.5 font-mono text-[11px] text-ink-4">{line.sku}</span>}
      </TD>
      <TD numeric>{fmtQty(line.qty)}</TD>
      <TD numeric><Money value={line.unitCost} /></TD>
      <TD numeric><Money value={line.taxableAmount} /></TD>
      <TD numeric><Money value={line.taxAmount} /></TD>
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
