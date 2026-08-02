"use client";

import Link from "next/link";
import { Panel, Badge, Kpi } from "@/components/ui";
import type { BankAccountRow } from "@/lib/data/bank";

interface ReconSnapshot {
  book_balance: number;
  statement_balance: number;
  matched_count: number;
  unmatched_stmt_count: number;
  unmatched_stmt_value: number;
  difference: number;
}

function fmtr(n: number) {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

export function BankDashboard({
  accounts,
  reconMap,
}: {
  accounts: BankAccountRow[];
  reconMap: Record<string, ReconSnapshot | null>;
}) {
  const banks = accounts.filter((a) => a.accountType === "bank");
  const cards = accounts.filter((a) => a.accountType === "credit_card");

  const totalBank = banks.reduce((s, a) => s + (reconMap[a.id]?.book_balance ?? 0), 0);
  const totalCard = cards.reduce((s, a) => s + Math.abs(reconMap[a.id]?.book_balance ?? 0), 0);
  const unmatchedCount = accounts.reduce((s, a) => s + (reconMap[a.id]?.unmatched_stmt_count ?? 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-3 gap-4">
        <Kpi label="Bank Balance" value={fmtr(totalBank)} />
        <Kpi label="Credit Card Outstanding" value={fmtr(totalCard)} />
        <Kpi label="Unmatched Items" value={String(unmatchedCount)} />
      </div>

      {banks.length > 0 && (
        <section>
          <h2 className="mb-3 text-[15px] font-semibold text-ink">Bank Accounts</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {banks.map(renderAccountCard(reconMap))}
          </div>
        </section>
      )}

      {cards.length > 0 && (
        <section>
          <h2 className="mb-3 text-[15px] font-semibold text-ink">Credit Cards</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {cards.map(renderAccountCard(reconMap))}
          </div>
        </section>
      )}

      {accounts.length === 0 && (
        <Panel>
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-[15px] text-ink-3">No bank or credit card accounts yet.</p>
            <Link href="/bank/new" className="rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-white">Add Account</Link>
          </div>
        </Panel>
      )}
    </div>
  );
}

function renderAccountCard(reconMap: Record<string, ReconSnapshot | null>) {
  return (a: BankAccountRow) => {
    const r = reconMap[a.id];
    const diff = r?.difference ?? 0;
    const unmatched = r?.unmatched_stmt_count ?? 0;
    const bal = r?.book_balance ?? 0;

    return (
      <Link key={a.id} href={`/bank/${a.id}`} className="block">
        <Panel>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-semibold text-ink">{a.name}</span>
                <Badge tone={a.status === "active" ? "grn" : "slate"}>{a.status}</Badge>
              </div>
              <p className="mt-0.5 text-[13px] text-ink-3">
                {a.accountType === "credit_card"
                  ? a.cardLastFour ? `•••• ${a.cardLastFour}` : "Credit Card"
                  : a.bankName ?? "Bank Account"}
                {a.accountNo ? ` | ${a.accountNo.slice(-4)}` : ""}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[18px] font-bold tabular-nums text-ink">{fmtr(bal)}</p>
              {a.accountType === "credit_card" && a.creditLimit != null && (
                <p className="text-[11px] text-ink-3">Limit: {fmtr(a.creditLimit)}</p>
              )}
            </div>
          </div>
          {r && (
            <div className="mt-3 flex gap-4 border-t border-line pt-3 text-[12px] text-ink-3">
              <span>Statement: {fmtr(r.statement_balance ?? 0)}</span>
              <span className={diff === 0 ? "text-emerald-600" : "text-red-600"}>
                Diff: {fmtr(diff)}
              </span>
              {unmatched > 0 && <span className="font-semibold text-amber-600">{unmatched} unmatched</span>}
            </div>
          )}
        </Panel>
      </Link>
    );
  };
}
