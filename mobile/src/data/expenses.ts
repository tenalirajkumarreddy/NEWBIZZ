import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { rpc } from "@/lib/rpc";
import { qk } from "./keys";

export type ExpenseCategory = "fuel" | "repair" | "salary" | "rent" | "power" | "transport" | "office" | "bank_charges" | "misc";
export type ExpenseStatus = "pending" | "approved" | "rejected";

export const FIELD_CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: "fuel", label: "Fuel" },
  { value: "transport", label: "Transport" },
  { value: "repair", label: "Repair" },
  { value: "misc", label: "Misc" },
];

export interface MyExpenseRow {
  id: string;
  expenseNo: string;
  expenseDate: string;
  category: ExpenseCategory;
  amount: number;
  status: ExpenseStatus;
  note: string | null;
  createdAt: string;
}

/** The signer's own expense submissions (last 30 days), newest first. */
export function useMyExpenses() {
  const { user } = useSession();
  return useQuery({
    queryKey: qk.expenses(),
    enabled: !!user?.id,
    queryFn: async (): Promise<MyExpenseRow[]> => {
      const uid = user!.id;
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("expenses")
        .select("id, expense_no, expense_date, category, amount, status, note, created_at")
        .eq("created_by", uid)
        .gte("created_at", since)
        .order("expense_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        expenseNo: r.expense_no,
        expenseDate: r.expense_date,
        category: r.category,
        amount: Number(r.amount ?? 0),
        status: r.status,
        note: r.note ?? null,
        createdAt: r.created_at as string,
      }));
    },
  });
}

export interface PendingExpenseRow {
  id: string;
  expenseNo: string;
  expenseDate: string;
  category: ExpenseCategory;
  source: "user_holding" | "petty_cash" | "bank";
  amount: number;
  note: string | null;
  spenderName: string | null;
  createdAt: string;
}

/** Manager queue: every pending expense, newest first. */
export function usePendingExpenses() {
  const { user } = useSession();
  return useQuery({
    queryKey: qk.pendingExpenses(),
    enabled: !!user?.id,
    queryFn: async (): Promise<PendingExpenseRow[]> => {
      const { data, error } = await supabase
        .from("expenses")
        .select(
          "id, expense_no, expense_date, category, source, amount, note, created_at, " +
            "spender:users!expenses_user_id_fkey(full_name)",
        )
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(50);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        expenseNo: r.expense_no,
        expenseDate: r.expense_date,
        category: r.category,
        source: r.source,
        amount: Number(r.amount ?? 0),
        note: r.note ?? null,
        spenderName: (r.spender?.full_name as string | undefined) ?? null,
        createdAt: r.created_at as string,
      }));
    },
  });
}

/** Approve a pending expense (expense.manage) - posts Dr category / Cr source. */
export async function approveExpense(expenseId: string): Promise<string> {
  return rpc<string>("approve_expense", { p_id: expenseId });
}

/** Reject a pending expense (expense.manage) - terminal, no ledger movement. */
export async function rejectExpense(expenseId: string, reason?: string | null): Promise<void> {
  await rpc("reject_expense", reason?.trim() ? { p_id: expenseId, p_reason: reason.trim() } : { p_id: expenseId });
}

/**
 * Submit a field expense from the signer's own cash custody. It stays
 * pending until a manager approves (money leaves custody only on approval).
 * The server resolves the GL account from the category and forces
 * source='user_holding' / user_id=caller for expense.submit holders.
 */
export async function submitMyExpense(input: {
  category: ExpenseCategory;
  amount: number;
  note?: string | null;
  expenseDate?: string;
}): Promise<string> {
  const header: Record<string, string> = {
    category: input.category,
    amount: String(input.amount),
    source: "user_holding",
    expense_date: input.expenseDate ?? todayIST(),
  };
  if (input.note?.trim()) header.note = input.note.trim();
  return rpc<string>("submit_my_expense", { p_header: header });
}

function todayIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export function yesterdayIST(): string {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}
