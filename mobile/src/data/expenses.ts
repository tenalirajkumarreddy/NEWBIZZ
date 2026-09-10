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
