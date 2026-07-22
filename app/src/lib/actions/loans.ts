"use server";

// =====================================================================
// lib/actions/loans.ts — Server Actions for Loans & EMI (§5.8).
//   createLoan → create_loan  (generates the amortization schedule; optional
//                              disbursement Dr bank / Cr loan)
//   payEmi     → pay_emi       (Dr principal + Dr interest / Cr bank)
// =====================================================================
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "./sales";

function fail(label: string, message: string | undefined): { ok: false; error: string } {
  const msg = (message ?? "").trim() || "Something went wrong. Please try again.";
  console.error(`[action:${label}]`, message);
  return { ok: false, error: msg };
}

export interface CreateLoanInput {
  lender: string;
  principal: number;
  annual_rate: number;
  start_date: string;
  tenure_months: number;
  emi_amount?: number;
  note?: string;
  disburse?: boolean;
  deposit_account?: string;
}

export async function createLoan(input: CreateLoanInput): Promise<ActionResult<{ loanId: string }>> {
  if (!input.lender?.trim()) return { ok: false, error: "Name the lender." };
  if (!(input.principal > 0)) return { ok: false, error: "Principal must be greater than zero." };
  if (!(input.tenure_months > 0)) return { ok: false, error: "Tenure must be at least one month." };

  const supabase = createClient();
  const header: { [key: string]: string | number | boolean } = {
    lender: input.lender.trim(),
    principal: input.principal,
    annual_rate: input.annual_rate,
    start_date: input.start_date,
    tenure_months: input.tenure_months,
  };
  if (input.emi_amount != null && input.emi_amount > 0) header.emi_amount = input.emi_amount;
  if (input.note?.trim()) header.note = input.note.trim();
  if (input.disburse) header.disburse = true;
  if (input.deposit_account) header.deposit_account = input.deposit_account;

  const res = await supabase.rpc("create_loan", { p_header: header });
  if (res.error || !res.data) return fail("createLoan", res.error?.message);

  revalidatePath("/loans");
  revalidatePath("/trial-balance");
  return { ok: true, loanId: res.data as string };
}

export async function payEmi(
  scheduleId: string,
  loanId: string,
  date: string,
  payAccount?: string,
): Promise<ActionResult<{ journalId: string }>> {
  if (!scheduleId) return { ok: false, error: "Missing installment." };

  const supabase = createClient();
  const res = await supabase.rpc("pay_emi", {
    p_schedule: scheduleId,
    p_date: date,
    ...(payAccount ? { p_pay_account: payAccount } : {}),
  });
  if (res.error || !res.data) return fail("payEmi", res.error?.message);

  revalidatePath("/loans");
  revalidatePath(`/loans/${loanId}`);
  revalidatePath("/journal");
  revalidatePath("/trial-balance");
  return { ok: true, journalId: res.data as string };
}
