import Link from "next/link";
import { listDepreciationRuns } from "@/lib/data/assets";
import { Panel } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Money } from "@/components/ui/Money";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { PageContainer, PageHeader } from "@/components/ui";
import { dateIST, count as fmtCount } from "@/lib/format";

// Depreciation runs (§5.7) — one row per posted period run, linked to its
// journal. Charges are booked at the run; this is the audit trail.
export default async function DepreciationRunsPage() {
  const runs = await listDepreciationRuns({ limit: 200 });
  const total = runs.reduce((s, r) => s + r.totalAmount, 0);

  return (
    <PageContainer width="report">
      <PageHeader
        backHref="/assets"
        backLabel="Fixed Assets"
        title="Depreciation Runs"
        subtitle={
          <>
            {fmtCount(runs.length)} runs · <span className="font-mono"><Money value={total} /></span> depreciated
          </>
        }
      />

      <Panel flush>
        {runs.length === 0 ? (
          <EmptyState
            title="No depreciation runs yet"
            description="Run depreciation from the Fixed Assets page to charge every active asset for a period. Each run posts a journal and appears here."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Run No</TH>
                <TH>Date</TH>
                <TH>Period</TH>
                <TH numeric>Assets</TH>
                <TH numeric>Amount</TH>
                <TH>Entry</TH>
              </TR>
            </THead>
            <TBody>
              {runs.map((r) => (
                <TR key={r.id}>
                  <TD className="font-mono text-[12px] font-semibold text-ink">{r.runNo}</TD>
                  <TD>{dateIST(r.runDate)}</TD>
                  <TD className="text-[12px] text-ink-3">{r.periodLabel ?? "—"}</TD>
                  <TD numeric>{fmtCount(r.lineCount)}</TD>
                  <TD numeric><Money value={r.totalAmount} /></TD>
                  <TD>
                    {r.journalEntryId ? (
                      <Link href={`/journal/${r.journalEntryId}`} className="text-[12px] font-medium text-brand hover:underline">View →</Link>
                    ) : (
                      <span className="text-[12px] text-ink-4">Empty run</span>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Panel>
    </PageContainer>
  );
}
