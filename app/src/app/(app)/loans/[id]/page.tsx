import Link from "next/link";
import { notFound } from "next/navigation";
import { getLoan } from "@/lib/data/loans";
import { Panel, Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/Badge";
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
    <div className="mx-auto flex max-w-[1100px] flex-col gap-4 px-6 py-6 lg:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/loans" className="text-[12px] font-medium text-ink-4 hover:text-brand">← Loans &amp; EMI</Link>
          <div className="mt-1 flex items-center gap-3">
            <span className="font-mono text-[13px] text-ink-4">{loan.loanNo}</span>
            <h1 className="text-[22px] font-bold tracking-tight text-ink">{loan.lender}</h1>
            <StatusBadge status={loan.status} />
          </div>
          <p className="mt-0.5 text-[13px] text-ink-3">
            {dateIST(loan.startDate)} · {percent(loan.annualRate, { alreadyPct: true, decimals: 2 })} · {loan.tenureMonths} months
          </p>
        </div>
      </div>

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
    </div>
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
