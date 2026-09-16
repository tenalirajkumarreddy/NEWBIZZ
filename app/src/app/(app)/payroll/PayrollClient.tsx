"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Panel } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { Field, Select } from "@/components/ui/Field";
import { Dialog } from "@/components/ui/Dialog";
import { Money } from "@/components/ui/Money";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { MonthPicker } from "@/components/payroll/MonthPicker";
import {
  computePayrollRun,
  postPayrollRun,
  payPayrollLine,
  getPayrollRunDetail,
} from "@/lib/actions/payroll";
import type { PayrollRunRow, PayrollLineRow, WagesSummary } from "@/lib/data/payroll";

// Payroll-run tones per the brief map (draft neutral / computed amb / posted
// brand / paid grn). Badge's own STATUS_TONE can't be used here: "draft" and
// "posted" already mean entry_status tones there, so we pass explicit tones
// (same idiom as WorkerDrawer's TYPE_TONE).
const RUN_TONE: Record<string, "neutral" | "amb" | "brand" | "grn"> = {
  draft: "neutral",
  computed: "amb",
  posted: "brand",
  paid: "grn",
};

function periodLabel(periodMonth: string): string {
  const d = new Date(periodMonth + "T00:00:00");
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    month: "long",
    year: "numeric",
  }).format(d);
}

interface RunDetail {
  run: PayrollRunRow;
  lines: PayrollLineRow[];
}

export function PayrollClient({
  month,
  runs,
  summary,
  canManage,
}: {
  month: string;
  runs: PayrollRunRow[];
  summary: WagesSummary;
  canManage: boolean;
}) {
  const router = useRouter();
  const toast = useToast();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, RunDetail>>({});
  const [detailLoading, setDetailLoading] = useState(false);
  const [computing, setComputing] = useState(false);
  const [postingId, setPostingId] = useState<string | null>(null);
  const [payLine, setPayLine] = useState<{ line: PayrollLineRow; runId: string } | null>(null);
  const [payFrom, setPayFrom] = useState<"cash" | "bank">("bank");
  const [paying, setPaying] = useState(false);

  async function refreshDetail(runId: string) {
    const res = await getPayrollRunDetail(runId);
    if (res.ok) setDetails((d) => ({ ...d, [runId]: { run: res.run, lines: res.lines } }));
  }

  async function toggleRun(runId: string) {
    if (expandedId === runId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(runId);
    if (!details[runId]) {
      setDetailLoading(true);
      const res = await getPayrollRunDetail(runId);
      setDetailLoading(false);
      if (res.ok) {
        setDetails((d) => ({ ...d, [runId]: { run: res.run, lines: res.lines } }));
      } else {
        toast.error("Could not load payroll lines", res.error);
      }
    }
  }

  async function handleCompute() {
    setComputing(true);
    const res = await computePayrollRun(month);
    if (!res.ok) {
      toast.error("Failed to compute payroll", res.error);
    } else {
      toast.success("Payroll computed", `Draft run for ${periodLabel(month)}`);
      router.refresh();
    }
    setComputing(false);
  }

  async function handlePost(runId: string) {
    setPostingId(runId);
    const res = await postPayrollRun(runId);
    if (!res.ok) {
      toast.error("Failed to post payroll", res.error);
    } else {
      toast.success("Journal posted");
      await refreshDetail(runId);
      router.refresh();
    }
    setPostingId(null);
  }

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    if (!payLine) return;
    setPaying(true);
    const res = await payPayrollLine(payLine.line.id, payFrom);
    if (!res.ok) {
      toast.error("Payment failed", res.error);
    } else {
      toast.success("Paid — journal posted");
      setPayLine(null);
      await refreshDetail(payLine.runId);
      router.refresh();
    }
    setPaying(false);
  }

  const monthRuns = runs.filter((r) => r.periodMonth === month);
  const otherRuns = runs.filter((r) => r.periodMonth !== month);

  function renderRunCard(run: PayrollRunRow) {
    const detail = details[run.id];
    const expanded = expandedId === run.id;
    const canPayRun = !!detail && (detail.run.status === "posted" || detail.run.status === "paid");

    return (
      <div key={run.id} className="rounded-lg border border-line bg-surface shadow-card">
        <button
          type="button"
          onClick={() => toggleRun(run.id)}
          aria-expanded={expanded}
          className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-2 p-3.5 text-left"
        >
          <span className="flex flex-wrap items-center gap-2.5">
            <span className="text-[14px] font-semibold text-ink">{periodLabel(run.periodMonth)}</span>
            {run.periodMonth === month && (
              <Badge tone="slate" size="sm">
                This month
              </Badge>
            )}
            <Badge tone={RUN_TONE[run.status] ?? "neutral"} size="sm" dot>
              {labelOf(run.status)}
            </Badge>
            {detail && (
              <span className="text-[12px] text-ink-4">{detail.lines.length} lines</span>
            )}
          </span>
          <span className="flex items-center gap-3">
            <span className="text-[13px] font-semibold text-ink">
              <Money value={run.totalGross} />
            </span>
            <span onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5">
              {run.status === "computed" && (
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!canManage}
                  loading={postingId === run.id}
                  title={!canManage ? "Requires HR manage permission" : undefined}
                  onClick={() => handlePost(run.id)}
                >
                  Post
                </Button>
              )}
              <span aria-hidden className="text-[12px] text-ink-4">
                {expanded ? "▲" : "▼"}
              </span>
            </span>
          </span>
        </button>

        {expanded && (
          <div className="border-t border-line">
            {!detail ? (
              <p className="p-4 text-[12px] text-ink-4">{detailLoading ? "Loading lines…" : "No lines loaded yet."}</p>
            ) : detail.lines.length === 0 ? (
              <p className="p-4 text-[12px] text-ink-4">No lines in this run.</p>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Employee</TH>
                    <TH numeric>Days</TH>
                    <TH numeric>OT hrs</TH>
                    <TH numeric>Gross</TH>
                    <TH numeric>Paid</TH>
                    <TH className="w-24" />
                  </TR>
                </THead>
                <TBody>
                  {detail.lines.map((l) => {
                    const settled = l.paidAmount >= l.gross;
                    return (
                      <TR key={l.id}>
                        <TD className="font-medium text-ink">{l.userName}</TD>
                        <TD>
                          <span className="block text-right font-mono text-[13px] text-ink-2">
                            {l.daysPresent}
                          </span>
                        </TD>
                        <TD>
                          <span className="block text-right font-mono text-[13px] text-ink-2">
                            {l.otHours}
                          </span>
                        </TD>
                        <TD>
                          <Money value={l.gross} />
                        </TD>
                        <TD>
                          <span className="flex items-center justify-end gap-2">
                            <Money value={l.paidAmount} />
                            <Badge tone={settled ? "grn" : "amb"} size="sm">
                              {settled ? "Paid" : "Due"}
                            </Badge>
                          </span>
                        </TD>
                        <TD>
                          {canPayRun && !settled && (
                            <Button
                              variant="primary"
                              size="sm"
                              disabled={!canManage}
                              title={!canManage ? "Requires HR manage permission" : undefined}
                              onClick={() => {
                                setPayLine({ line: l, runId: run.id });
                                setPayFrom("bank");
                              }}
                            >
                              Pay
                            </Button>
                          )}
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            )}
            {detail && detail.run.status === "computed" && !detail.run.journalEntryId && (
              <div className="flex justify-end border-t border-line p-3">
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!canManage}
                  loading={postingId === run.id}
                  title={!canManage ? "Requires HR manage permission" : undefined}
                  onClick={() => handlePost(run.id)}
                >
                  Post journal for {periodLabel(detail.run.periodMonth)}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthPicker current={month} />
        <Button
          variant="primary"
          size="sm"
          disabled={!canManage}
          loading={computing}
          title={!canManage ? "Requires HR manage permission" : undefined}
          onClick={handleCompute}
        >
          Compute for {periodLabel(month)}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-line bg-surface p-3.5 shadow-card">
          <p className="text-[11px] font-medium uppercase tracking-wider text-ink-3">Accrued</p>
          <p className="mt-1 text-[22px] font-bold text-ink">
            <Money value={summary.accrued} compact />
          </p>
        </div>
        <div className="rounded-lg border border-line bg-surface p-3.5 shadow-card">
          <p className="text-[11px] font-medium uppercase tracking-wider text-ink-3">Paid out</p>
          <p className="mt-1 text-[22px] font-bold text-green-600 dark:text-emerald-400">
            <Money value={summary.paidOut} compact />
          </p>
        </div>
        <div className="rounded-lg border border-line bg-surface p-3.5 shadow-card">
          <p className="text-[11px] font-medium uppercase tracking-wider text-ink-3">Net owed</p>
          <p className="mt-1 text-[22px] font-bold text-red-500 dark:text-red-400">
            <Money value={summary.netOwed} compact />
          </p>
        </div>
      </div>

      <Panel title={`Runs — ${periodLabel(month)}`}>
        {monthRuns.length === 0 ? (
          <EmptyState
            title="No payroll runs for this month"
            description="Use Compute to draft a run from attendance and pay settings, then post it to create the journal."
          />
        ) : (
          <div className="flex flex-col gap-3">{monthRuns.map(renderRunCard)}</div>
        )}
      </Panel>

      {otherRuns.length > 0 && (
        <Panel title="Other months" subtitle="Newest first">
          <div className="flex flex-col gap-3">{otherRuns.map(renderRunCard)}</div>
        </Panel>
      )}

      {payLine && (
        <Dialog open onClose={() => setPayLine(null)} title={`Pay ${payLine.line.userName}`}>
          <form onSubmit={handlePay} className="flex flex-col gap-4">
            <Field label="Amount (pays the full unsettled line)">
              <div className="flex h-9 items-center rounded-lg border border-line bg-fill px-3 text-[13px] font-semibold text-ink">
                <Money value={payLine.line.gross - payLine.line.paidAmount} />
              </div>
            </Field>
            <Field label="Pay from">
              <Select
                value={payFrom}
                onChange={(e) => setPayFrom(e.target.value === "cash" ? "cash" : "bank")}
              >
                <option value="bank">Bank Transfer</option>
                <option value="cash">Cash</option>
              </Select>
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="subtle" type="button" onClick={() => setPayLine(null)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" loading={paying}>
                Pay
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}

function labelOf(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}
