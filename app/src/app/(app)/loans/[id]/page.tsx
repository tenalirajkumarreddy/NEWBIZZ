import { notFound } from "next/navigation";
import { getLoan } from "@/lib/data/loans";
import { Panel, Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/Badge";
import { PageContainer, PageHeader } from "@/components/ui";
import { Money } from "@/components/ui/Money";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { dateIST, percent } from "@/lib/format";
import { LoanScheduleRow } from "./LoanScheduleRow";

// Loan detail (§5.8). Terms, the amortization schedule, and per-installment
// pay-EMI (Dr principal + Dr interest / Cr bank). The first unpaid row is the
// one due next; paying the last one closes the loan.
export default async function LoanDetailPage({ params }: { params: { id: string } }) {
  const loan = await getLoan(params.id);
  if (!loan) notFound();

  const nextUnpaid = loan.schedule.find((s) => !s.paid);

  return (
    <PageContainer width="report">
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <span className="font-mono text-[13px] text-ink-4">{loan.loanNo}</span>
            <span>{loan.lender}</span>
            <StatusBadge status={loan.status} />
          </span>
        }
        subtitle={
          <>
            {dateIST(loan.startDate)} · {percent(loan.annualRate, { alreadyPct: true, decimals: 2 })} · {loan.tenureMonths} months
          </>
        }
        backHref="/loans"
        backLabel="Loans &amp; EMI"
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Fact label="Principal" value={<Money value={loan.principal} />} mono />
        <Fact label="EMI" value={<Money value={loan.emiAmount} />} mono />
        <Fact label="Outstanding" value={<Money value={loan.outstanding} />} mono tone={loan.outstanding > 0 ? "amb" : "grn"} />
        <Fact label="Total interest" value={<Money value={loan.totalInterest} />} mono />
      </div>

      {loan.status === "active" && nextUnpaid && (
        <Card className="flex flex-col gap-1 p-4">
          <div className="flex flex-wrap items-center gap-1 text-[12px] text-ink-3">
            <span>Next EMI: #{nextUnpaid.installmentNo} due {dateIST(nextUnpaid.dueDate)} ·</span>
            <Money value={nextUnpaid.emiAmount} />
            <span>(</span>
            <Money value={nextUnpaid.principalComponent} />
            <span>principal +</span>
            <Money value={nextUnpaid.interestComponent} />
            <span>interest)</span>
          </div>
        </Card>
      )}

      <Panel title="Amortization schedule" flush>
        <Table>
          <THead>
            <TR>
              <TH className="w-10">#</TH>
              <TH>Due</TH>
              <TH numeric>EMI</TH>
              <TH numeric>Principal</TH>
              <TH numeric>Interest</TH>
              <TH numeric>Balance</TH>
              <TH>Status</TH>
              <TH className="w-28">Action</TH>
            </TR>
          </THead>
          <TBody>
            {loan.schedule.map((s) => (
              <LoanScheduleRow
                key={s.id}
                loanId={loan.id}
                row={{
                  id: s.id,
                  installmentNo: s.installmentNo,
                  dueDate: s.dueDate,
                  emiAmount: s.emiAmount,
                  principalComponent: s.principalComponent,
                  interestComponent: s.interestComponent,
                  balance: s.balance,
                  paid: s.paid,
                  paidOn: s.paidOn,
                  paymentJournalId: s.paymentJournalId,
                }}
                payable={loan.status === "active"}
              />
            ))}
          </TBody>
        </Table>
      </Panel>

      {loan.note && (
        <Card className="p-4">
          <div className="eyebrow text-ink-4">Note</div>
          <p className="mt-1 text-[13px] text-ink-2">{loan.note}</p>
        </Card>
      )}
    </PageContainer>
  );
}

function Fact({ label, value, mono, tone }: { label: string; value: React.ReactNode; mono?: boolean; tone?: "amb" | "grn" }) {
  const toneClass = tone === "amb" ? "text-amb" : tone === "grn" ? "text-grn" : "text-ink";
  return (
    <Card className="p-3.5">
      <div className="eyebrow text-ink-4">{label}</div>
      <div className={"mt-1 text-[15px] font-semibold " + toneClass + (mono ? " font-mono tnum" : "")}>{value}</div>
    </Card>
  );
}
