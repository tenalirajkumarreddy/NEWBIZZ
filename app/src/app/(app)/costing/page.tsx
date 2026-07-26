import Link from "next/link";
import { listCostingRuns, listOverheadPools, listCostSnapshots } from "@/lib/data/costing";
import { Panel, Card } from "@/components/ui/Card";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { count as fmtCount, money } from "@/lib/format";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { CostingActions } from "./CostingActions";
import { OverheadPoolSection } from "./OverheadPoolSection";

export const metadata = { title: "Process Costing — NEWBIZZ" };

export default async function CostingDashboardPage() {
  const [runs, pools, snapshots] = await Promise.all([
    listCostingRuns(),
    listOverheadPools(),
    listCostSnapshots(),
  ]);

  const months = [...new Set(runs.map((r) => r.periodMonth))].sort().reverse();
  const snapshotMonths = [...new Set(snapshots.map((s) => s.periodMonth))].sort().reverse();

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-6 py-6 lg:px-8">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight text-ink">Process Costing</h1>
        <p className="mt-0.5 text-[13px] text-ink-3">
          Weighted-average cost to make (COGM) per product per month — {fmtCount(runs.length)} runs
        </p>
      </div>

      {/* Costing runs */}
      <Panel
        title="Costing Runs"
        actions={<CostingActions initialMonth={months[0] ?? ""} />}
        flush
      >
        {runs.length === 0 ? (
          <EmptyState
            title="No costing runs yet"
            description="Run process costing for a month and stage to compute COGM."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Period</TH>
                <TH>Stage</TH>
                <TH>Status</TH>
                <TH numeric>Units</TH>
                <TH numeric>Mat/unit</TH>
                <TH numeric>Conv/unit</TH>
                <TH numeric>TI/unit</TH>
                <TH numeric>COGM/unit</TH>
                <TH className="w-[180px]" />
              </TR>
            </THead>
            <TBody>
              {runs.map((r) => (
                <TR key={r.id}>
                  <TD className="font-mono text-[12px] font-semibold text-ink">{r.periodMonth}</TD>
                  <TD><Badge tone={r.stage === 1 ? "brand" : "grn"} size="sm">Stage {r.stage}</Badge></TD>
                  <TD><StatusBadge status={r.status} size="sm" /></TD>
                  <TD numeric className="font-mono tnum">{r.unitsCompleted}</TD>
                  <TD numeric className="font-mono tnum">{money(r.costMatPerEu)}</TD>
                  <TD numeric className="font-mono tnum">{money(r.costConvPerEu)}</TD>
                  <TD numeric className="font-mono tnum">
                    {r.transferredInPerUnit != null ? money(r.transferredInPerUnit) : "—"}
                  </TD>
                  <TD numeric className="font-mono tnum font-semibold text-ink">{money(r.cogmPerUnit)}</TD>
                  <TD>
                    <div className="flex items-center gap-1">
                      <Link href={`/costing/runs/${r.id}`}>
                        <Button variant="ghost" size="sm">View</Button>
                      </Link>
                      <CostingActions
                        initialMonth={r.periodMonth}
                        stage={r.stage}
                        compact
                      />
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Panel>

      {/* Product cost snapshots */}
      {snapshots.length > 0 && (
        <Panel title="Product Cost Snapshots" flush>
          <Table>
            <THead>
              <TR>
                <TH>Item</TH>
                <TH>Period</TH>
                <TH numeric>COGM / case</TH>
                <TH numeric>Loaded / case</TH>
              </TR>
            </THead>
            <TBody>
              {snapshots.map((s) => (
                <TR key={`${s.itemId}-${s.periodMonth}`}>
                  <TD>
                    <Link href={`/items/${s.itemId}`} className="font-medium text-brand hover:underline">
                      <span className="font-mono text-[12px]">{s.itemSku}</span>{" "}
                      <span className="text-ink">{s.itemName}</span>
                    </Link>
                  </TD>
                  <TD className="font-mono text-[12px] text-ink-3">{s.periodMonth}</TD>
                  <TD numeric className="font-mono tnum font-semibold">{money(s.cogmPerCase)}</TD>
                  <TD numeric className="font-mono tnum text-ink">{money(s.loadedPerCase)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Panel>
      )}

      {/* Overhead pools */}
      <OverheadPoolSection pools={pools} />
    </div>
  );
}
