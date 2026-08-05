"use client";

import { useState } from "react";
import Link from "next/link";
import { Panel, Card } from "@/components/ui/Card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { EmptyState } from "@/components/ui/EmptyState";
import { Kpi } from "@/components/ui/Kpi";
import { money, percent } from "@/lib/format";
import type {
  ProfitAndLoss,
  BalanceSheet,
  CashFlow,
  StatementSection,
  MonthlyPnlPoint,
  AnalyticsRatios,
  ArAgingView,
} from "@/lib/data/reports";

type Tab = "pnl" | "bs" | "cf" | "analytics";

const TABS: { id: Tab; label: string }[] = [
  { id: "pnl", label: "Profit & Loss" },
  { id: "bs", label: "Balance Sheet" },
  { id: "cf", label: "Cash Flow" },
  { id: "analytics", label: "Analytics" },
];

export function ReportsView({
  pnl,
  bs,
  cf,
  trend,
  ratios,
  aging,
}: {
  pnl: ProfitAndLoss;
  bs: BalanceSheet;
  cf: CashFlow;
  trend: MonthlyPnlPoint[];
  ratios: AnalyticsRatios;
  aging: ArAgingView;
}) {
  const [tab, setTab] = useState<Tab>("pnl");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 rounded-lg bg-fill p-1 ring-1 ring-inset ring-line self-start">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={
              "rounded-md px-3 py-1.5 text-[12px] font-semibold transition-colors " +
              (tab === t.id ? "bg-surface text-ink shadow-sm ring-1 ring-line" : "text-ink-3 hover:text-ink")
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "pnl" && <ProfitAndLossView pnl={pnl} />}
      {tab === "bs" && <BalanceSheetView bs={bs} />}
      {tab === "cf" && <CashFlowView cf={cf} />}
      {tab === "analytics" && <AnalyticsView trend={trend} ratios={ratios} aging={aging} />}
    </div>
  );
}

function SectionTable({ section, sign = 1 }: { section: StatementSection; sign?: number }) {
  return (
    <Table>
      <THead>
        <TR>
          <TH className="w-24">Code</TH>
          <TH>{section.label}</TH>
          <TH numeric>Amount</TH>
        </TR>
      </THead>
      <TBody>
        {section.lines.map((l) => (
          <TR key={l.accountId || l.code}>
            <TD className="font-mono text-[12px] text-ink-4">{l.code}</TD>
            <TD>
              <Link href={`/journal/ledger/${l.accountId}`} className="text-ink hover:text-brand hover:underline">
                {l.name}
              </Link>
            </TD>
            <TD numeric className="tnum">{money(l.amount * sign)}</TD>
          </TR>
        ))}
      </TBody>
      <tfoot>
        <TR>
          <TD colSpan={2} className="text-right text-[12px] font-semibold text-ink-2">
            Total {section.label}
          </TD>
          <TD numeric className="tnum font-bold text-ink">{money(section.total * sign)}</TD>
        </TR>
      </tfoot>
    </Table>
  );
}

function ProfitAndLossView({ pnl }: { pnl: ProfitAndLoss }) {
  if (!pnl.hasActivity) {
    return (
      <Panel flush>
        <EmptyState title="No income or expense yet" description="Post sales, purchases, or expense vouchers and the P&L builds itself from the ledger." />
      </Panel>
    );
  }
  const profit = pnl.netProfit >= 0;
  return (
    <div className="flex flex-col gap-4">
      <Panel title="Income" flush>
        <SectionTable section={pnl.income} />
      </Panel>
      <Panel title="Expenses" flush>
        <SectionTable section={pnl.expense} />
      </Panel>
      <Card className="flex items-center justify-between p-4">
        <div className="text-[13px] font-semibold text-ink">{profit ? "Net Profit" : "Net Loss"}</div>
        <div className={"font-mono text-[18px] font-bold tnum " + (profit ? "text-grn" : "text-amb")}>
          {money(Math.abs(pnl.netProfit))}
        </div>
      </Card>
    </div>
  );
}

function BalanceSheetView({ bs }: { bs: BalanceSheet }) {
  if (!bs.hasActivity) {
    return (
      <Panel flush>
        <EmptyState title="Nothing on the books yet" description="The balance sheet appears once assets, liabilities, or equity carry a balance." />
      </Panel>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <Panel title="Assets" flush>
        <SectionTable section={bs.assets} />
      </Panel>
      <Panel title="Liabilities" flush>
        <SectionTable section={bs.liabilities} />
      </Panel>
      <Panel title="Equity" flush>
        <SectionTable section={bs.equity} />
      </Panel>
      <Card className="flex flex-col gap-2 p-4">
        <div className="flex items-center justify-between text-[13px]">
          <span className="text-ink-3">Retained result (period P&amp;L)</span>
          <span className="font-mono tnum text-ink-2">{money(bs.retainedResult)}</span>
        </div>
        <div className="flex items-center justify-between border-t border-line pt-2">
          <span className="text-[13px] font-semibold text-ink">Assets = Liabilities + Equity</span>
          <span className={"font-mono text-[15px] font-bold tnum " + (bs.balanced ? "text-grn" : "text-amb")}>
            {money(bs.assetsTotal)} {bs.balanced ? "=" : "≠"} {money(bs.liabilitiesEquityTotal)}
          </span>
        </div>
      </Card>
    </div>
  );
}

function CashFlowView({ cf }: { cf: CashFlow }) {
  if (!cf.hasActivity) {
    return (
      <Panel flush>
        <EmptyState title="No cash movement yet" description="Cash-flow activity appears once the ledger has non-cash account movement to attribute." />
      </Panel>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-md bg-amb-wash px-3 py-2 text-[12px] text-amb ring-1 ring-inset ring-amb/20">
        Indicative view — activity is classified by account code, not tagged on each ledger. Treat as directional, not a reconciled statement.
      </div>
      <Panel title="Operating" flush><SectionTable section={cf.operating} /></Panel>
      <Panel title="Investing" flush><SectionTable section={cf.investing} /></Panel>
      <Panel title="Financing" flush><SectionTable section={cf.financing} /></Panel>
      <Card className="flex items-center justify-between p-4">
        <div className="text-[13px] font-semibold text-ink">Net change in cash (approx.)</div>
        <div className="font-mono text-[18px] font-bold tnum text-ink">{money(cf.netChange)}</div>
      </Card>
    </div>
  );
}

const MONTH_LABELS: Record<string, string> = {
  "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr",
  "05": "May", "06": "Jun", "07": "Jul", "08": "Aug",
  "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dec",
};

function monthLabel(ym: string): string {
  const [, mm] = ym.split("-");
  return mm ? MONTH_LABELS[mm] ?? mm : ym;
}

function AnalyticsView({
  trend,
  ratios,
  aging,
}: {
  trend: MonthlyPnlPoint[];
  ratios: AnalyticsRatios;
  aging: ArAgingView;
}) {
  const hasTrend = trend.length > 0;
  const hasAging = aging.totalOutstanding > 0;
  const peak = hasTrend ? trend.reduce((m, p) => Math.max(m, Math.abs(p.income), Math.abs(p.expense)), 0) : 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Ratio strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi
          label="Net margin"
          value={ratios.netMargin == null ? "—" : percent(ratios.netMargin * 100)}
          sub={ratios.netMargin == null ? "no income yet" : "net profit ÷ income"}
        />
        <Kpi
          label="Expense ratio"
          value={ratios.expenseRatio == null ? "—" : percent(ratios.expenseRatio * 100)}
          sub={ratios.expenseRatio == null ? "no income yet" : "expense ÷ income"}
        />
        <Kpi
          label="Receivables turnover"
          value={ratios.receivableTurnover == null ? "—" : ratios.receivableTurnover.toFixed(1) + "×"}
          sub={ratios.receivableTurnover == null ? "no receivables" : "income ÷ AR"}
        />
        <Kpi
          label="Days to collect"
          value={ratios.daysSalesOutstanding == null ? "—" : Math.round(ratios.daysSalesOutstanding)}
          tone={ratios.daysSalesOutstanding != null && ratios.daysSalesOutstanding > 60 ? "amb" : undefined}
          sub={ratios.daysSalesOutstanding == null ? "n/a" : "DSO (365 ÷ turnover)"}
        />
        <Kpi
          label="90+ overdue share"
          value={ratios.overdueShare == null ? "—" : percent(ratios.overdueShare * 100)}
          tone={ratios.overdueShare != null && ratios.overdueShare > 0.4 ? "amb" : undefined}
          sub={ratios.overdueShare == null ? "no receivables" : "of total outstanding"}
        />
      </div>

      {/* Monthly P&L trend */}
      <Panel title="Monthly Profit & Loss" flush>
        {!hasTrend ? (
          <EmptyState
            title="No ledger activity yet"
            description="Post income or expense entries and the monthly trend appears, bucketed by entry month."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Month</TH>
                <TH numeric>Income</TH>
                <TH numeric>Expense</TH>
                <TH className="w-[38%]">Trend</TH>
                <TH numeric>Net</TH>
              </TR>
            </THead>
            <TBody>
              {trend.map((p) => {
                const pos = p.net >= 0;
                return (
                  <TR key={p.month}>
                    <TD className="text-ink">{monthLabel(p.month)}</TD>
                    <TD numeric className="tnum text-grn">{money(p.income)}</TD>
                    <TD numeric className="tnum text-amb">{money(p.expense)}</TD>
                    <TD>
                      <div className="flex h-5 items-center gap-1">
                        <div className="flex h-full items-end gap-[2px]">
                          <div
                            className="w-[5px] rounded-sm bg-grn"
                            style={{ height: peak ? `${Math.max(8, Math.round((p.income / peak) * 100))}%` : "8%" }}
                            title={`Income ${money(p.income)}`}
                          />
                          <div
                            className="w-[5px] rounded-sm bg-amb"
                            style={{ height: peak ? `${Math.max(8, Math.round((p.expense / peak) * 100))}%` : "8%" }}
                            title={`Expense ${money(p.expense)}`}
                          />
                        </div>
                        <span className="ml-1 font-mono text-[11px] text-ink-4">{money(p.net)}</span>
                      </div>
                    </TD>
                    <TD numeric className={"tnum " + (pos ? "text-grn" : "text-amb")}>{money(Math.abs(p.net))}</TD>
                  </TR>
                );
              })}
            </TBody>
            <tfoot>
              <TR>
                <TD className="text-right text-[12px] font-semibold text-ink-2">Totals</TD>
                <TD numeric className="tnum font-bold text-grn">{money(trend.reduce((s, p) => s + p.income, 0))}</TD>
                <TD numeric className="tnum font-bold text-amb">{money(trend.reduce((s, p) => s + p.expense, 0))}</TD>
                <TD />
                <TD numeric className="tnum font-bold text-ink">{money(trend.reduce((s, p) => s + p.net, 0))}</TD>
              </TR>
            </tfoot>
          </Table>
        )}
      </Panel>

      {/* AR aging */}
      <Panel
        title="Receivables aging"
        subtitle={hasAging ? `${aging.invoiceCount} open invoice${aging.invoiceCount === 1 ? "" : "s"} · ${aging.partyCount} customers` : undefined}
        flush
      >
        {!hasAging ? (
          <EmptyState
            title="Nothing outstanding"
            description="Customers have no open invoices — receivables aging appears as invoices span 30/60/90 day windows."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Age</TH>
                <TH numeric>Outstanding</TH>
                <TH className="w-[45%]">Share</TH>
              </TR>
            </THead>
            <TBody>
              {aging.buckets.map((b) => {
                const pct = aging.totalOutstanding > 0 ? b.amount / aging.totalOutstanding : 0;
                return (
                  <TR key={b.label}>
                    <TD className="text-ink">{b.label} days</TD>
                    <TD numeric className="tnum">{money(b.amount)}</TD>
                    <TD>
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-fill">
                          <div
                            className={"h-full " + (b.label === "90+" ? "bg-amb" : "bg-brand")}
                            style={{ width: `${Math.round(pct * 100)}%` }}
                          />
                        </div>
                        <span className="w-11 text-right font-mono text-[11px] text-ink-4">{percent(pct * 100)}</span>
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
            <tfoot>
              <TR>
                <TD className="text-right text-[12px] font-semibold text-ink-2">Total outstanding</TD>
                <TD numeric className="tnum font-bold text-ink">{money(aging.totalOutstanding)}</TD>
                <TD />
              </TR>
            </tfoot>
          </Table>
        )}
      </Panel>
    </div>
  );
}
