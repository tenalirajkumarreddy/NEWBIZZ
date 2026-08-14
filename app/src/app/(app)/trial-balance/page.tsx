import Link from "next/link";
import { getTrialBalance } from "@/lib/data/accounting";
import { getCurrentFy } from "@/lib/data/fy";
import { Panel } from "@/components/ui/Card";
import { PageContainer, PageHeader } from "@/components/ui";
import { Kpi } from "@/components/ui";
import { EmptyState } from "@/components/ui/EmptyState";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { money } from "@/lib/format";

// Trial Balance (§5.1) — every account's net debit/credit for the FY, straight
// off get_trial_balance (mv_trial_balance, backed by journal_lines). The Dr and
// Cr columns must tie; the footer proves it. Balance is debit-positive.
export const metadata = { title: "Trial Balance — NEWBIZZ" };
export default async function TrialBalancePage() {
  const [rows, fy] = await Promise.all([getTrialBalance(), getCurrentFy()]);

  const active = rows.filter((r) => Number(r.balance ?? 0) !== 0);
  const debitTotal = active.reduce((s, r) => s + Math.max(Number(r.balance ?? 0), 0), 0);
  const creditTotal = active.reduce((s, r) => s + Math.max(-Number(r.balance ?? 0), 0), 0);
  const balanced = Math.abs(debitTotal - creditTotal) < 0.5;

  return (
    <PageContainer width="report">
      <PageHeader
        title="Trial Balance"
        subtitle={`${fy ? `FY ${fy.code}` : "FY —"} · ${active.length} accounts with movement`}
        actions={
          <Link
            href="/reports"
            className="self-start rounded-md bg-fill px-3 py-2 text-[12px] font-semibold text-ink-2 ring-1 ring-inset ring-line hover:text-brand"
          >
            P&amp;L / Balance Sheet →
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi label="Total debits" value={money(debitTotal)} sub="Dr balances" />
        <Kpi label="Total credits" value={money(creditTotal)} sub="Cr balances" />
        <Kpi
          label="Status"
          value={balanced ? "Balanced" : "Out of balance"}
          sub={balanced ? "Dr = Cr" : `Diff ${money(Math.abs(debitTotal - creditTotal))}`}
          tone={balanced ? "grn" : "amb"}
        />
      </div>

      <Panel flush>
        {active.length === 0 ? (
          <EmptyState
            title="No ledger movement yet"
            description="Once invoices, bills, payments, or manual vouchers post to the ledger, every account's net balance appears here."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH className="w-24">Code</TH>
                <TH>Account</TH>
                <TH>Type</TH>
                <TH numeric>Debit</TH>
                <TH numeric>Credit</TH>
              </TR>
            </THead>
            <TBody>
              {active.map((r) => {
                const bal = Number(r.balance ?? 0);
                return (
                  <TR key={r.account_id ?? r.account_code}>
                    <TD className="font-mono text-[12px] text-ink-4">{r.account_code}</TD>
                    <TD>
                      <Link
                        href={`/journal/ledger/${r.account_id}`}
                        className="font-medium text-ink hover:text-brand hover:underline"
                      >
                        {r.account_name}
                      </Link>
                    </TD>
                    <TD className="text-[12px] capitalize text-ink-3">{r.account_type}</TD>
                    <TD numeric className="tnum">{bal > 0 ? money(bal) : ""}</TD>
                    <TD numeric className="tnum">{bal < 0 ? money(-bal) : ""}</TD>
                  </TR>
                );
              })}
            </TBody>
            <tfoot>
              <TR>
                <TD colSpan={3} className="text-right text-[12px] font-semibold text-ink-2">
                  Totals
                </TD>
                <TD numeric className="tnum font-bold text-ink">{money(debitTotal)}</TD>
                <TD numeric className="tnum font-bold text-ink">{money(creditTotal)}</TD>
              </TR>
            </tfoot>
          </Table>
        )}
      </Panel>
    </PageContainer>
  );
}
