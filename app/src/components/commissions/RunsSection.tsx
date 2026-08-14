"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Panel, SectionHeading } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Drawer } from "@/components/ui/Drawer";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { Money } from "@/components/ui/Money";
import { dateIST, money as fmtMoney } from "@/lib/format";
import { computeCommissionRun, postCommissionRun, getRunDetail } from "@/lib/actions/commissions";
import type { CommissionRunRow } from "@/lib/data/commissions";

interface RunDetail {
  run: {
    id: string;
    periodMonth: string;
    status: string;
    totalAmount: number;
    computedAt: string | null;
    journalEntryId: string | null;
  };
  lines: {
    userId: string;
    userName: string;
    basis: string;
    baseAmount: number;
    rate: number;
    commissionAmount: number;
  }[];
}

export function RunsSection({
  runs,
  canManage,
}: {
  runs: CommissionRunRow[];
  canManage: boolean;
}) {
  const [viewRun, setViewRun] = useState<RunDetail | null>(null);
  const [computing, setComputing] = useState<string | null>(null);
  const [posting, setPosting] = useState<string | null>(null);
  const router = useRouter();
  const toast = useToast();

  async function handleCompute(month: string) {
    setComputing(month);
    const result = await computeCommissionRun(month);
    setComputing(null);
    if (result.ok) {
      toast.success("Commission run computed");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  async function handlePost(runId: string) {
    setPosting(runId);
    const result = await postCommissionRun(runId);
    setPosting(null);
    if (result.ok) {
      toast.success("Commission run posted to journal");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  async function handleViewRun(run: CommissionRunRow) {
    const result = await getRunDetail(run.id);
    if (result.ok) {
      setViewRun({ run: result.run, lines: result.lines });
    } else {
      toast.error(result.error);
    }
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <SectionHeading>
          <span className="flex items-center gap-2">
            Commission Runs
            <Badge tone="brand" size="sm">{runs.length}</Badge>
          </span>
        </SectionHeading>
      </div>
      <Panel flush>
        {runs.length === 0 ? (
          <EmptyState
            title="No commission runs yet"
            description="Compute a commission run to calculate commissions based on rules and actual sales for a month."
            action={
              canManage ? (
                <Button variant="secondary" size="sm" onClick={() => {
                  const now = new Date();
                  const m = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
                  handleCompute(m);
                }}>
                  Compute current month
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Month</TH>
                <TH>Status</TH>
                <TH numeric>Total Amount</TH>
                <TH>Computed</TH>
                <TH className="w-36" />
              </TR>
            </THead>
            <TBody>
              {runs.map((run) => (
                <TR key={run.id}>
                  <TD className="font-mono text-[12px] font-semibold text-ink">
                    {dateIST(run.periodMonth)}
                  </TD>
                  <TD><StatusBadge status={run.status} /></TD>
                  <TD numeric><Money value={run.totalAmount} /></TD>
                  <TD className="font-mono text-[12px] text-ink-4">
                    {run.computedAt ? dateIST(run.computedAt) : "—"}
                  </TD>
                  <TD>
                    <div className="flex gap-1">
                      <Button
                        variant="subtle"
                        size="sm"
                        onClick={() => handleViewRun(run)}
                      >
                        View
                      </Button>
                      {canManage && run.status === "computed" && (
                        <Button
                          variant="primary"
                          size="sm"
                          loading={posting === run.id}
                          onClick={() => handlePost(run.id)}
                        >
                          Post
                        </Button>
                      )}
                      {canManage && run.status === "draft" && (
                        <Button
                          variant="secondary"
                          size="sm"
                          loading={computing === run.periodMonth}
                          onClick={() => handleCompute(run.periodMonth)}
                        >
                          Compute
                        </Button>
                      )}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Panel>

      {/* Run lines drawer */}
      <Drawer
        open={viewRun !== null}
        onClose={() => setViewRun(null)}
        title={
          viewRun
            ? `Run · ${dateIST(viewRun.run.periodMonth)}`
            : "Run detail"
        }
        description={
          viewRun
            ? `${viewRun.lines.length} lines · Total ${fmtMoney(viewRun.run.totalAmount)}`
            : undefined
        }
        size="lg"
      >
        {viewRun && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <StatusBadge status={viewRun.run.status} />
              {viewRun.run.journalEntryId && (
                <span className="text-[11px] text-ink-4">
                  JE: {viewRun.run.journalEntryId.slice(0, 8)}
                </span>
              )}
            </div>
            {viewRun.lines.length === 0 ? (
              <EmptyState
                title="No lines in this run"
                description="This run has no commission lines to show yet."
              />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>User</TH>
                    <TH>Basis</TH>
                    <TH numeric>Base Amount</TH>
                    <TH numeric>Rate</TH>
                    <TH numeric>Commission</TH>
                  </TR>
                </THead>
                <TBody>
                  {viewRun.lines.map((line) => (
                    <TR key={`${line.userId}-${line.basis}`}>
                      <TD className="font-medium text-ink">{line.userName}</TD>
                      <TD className="text-ink-3 capitalize">{line.basis}</TD>
                      <TD numeric><Money value={line.baseAmount} /></TD>
                      <TD numeric className="font-mono text-[12px]">{line.rate}%</TD>
                      <TD numeric><Money value={line.commissionAmount} /></TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </div>
        )}
      </Drawer>
    </>
  );
}
