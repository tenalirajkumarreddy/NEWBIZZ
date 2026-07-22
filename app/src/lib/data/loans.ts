// =====================================================================
// lib/data/loans.ts — server-only readers for Loans & EMI (§5.8). The
// amortization schedule is generated at create_loan time; outstanding =
// balance after the last paid installment. Reads only; writes via
// lib/actions/loans.ts.
// =====================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrap } from "./types";
import type { Database } from "@/lib/supabase/database.types";

type Tables = Database["public"]["Tables"];
export type LoanStatus = Database["public"]["Enums"]["loan_status"];

export interface LoanRow {
  id: string;
  loanNo: string;
  lender: string;
  principal: number;
  annualRate: number;
  startDate: string;
  tenureMonths: number;
  emiAmount: number;
  status: LoanStatus;
  paidCount: number;
  outstanding: number;
  nextDueDate: string | null;
}

interface RawScheduleLite {
  principal_component: number;
  balance: number;
  due_date: string;
  paid: boolean;
}

type RawLoan = Pick<
  Tables["loans"]["Row"],
  "id" | "loan_no" | "lender" | "principal" | "annual_rate" | "start_date" | "tenure_months" | "emi_amount" | "status"
> & { schedule: RawScheduleLite[] | null };

const LOAN_SELECT =
  "id, loan_no, lender, principal, annual_rate, start_date, tenure_months, emi_amount, status, " +
  "schedule:loan_schedule(principal_component, balance, due_date, paid)";

type LoanCore = Pick<
  Tables["loans"]["Row"],
  "id" | "loan_no" | "lender" | "principal" | "annual_rate" | "start_date" | "tenure_months" | "emi_amount" | "status"
>;

function summarise(r: LoanCore & { schedule: RawScheduleLite[] | null }): LoanRow {
  const sched = (r.schedule ?? []).slice().sort((a, b) => (a.due_date < b.due_date ? -1 : 1));
  const paid = sched.filter((s) => s.paid);
  const unpaid = sched.filter((s) => !s.paid);
  // outstanding = principal still owed = Σ principal_component of unpaid rows
  const outstanding = unpaid.reduce((s, x) => s + Number(x.principal_component), 0);
  return {
    id: r.id,
    loanNo: r.loan_no,
    lender: r.lender,
    principal: Number(r.principal),
    annualRate: Number(r.annual_rate),
    startDate: r.start_date,
    tenureMonths: r.tenure_months,
    emiAmount: Number(r.emi_amount),
    status: r.status,
    paidCount: paid.length,
    outstanding,
    nextDueDate: unpaid[0]?.due_date ?? null,
  };
}

export async function listLoans(opts: { status?: LoanStatus; limit?: number } = {}): Promise<LoanRow[]> {
  const supabase = createClient();
  let q = supabase.from("loans").select(LOAN_SELECT).order("start_date", { ascending: false }).limit(opts.limit ?? 100);
  if (opts.status) q = q.eq("status", opts.status);
  const rows = unwrap(await q.returns<RawLoan[]>(), [] as RawLoan[], "listLoans");
  return rows.map(summarise);
}

export interface ScheduleRow {
  id: string;
  installmentNo: number;
  dueDate: string;
  emiAmount: number;
  principalComponent: number;
  interestComponent: number;
  balance: number;
  paid: boolean;
  paidOn: string | null;
  paymentJournalId: string | null;
}

export interface LoanDetail extends LoanRow {
  note: string | null;
  disburseJournalId: string | null;
  loanAccount: string;
  interestAccount: string;
  totalInterest: number;
  schedule: ScheduleRow[];
}

export async function getLoan(id: string): Promise<LoanDetail | null> {
  const supabase = createClient();
  const res = await supabase
    .from("loans")
    .select(
      "id, loan_no, lender, principal, annual_rate, start_date, tenure_months, emi_amount, status, note, " +
        "disburse_journal_id, loan_account, interest_account, " +
        "schedule:loan_schedule(id, installment_no, due_date, emi_amount, principal_component, interest_component, balance, paid, paid_on, payment_journal_id)",
    )
    .eq("id", id)
    .maybeSingle()
    .returns<
      | (Omit<RawLoan, "schedule"> & {
          note: string | null;
          disburse_journal_id: string | null;
          loan_account: string;
          interest_account: string;
          schedule:
            | {
                id: string;
                installment_no: number;
                due_date: string;
                emi_amount: number;
                principal_component: number;
                interest_component: number;
                balance: number;
                paid: boolean;
                paid_on: string | null;
                payment_journal_id: string | null;
              }[]
            | null;
        })
      | null
    >();
  const r = unwrap(res, null, "getLoan");
  if (!r) return null;

  const schedule: ScheduleRow[] = (r.schedule ?? [])
    .slice()
    .sort((a, b) => a.installment_no - b.installment_no)
    .map((s) => ({
      id: s.id,
      installmentNo: s.installment_no,
      dueDate: s.due_date,
      emiAmount: Number(s.emi_amount),
      principalComponent: Number(s.principal_component),
      interestComponent: Number(s.interest_component),
      balance: Number(s.balance),
      paid: s.paid,
      paidOn: s.paid_on,
      paymentJournalId: s.payment_journal_id,
    }));

  const base = summarise(r);
  return {
    ...base,
    note: r.note,
    disburseJournalId: r.disburse_journal_id,
    loanAccount: r.loan_account,
    interestAccount: r.interest_account,
    totalInterest: schedule.reduce((s, x) => s + x.interestComponent, 0),
    schedule,
  };
}
