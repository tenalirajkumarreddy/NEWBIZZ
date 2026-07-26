import Link from "next/link";
import { notFound } from "next/navigation";
import { getCostingRun } from "@/lib/data/costing";
import { Panel, Card, SectionHeading } from "@/components/ui/Card";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { money } from "@/lib/format";

export const metadata = { title: "Costing Run — NEWBIZZ" };

export default async function CostingRunDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const run = await getCostingRun(id);
  if (!run) notFound();

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-4 px-6 py-6 lg:px-8">
      <div>
        <Link href="/costing" className="text-[12px] font-medium text-ink-4 hover:text-brand">
          ← Process Costing
        </Link>
        <h1 className="mt-1 text-[22px] font-bold tracking-tight text-ink">
          Costing — {run.periodMonth} Stage {run.stage}
        </h1>
        <p className="mt-0.5 flex items-center gap-2 text-[13px] text-ink-3">
          <StatusBadge status={run.status} size="sm" />
          <span>·</span>
          <span>{run.unitsCompleted} units completed</span>
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <SectionHeading className="mb-1">COGM / unit</SectionHeading>
          <p className="text-[15px] font-bold text-ink">{money(run.cogmPerUnit)}</p>
        </Card>
        <Card className="p-4">
          <SectionHeading className="mb-1">Material / EU</SectionHeading>
          <p className="text-[13px] font-semibold text-ink">{money(run.costMatPerEu)}</p>
        </Card>
        <Card className="p-4">
          <SectionHeading className="mb-1">Conversion / EU</SectionHeading>
          <p className="text-[13px] font-semibold text-ink">{money(run.costConvPerEu)}</p>
        </Card>
      </div>

      {run.transferredInPerUnit != null && (
        <Card className="p-4">
          <SectionHeading className="mb-1">Transferred-in / unit (Stage 1 → Stage 2)</SectionHeading>
          <p className="text-[13px] font-semibold text-ink">{money(run.transferredInPerUnit)}</p>
        </Card>
      )}

      {/* Per-item breakdown */}
      <Panel title={`Per-item breakdown (${run.lines.length} items)`} flush>
        <Table>
          <THead>
            <TR>
              <TH>Item</TH>
              <TH numeric>Units</TH>
              <TH numeric>Materials</TH>
              <TH numeric>Conversion</TH>
              <TH numeric>Transferred-in</TH>
              <TH numeric>COGM total</TH>
              <TH numeric>COGM / unit</TH>
            </TR>
          </THead>
          <TBody>
            {run.lines.map((line) => (
              <TR key={line.id}>
                <TD>
                  <Link
                    href={`/items/${line.itemId}`}
                    className="font-medium text-brand hover:underline"
                  >
                    <span className="font-mono text-[12px]">{line.itemSku}</span>{" "}
                    <span className="text-ink">{line.itemName}</span>
                  </Link>
                </TD>
                <TD numeric className="font-mono tnum">{line.units}</TD>
                <TD numeric className="font-mono tnum">{money(line.costMat)}</TD>
                <TD numeric className="font-mono tnum">{money(line.costConv)}</TD>
                <TD numeric className="font-mono tnum">{money(line.transferredIn)}</TD>
                <TD numeric className="font-mono tnum font-semibold">{money(line.cogmTotal)}</TD>
                <TD numeric className="font-mono tnum">{money(line.cogmPerUnit)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Panel>

      <Card className="p-4">
        <div className="flex items-center gap-6 text-[12px] text-ink-4">
          <span>Computed by: <strong className="text-ink">{run.computedBy}</strong></span>
          <span>{new Date(run.computedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</span>
        </div>
      </Card>
    </div>
  );
}
