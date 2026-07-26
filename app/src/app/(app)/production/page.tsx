import Link from "next/link";
import { listRuns } from "@/lib/data/production";
import { Panel } from "@/components/ui/Card";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { count as fmtCount, money } from "@/lib/format";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";

export const metadata = { title: "Production Runs — NEWBIZZ" };

export default async function ProductionListPage() {
  const runs = await listRuns();

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-6 py-6 lg:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-ink">Production Runs</h1>
          <p className="mt-0.5 text-[13px] text-ink-3">
            {fmtCount(runs.length)} runs — atomic EOD events consuming inputs and producing output
          </p>
        </div>
        <Link href="/production/new">
          <Button size="sm">New Run</Button>
        </Link>
      </div>

      <Panel title="All production runs" flush>
        {runs.length === 0 ? (
          <EmptyState
            title="No production runs yet"
            description="Post an end-of-day run to record manufactured output and consumed inputs."
            action={
              <Link href="/production/new">
                <Button variant="secondary" size="sm">Post a run</Button>
              </Link>
            }
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Run #</TH>
                <TH>Date</TH>
                <TH>Stage</TH>
                <TH>Output Item</TH>
                <TH numeric>Qty</TH>
                <TH numeric>Input Value</TH>
                <TH numeric>Unit Cost</TH>
                <TH>Status</TH>
                <TH className="w-[80px]" />
              </TR>
            </THead>
            <TBody>
              {runs.map((r) => (
                <TR key={r.id}>
                  <TD className="font-mono text-[12px] font-semibold text-brand">{r.runNo}</TD>
                  <TD className="font-mono text-[12px] text-ink-3">{r.runDate}</TD>
                  <TD>
                    <Badge
                      tone={r.stage === 1 ? "brand" : "grn"}
                      size="sm"
                    >
                      Stage {r.stage} {r.stage === 1 ? "Blowing" : "Filling"}
                    </Badge>
                  </TD>
                  <TD>
                    <span className="font-mono text-[12px] font-semibold text-ink">{r.outputSku}</span>{" "}
                    <span className="text-ink">{r.outputName}</span>
                  </TD>
                  <TD numeric className="font-mono tnum">{r.outputQty}</TD>
                  <TD numeric className="font-mono tnum">{money(r.inputValue)}</TD>
                  <TD numeric className="font-mono tnum">{money(r.outputUnitCost)}</TD>
                  <TD><StatusBadge status={r.status} size="sm" /></TD>
                  <TD>
                    <Link href={`/production/${r.id}`}>
                      <Button variant="ghost" size="sm">View</Button>
                    </Link>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Panel>
    </div>
  );
}
