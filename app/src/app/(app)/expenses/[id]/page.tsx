import Link from "next/link";
import { notFound } from "next/navigation";
import { getExpense } from "@/lib/data/expenses";
import { Panel, Card } from "@/components/ui/Card";
import { PageContainer, PageHeader } from "@/components/ui";
import { StatusBadge } from "@/components/ui/Badge";
import { Money } from "@/components/ui/Money";
import { dateIST, titleCase } from "@/lib/format";
import { ExpenseActions } from "./ExpenseActions";

const SOURCE_LABEL: Record<string, string> = {
  user_holding: "User custody (2140)",
  petty_cash: "Petty cash (1115)",
  bank: "Bank (1120)",
};

// Expense detail (§5.6). A pending expense can be approved (posts Dr category /
// Cr source, decrements the source, links the journal) or rejected. Once
// approved the journal is the truth; this view is read-only.
export default async function ExpenseDetailPage({ params }: { params: { id: string } }) {
  const exp = await getExpense(params.id);
  if (!exp) notFound();

  return (
    <PageContainer width="detail">
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <span className="font-mono">{exp.expenseNo}</span>
            <StatusBadge status={exp.status} />
          </span>
        }
        subtitle={
          <>
            {dateIST(exp.expenseDate)} · {titleCase(exp.category)}
            {exp.userName ? ` · ${exp.userName}` : ""}
          </>
        }
        actions={exp.status === "pending" && <ExpenseActions expenseId={exp.id} expenseNo={exp.expenseNo} />}
        backHref="/expenses"
        backLabel="Expenses"
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Fact label="Amount" value={<Money value={exp.amount} />} mono />
        <Fact label="Category" value={titleCase(exp.category)} />
        <Fact label="Expense account" value={`${exp.accountCode} ${exp.accountName ?? ""}`} />
        <Fact label="Paid from" value={SOURCE_LABEL[exp.source] ?? exp.source} />
      </div>

      {exp.status === "approved" && exp.journalId && (
        <Card className="flex items-center justify-between p-4">
          <div className="text-[13px] text-ink-2">This expense posted to the ledger on approval.</div>
          <Link href={`/journal/${exp.journalId}`} className="text-[12px] font-semibold text-brand hover:underline">
            View journal entry →
          </Link>
        </Card>
      )}

      {exp.status === "rejected" && (
        <Card className="p-4">
          <div className="eyebrow text-ink-4">Rejected</div>
          <p className="mt-1 text-[13px] text-ink-2">{exp.rejectReason ?? "No reason given."}</p>
        </Card>
      )}

      {exp.note && (
        <Card className="p-4">
          <div className="eyebrow text-ink-4">Note</div>
          <p className="mt-1 text-[13px] text-ink-2">{exp.note}</p>
        </Card>
      )}

      <p className="text-[11px] text-ink-4">
        On approval: Dr {exp.accountName ?? exp.accountCode} / Cr {SOURCE_LABEL[exp.source] ?? exp.source}. Money moves only then.
      </p>
    </PageContainer>
  );
}

function Fact({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <Card className="p-3.5">
      <div className="eyebrow text-ink-4">{label}</div>
      <div className={"mt-1 text-[15px] font-semibold text-ink " + (mono ? "font-mono tnum" : "")}>{value}</div>
    </Card>
  );
}
