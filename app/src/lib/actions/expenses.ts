"use server";

// =====================================================================
// lib/actions/expenses.ts — Server Actions for Expenses & Petty Cash (§5.6).
//
// Each action invokes one SECURITY DEFINER RPC (Invariant 3/4), then revalidates
// the affected routes. Money moves only on approval (approve_expense posts the
// Dr category / Cr source journal); recording is ledger-neutral.
//
//   recordExpense   → record_expense    (log a pending expense)
//   approveExpense  → approve_expense   (post the journal, decrement the source)
//   rejectExpense   → reject_expense    (terminal, no ledger)
//   topupPettyCash  → topup_petty_cash  (contra Dr 1115 / Cr 1120)
// =====================================================================
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "./sales";
import type { ExpenseCategory, ExpenseSource } from "@/lib/data/expenses";

function fail(label: string, message: string | undefined): { ok: false; error: string } {
  const msg = (message ?? "").trim() || "Something went wrong. Please try again.";
  console.error(`[action:${label}]`, message);
  return { ok: false, error: msg };
}

export interface RecordExpenseInput {
  expense_date: string;
  category: ExpenseCategory;
  account_code: string;
  source: ExpenseSource;
  amount: number;
  user_id?: string;
  note?: string;
  bill_url?: string;
}

export async function recordExpense(input: RecordExpenseInput): Promise<ActionResult<{ expenseId: string }>> {
  if (!(input.amount > 0)) return { ok: false, error: "Amount must be greater than zero." };
  if (!input.account_code) return { ok: false, error: "Pick an expense account." };

  const supabase = createClient();
  const header: { [key: string]: string } = {
    expense_date: input.expense_date,
    category: input.category,
    account_code: input.account_code,
    source: input.source,
    amount: String(input.amount),
  };
  if (input.user_id) header.user_id = input.user_id;
  if (input.note?.trim()) header.note = input.note.trim();
  if (input.bill_url?.trim()) header.bill_url = input.bill_url.trim();

  const res = await supabase.rpc("record_expense", { p_header: header });
  if (res.error || !res.data) return fail("recordExpense", res.error?.message);

  revalidatePath("/expenses");
  return { ok: true, expenseId: res.data as string };
}

export async function approveExpense(expenseId: string): Promise<ActionResult<{ journalId: string }>> {
  if (!expenseId) return { ok: false, error: "Missing expense." };
  const supabase = createClient();
  const res = await supabase.rpc("approve_expense", { p_id: expenseId });
  if (res.error || !res.data) return fail("approveExpense", res.error?.message);

  revalidatePath("/expenses");
  revalidatePath(`/expenses/${expenseId}`);
  revalidatePath("/journal");
  revalidatePath("/trial-balance");
  revalidatePath("/holdings");
  return { ok: true, journalId: res.data as string };
}

export async function rejectExpense(expenseId: string, reason?: string): Promise<ActionResult> {
  if (!expenseId) return { ok: false, error: "Missing expense." };
  const supabase = createClient();
  const res = await supabase.rpc("reject_expense", {
    p_id: expenseId,
    ...(reason?.trim() ? { p_reason: reason.trim() } : {}),
  });
  if (res.error) return fail("rejectExpense", res.error.message);

  revalidatePath("/expenses");
  revalidatePath(`/expenses/${expenseId}`);
  return { ok: true };
}

export async function topupPettyCash(amount: number, date?: string, note?: string): Promise<ActionResult<{ journalId: string }>> {
  if (!(amount > 0)) return { ok: false, error: "Top-up amount must be greater than zero." };
  const supabase = createClient();
  const res = await supabase.rpc("topup_petty_cash", {
    p_amount: amount,
    ...(date ? { p_date: date } : {}),
    ...(note?.trim() ? { p_note: note.trim() } : {}),
  });
  if (res.error || !res.data) return fail("topupPettyCash", res.error?.message);

  revalidatePath("/expenses");
  revalidatePath("/journal");
  revalidatePath("/trial-balance");
  return { ok: true, journalId: res.data as string };
}
