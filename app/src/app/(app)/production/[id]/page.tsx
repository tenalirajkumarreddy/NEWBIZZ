import Link from "next/link";
import { notFound } from "next/navigation";
import { getRun } from "@/lib/data/production";
import { Panel, Card, SectionHeading } from "@/components/ui/Card";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { money } from "@/lib/format";
import { ReverseRunDialog } from "./ReverseRunDialog";
import { DocumentAttachPanel } from "@/components/documents/DocumentAttachPanel";

export const metadata = { title: "Production Run — NEWBIZZ" };

const STAGE_LABELS: Record<number, string> = {
  1: "Blowing (raw → WIP)",
  2: "Filling (WIP → FG)",
};

export default async function RunDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const run = await getRun(id);
  if (!run) notFound();

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-4 px-6 py-6 lg:px-8">
      <div>
        <Link href="/production" className="text-[12px] font-medium text-ink-4 hover:text-brand">
          ← Production Runs
        </Link>
        <h1 className="mt-1 text-[22px] font-bold tracking-tight text-ink">
          {run.runNo}
        </h1>
        <p className="mt-0.5 flex items-center gap-2 text-[13px] text-ink-3">
          {run.runDate} ·{" "}
          <Badge tone={run.stage === 1 ? "brand" : "grn"} size="sm">
            Stage {run.stage} {STAGE_LABELS[run.stage]}
          </Badge>
          {" "}· <StatusBadge status={run.status} size="sm" />
        </p>
      </div>

      {run.status === "posted" && (
        <Card className="flex items-center justify-between gap-3 p-4">
          <p className="text-[12px] leading-relaxed text-ink-4">
            This run is <strong>posted</strong> and its stock + journal are live. Reverse it to
            restore inputs and remove the output with a compensating journal entry.
          </p>
          <ReverseRunDialog runId={run.id} runNo={run.runNo} />
        </Card>
      )}

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card className="p-4">
          <SectionHeading className="mb-1">Output Item</SectionHeading>
          <p className="text-[13px] font-semibold text-ink">
            <span className="font-mono">{run.outputSku}</span> — {run.outputName}
          </p>
        </Card>
        <Card className="p-4">
          <SectionHeading className="mb-1">Output Quantity</SectionHeading>
          <p className="text-[13px] font-semibold text-ink tabular-nums">{run.outputQty}</p>
        </Card>
        <Card className="p-4">
          <SectionHeading className="mb-1">Unit Cost</SectionHeading>
          <p className="text-[13px] font-semibold text-ink">{money(run.outputUnitCost)}</p>
        </Card>
        <Card className="p-4">
          <SectionHeading className="mb-1">Input Value</SectionHeading>
          <p className="text-[13px] font-semibold text-ink">{money(run.inputValue)}</p>
        </Card>
      </div>

      {run.abnormalWastage > 0 && (
        <Card className="flex items-center gap-4 p-4">
          <SectionHeading className="mb-1">Abnormal Wastage</SectionHeading>
          <p className="text-[13px] font-semibold text-red">{money(run.abnormalWastage)}</p>
        </Card>
      )}

      {/* Inputs table */}
      <Panel title={`Consumed inputs (${run.inputs.length})`} flush>
        <Table>
          <THead>
            <TR>
              <TH>#</TH>
              <TH>Item</TH>
              <TH numeric>Qty</TH>
              <TH numeric>Unit Cost</TH>
              <TH numeric>Value</TH>
            </TR>
          </THead>
          <TBody>
            {run.inputs.map((line) => (
              <TR key={line.id}>
                <TD className="text-[11px] text-ink-4">{line.lineNo}</TD>
                <TD>
                  <Link
                    href={`/items/${line.itemId}`}
                    className="font-medium text-brand hover:underline"
                  >
                    <span className="font-mono text-[12px]">{line.itemSku}</span>{" "}
                    <span className="text-ink">{line.itemName}</span>
                  </Link>
                </TD>
                <TD numeric className="font-mono tnum">{line.qty}</TD>
                <TD numeric className="font-mono tnum">{money(line.unitCost)}</TD>
                <TD numeric className="font-mono tnum">{money(line.value)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Panel>

      {run.notes && (
        <Panel title="Notes">
          <p className="text-[13px] leading-relaxed text-ink-2 whitespace-pre-wrap">{run.notes}</p>
        </Panel>
      )}

      <Card className="p-4">
        <div className="flex items-center gap-6 text-[12px] text-ink-4">
          <span>Created by: <strong className="text-ink">{run.createdBy}</strong></span>
          <span>{new Date(run.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</span>
        </div>
      </Card>

      <DocumentAttachPanel entityType="production_run" entityId={run.id} entityLabel={run.runNo} />
    </div>
  );
}
