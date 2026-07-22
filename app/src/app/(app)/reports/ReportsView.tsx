"use client";

import { useState } from "react";
import Link from "next/link";
import { Panel, Card } from "@/components/ui/Card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { EmptyState } from "@/components/ui/EmptyState";
import { money } from "@/lib/format";
import type { ProfitAndLoss, BalanceSheet, CashFlow, StatementSection } from "@/lib/data/reports";

type Tab = "pnl" | "bs" | "cf";

const TABS: { id: Tab; label: string }[] = [
  { id: "pnl", label: "Profit & Loss" },
  { id: "bs", label: "Balance Sheet" },
  { id: "cf", label: "Cash Flow" },
];

export function ReportsView({ pnl, bs, cf }: { pnl: ProfitAndLoss; bs: BalanceSheet; cf: CashFlow }) {
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
