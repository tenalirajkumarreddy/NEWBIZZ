import Link from "next/link";
import { listLoans } from "@/lib/data/loans";
import { getCurrentFy } from "@/lib/data/fy";
import { Panel } from "@/components/ui/Card";
import { Kpi, PageContainer, PageHeader } from "@/components/ui";
import { Button } from "@/components/ui/Button";
import { StatusBadge, Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Money } from "@/components/ui/Money";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { dateIST, count as fmtCount, percent } from "@/lib/format";

// Loans & EMI (§5.8). Bank loans with a reducing-balance schedule; each EMI
// splits principal vs interest. Outstanding = principal still owed across unpaid
// installments; the next due date drives the upcoming-EMI badge.
export const metadata = { title: "Loans & EMI — NEWBIZZ" };
export default async function LoansPage() {
  const [loans, fy] = await Promise.all([listLoans({ limit: 200 }), getCurrentFy()]);

  const active = loans.filter((l) => l.status === "active");
  const outstanding = active.reduce((s, l) => s + l.outstanding, 0);
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const dueSoon = active.filter((l) => l.nextDueDate && l.nextDueDate <= todayStr).length;

  return (
    <PageContainer width="full">
      <PageHeader
        title="Loans &amp; EMI"
        subtitle={
          <>
            {fy ? `FY ${fy.code}` : "FY —"} · {fmtCount(active.length)} active loans
          </>
        }
        actions={
          <Link href="/loans/new" className="self-start rounded-md bg-brand px-3 py-2 text-[12px] font-semibold text-white hover:bg-brand-d">
            + Add loan
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi label="Total outstanding" value={<Money value={outstanding} />} sub="Principal owed" tone={outstanding > 0 ? "amb" : "grn"} />
        <Kpi label="Active loans" value={fmtCount(active.length)} sub={`${fmtCount(loans.length - active.length)} closed`} />
        <Kpi label="EMIs due now" value={fmtCount(dueSoon)} sub="On or before today" tone={dueSoon > 0 ? "amb" : "grn"} />
      </div>

      <Panel flush>
        {loans.length === 0 ? (
          <EmptyState
            title="No loans yet"
            description="Add a bank loan to generate its EMI schedule. Each EMI splits principal (reduces the loan) and interest (an expense)."
            action={<Link href="/loans/new"><Button variant="secondary" size="sm">Add a loan</Button></Link>}
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Loan No</TH>
                <TH>Lender</TH>
                <TH numeric>Principal</TH>
                <TH numeric>Rate</TH>
                <TH numeric>EMI</TH>
                <TH numeric>Paid</TH>
                <TH numeric>Outstanding</TH>
                <TH>Next due</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {loans.map((l) => {
                const overdue = l.nextDueDate && l.nextDueDate <= todayStr && l.status === "active";
                return (
                  <TR key={l.id} interactive>
                    <TD className="p-0">
                      <Link href={`/loans/${l.id}`} className="block px-3 py-2.5 font-mono text-[12px] font-semibold text-brand">{l.loanNo}</Link>
                    </TD>
                    <TD className="font-medium text-ink">{l.lender}</TD>
                    <TD numeric><Money value={l.principal} /></TD>
                    <TD numeric>{percent(l.annualRate, { alreadyPct: true, decimals: 2 })}</TD>
                    <TD numeric><Money value={l.emiAmount} /></TD>
                    <TD numeric>{l.paidCount}/{l.tenureMonths}</TD>
                    <TD numeric className="font-semibold"><Money value={l.outstanding} /></TD>
                    <TD>
                      {l.nextDueDate ? (
                        overdue ? <Badge tone="amb" size="sm">{dateIST(l.nextDueDate)}</Badge> : dateIST(l.nextDueDate)
                      ) : "—"}
                    </TD>
                    <TD><StatusBadge status={l.status} /></TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Panel>
    </PageContainer>
  );
}
