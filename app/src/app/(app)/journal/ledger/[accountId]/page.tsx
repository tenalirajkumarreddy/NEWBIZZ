import Link from "next/link";
import { notFound } from "next/navigation";
import { getLedger } from "@/lib/data/journal";
import { getCurrentFy } from "@/lib/data/fy";
import { Panel } from "@/components/ui/Card";
import { Kpi, PageContainer } from "@/components/ui";
import { EmptyState } from "@/components/ui/EmptyState";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { dateIST, money } from "@/lib/format";

function titleCase(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Account ledger (§5.1) — every journal line touching one account this FY, in
// date order, with a running balance (debit-positive). Reached from the trial
// balance or any journal-line account link.
export default async function LedgerPage({ params }: { params: { accountId: string } }) {
  const [ledger, fy] = await Promise.all([getLedger(params.accountId), getCurrentFy()]);
  if (!ledger.code && ledger.lines.length === 0) notFound();

  const closing = ledger.closing;

  return (
    <PageContainer width="report">
      <div>
        <Link href="/trial-balance" className="text-[12px] font-medium text-ink-4 hover:text-brand">
          ← Trial Balance
        </Link>
        <div className="mt-1 flex items-center gap-3">
          <span className="font-mono text-[13px] text-ink-4">{ledger.code}</span>
          <h1 className="text-[22px] font-bold tracking-tight text-ink">{ledger.name ?? "Account"}</h1>
        </div>
        <p className="mt-0.5 text-[13px] text-ink-3">{fy ? `FY ${fy.code}` : "FY —"}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi label="Total debits" value={money(ledger.debitTotal)} />
        <Kpi label="Total credits" value={money(ledger.creditTotal)} />
        <Kpi
          label="Closing balance"
          value={`${money(Math.abs(closing))} ${closing >= 0 ? "Dr" : "Cr"}`}
        />
      </div>

      <Panel flush>
        {ledger.lines.length === 0 ? (
          <EmptyState title="No postings this year" description="This account has no journal lines in the current financial year." />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Date</TH>
                <TH>Entry</TH>
                <TH>Source</TH>
                <TH>Narration</TH>
                <TH numeric>Debit</TH>
                <TH numeric>Credit</TH>
                <TH numeric>Balance</TH>
              </TR>
            </THead>
            <TBody>
              {ledger.lines.map((l, i) => (
                <TR key={`${l.entryId}-${i}`} interactive>
                  <TD>{dateIST(l.entryDate)}</TD>
                  <TD className="p-0">
                    <Link href={`/journal/${l.entryId}`} className="block px-3 py-2.5 font-mono text-[12px] font-semibold text-brand">
                      {l.entryNo}
                    </Link>
                  </TD>
                  <TD className="text-[12px] text-ink-3">{titleCase(l.source)}</TD>
                  <TD className="max-w-[320px] truncate text-ink-2">{l.narration ?? "—"}</TD>
                  <TD numeric className="tnum">{l.debit ? money(l.debit) : ""}</TD>
                  <TD numeric className="tnum">{l.credit ? money(l.credit) : ""}</TD>
                  <TD numeric className="tnum text-ink-2">
                    {money(Math.abs(l.running))} {l.running >= 0 ? "Dr" : "Cr"}
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
