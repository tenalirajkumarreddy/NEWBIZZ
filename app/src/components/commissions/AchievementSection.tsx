"use client";

import type { TargetAchievementRow } from "@/lib/data/commissions";
import { Panel } from "@/components/ui/Card";
import { MonthPicker } from "./MonthPicker";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Money } from "@/components/ui/Money";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { EmptyState } from "@/components/ui/EmptyState";
import { qty as fmtQty } from "@/lib/format";

export function AchievementSection({
  month,
  rows,
}: {
  month: string;
  rows: TargetAchievementRow[];
}) {
  return (
    <Panel
      title={
        <span className="flex items-center gap-3">
          Target Achievement
          <MonthPicker current={month} />
        </span>
      }
      flush
    >
      {rows.length === 0 ? (
        <EmptyState
          title="No targets set for this month"
          description="Set targets in the Monthly Targets section below to track achievement."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>User</TH>
              <TH numeric>Target (₹)</TH>
              <TH numeric>Achieved (₹)</TH>
              <TH numeric className="w-40">%</TH>
              <TH numeric>Target (cases)</TH>
              <TH numeric>Achieved (cases)</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.userId}>
                <TD className="font-medium text-ink">{r.userName}</TD>
                <TD numeric><Money value={r.targetAmount} /></TD>
                <TD numeric><Money value={r.achievedAmount} /></TD>
                <TD numeric>
                  <div className="flex items-center justify-end gap-2">
                    <ProgressBar value={r.pct ?? 0} />
                    <span className="font-mono text-[12px] tnum w-12 text-right">
                      {r.pct !== null ? `${r.pct.toFixed(1)}%` : "—"}
                    </span>
                  </div>
                </TD>
                <TD numeric className="font-mono text-[12px] tnum">{fmtQty(r.targetCases)}</TD>
                <TD numeric className="font-mono text-[12px] tnum">{fmtQty(r.achievedCases)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </Panel>
  );
}
