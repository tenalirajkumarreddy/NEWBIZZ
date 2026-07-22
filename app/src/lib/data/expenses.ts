// =====================================================================
// lib/data/expenses.ts — server-only readers for Expenses & Petty Cash (§5.6).
//
// An expense is captured pending, then approved (posts Dr category / Cr source)
// or rejected. Money only moves on approval, via post_journal (Invariant 3).
// Reads only; writes go through the SECURITY DEFINER RPCs in
// lib/actions/expenses.ts.
// =====================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getCurrentFy } from "./fy";
import { unwrap } from "./types";
import type { Database } from "@/lib/supabase/database.types";

type Tables = Database["public"]["Tables"];
export type ExpenseCategory = Database["public"]["Enums"]["expense_category"];
export type ExpenseSource = Database["public"]["Enums"]["expense_source"];
export type ExpenseStatus = Database["public"]["Enums"]["expense_status"];

export interface ExpenseRow {
  id: string;
  expenseNo: string;
  expenseDate: string;
  category: ExpenseCategory;
  source: ExpenseSource;
  amount: number;
  status: ExpenseStatus;
  accountCode: string;
  accountName: string | null;
  userName: string | null;
  note: string | null;
  billUrl: string | null;
  journalId: string | null;
  createdAt: string;
}

const EXPENSE_SELECT =
  "id, expense_no, expense_date, category, source, amount, status, account_code, " +
  "note, bill_url, journal_id, created_at, " +
  "account:chart_of_accounts!expenses_account_code_fkey(name), " +
  "spender:users!expenses_user_id_fkey(full_name)";

type RawExpense = Pick<
  Tables["expenses"]["Row"],
  | "id" | "expense_no" | "expense_date" | "category" | "source" | "amount"
  | "status" | "account_code" | "note" | "bill_url" | "journal_id" | "created_at"
> & {
  account: { name: string } | null;
  spender: { full_name: string } | null;
};

function toRow(r: RawExpense): ExpenseRow {
  return {
    id: r.id,
    expenseNo: r.expense_no,
    expenseDate: r.expense_date,
    category: r.category,
    source: r.source,
    amount: Number(r.amount),
    status: r.status,
    accountCode: r.account_code,
    accountName: r.account?.name ?? null,
    userName: r.spender?.full_name ?? null,
    note: r.note,
    billUrl: r.bill_url,
    journalId: r.journal_id,
    createdAt: r.created_at,
  };
}

/** Recent expenses, newest first. Optional status filter (e.g. the pending queue). */
export async function listExpenses(opts: { status?: ExpenseStatus; limit?: number } = {}): Promise<ExpenseRow[]> {
  const supabase = createClient();
  let q = supabase
    .from("expenses")
    .select(EXPENSE_SELECT)
    .order("expense_date", { ascending: false })
    .order("expense_no", { ascending: false })
    .limit(opts.limit ?? 200);
  if (opts.status) q = q.eq("status", opts.status);
  const rows = unwrap(await q.returns<RawExpense[]>(), [] as RawExpense[], "listExpenses");
  return rows.map(toRow);
}

export interface ExpenseDetail extends ExpenseRow {
  fyId: string;
  rejectReason: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
}

export async function getExpense(id: string): Promise<ExpenseDetail | null> {
  const supabase = createClient();
  const res = await supabase
    .from("expenses")
    .select(EXPENSE_SELECT + ", fy_id, reject_reason, approved_at, rejected_at")
    .eq("id", id)
    .maybeSingle()
    .returns<
      | (RawExpense & {
          fy_id: string;
          reject_reason: string | null;
          approved_at: string | null;
          rejected_at: string | null;
        })
      | null
    >();
  const r = unwrap(res, null, "getExpense");
  if (!r) return null;
  return {
    ...toRow(r),
    fyId: r.fy_id,
    rejectReason: r.reject_reason,
    approvedAt: r.approved_at,
    rejectedAt: r.rejected_at,
  };
}

/** Postable expense-type ledger accounts for the "which account" picker. */
export interface ExpenseAccountOption {
  code: string;
  name: string;
}

export async function listExpenseAccounts(): Promise<ExpenseAccountOption[]> {
  const supabase = createClient();
  const res = await supabase
    .from("chart_of_accounts")
    .select("code, name, type, is_postable, status")
    .eq("type", "expense")
    .eq("is_postable", true)
    .eq("status", "active")
    .order("code");
  type Raw = { code: string; name: string };
  const rows = unwrap(res, [] as Raw[], "listExpenseAccounts");
  return rows.map((r) => ({ code: r.code, name: r.name }));
}

/**
 * Current petty-cash balance (1115) for the FY — net debits from the balance
 * read-model. Petty cash is a debit-normal asset, so balance = Dr − Cr.
 */
export async function getPettyCashBalance(): Promise<number> {
  const supabase = createClient();
  const fy = await getCurrentFy();
  if (!fy) return 0;
  const acct = await supabase.from("chart_of_accounts").select("id").eq("code", "1115").maybeSingle();
  const acctId = (acct.data as { id: string } | null)?.id;
  if (!acctId) return 0;
  const res = await supabase
    .from("account_balances")
    .select("debit_total, credit_total")
    .eq("account_id", acctId)
    .eq("fy_id", fy.id)
    .maybeSingle();
  const r = res.data as { debit_total: number; credit_total: number } | null;
  if (!r) return 0;
  return Number(r.debit_total) - Number(r.credit_total);
}
