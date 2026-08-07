"use server";

// =====================================================================
// lib/actions/collections.ts — Server Actions for Collections (§4.6).
//
// recordReceipt is the only mutation: it calls the record_receipt SECURITY
// DEFINER RPC (Invariant 3), which in one transaction posts
// Dr cash/bank/custody / Cr AR(customer), writes the receipt + allocations,
// and maintains invoices.amount_paid (Invariant 5). We validate shape here;
// the RPC owns every money rule (allocation ≤ outstanding, etc.).
// =====================================================================

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "./sales";

function fail(label: string, message: string | undefined): { ok: false; error: string } {
  const msg = (message ?? "").trim() || "Something went wrong. Please try again.";
  console.error(`[action:${label}]`, message);
  return { ok: false, error: msg };
}

export interface RecordReceiptInput {
  customer_id: string;
  store_id: string;
  receipt_date?: string;
  method_id: string;
  amount: number;
  reference?: string;
  deposit_account?: string;
  notes?: string;
}

/** Record a payment. The RPC auto-allocates against open invoices (oldest first). */
export async function recordReceipt(
  input: RecordReceiptInput,
): Promise<ActionResult<{ receiptId: string }>> {
  if (!input.customer_id) return { ok: false, error: "Select the paying customer." };
  if (!input.store_id) return { ok: false, error: "Select the store receiving payment." };
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0)
    return { ok: false, error: "Enter a receipt amount greater than zero." };
  if (!input.method_id) return { ok: false, error: "Pick how the money came in." };

  const supabase = createClient();
  const header: Record<string, string | number> = {
    customer_id: input.customer_id,
    store_id: input.store_id,
    method_id: input.method_id,
    amount,
  };
  if (input.receipt_date) header.receipt_date = input.receipt_date;
  if (input.reference?.trim()) header.reference = input.reference.trim();
  if (input.deposit_account) header.deposit_account = input.deposit_account;
  if (input.notes?.trim()) header.notes = input.notes.trim();

  const res = await supabase.rpc("record_receipt", { p_header: header });

  if (res.error || !res.data) return fail("recordReceipt", res.error?.message);

  revalidatePath("/receipts");
  revalidatePath("/invoices");
  revalidatePath("/sales");
  revalidatePath("/");
  return { ok: true, receiptId: res.data };
}

export interface ReconcileIntentInput {
  intent_id: string;
  store_id: string;
  method_id: string;
  receipt_date?: string;
  deposit_account?: string;
}

/**
 * Convert a customer's portal "I paid" suggestion into a posted receipt.
 * The RPC pulls customer/amount from the intent row; the caller only picks
 * where it was collected and the instrument.
 */
export async function reconcilePaymentIntent(
  input: ReconcileIntentInput,
): Promise<ActionResult<{ receiptId: string }>> {
  if (!input.intent_id) return { ok: false, error: "Intent missing." };
  if (!input.store_id) return { ok: false, error: "Select the store receiving payment." };
  if (!input.method_id) return { ok: false, error: "Pick how the money came in." };

  const supabase = createClient();
  const res = await supabase.rpc("reconcile_payment_intent", {
    p_intent_id: input.intent_id,
    p_store_id: input.store_id,
    p_method_id: input.method_id,
    ...(input.receipt_date?.trim() ? { p_receipt_date: input.receipt_date.trim() } : {}),
    ...(input.deposit_account?.trim() ? { p_deposit_account: input.deposit_account.trim() } : {}),
  });

  if (res.error || !res.data) return fail("reconcilePaymentIntent", res.error?.message);

  revalidatePath("/receipts");
  revalidatePath("/invoices");
  revalidatePath("/sales");
  revalidatePath("/");
  return { ok: true, receiptId: res.data };
}

/** Void a customer's pending "I paid" suggestion (no ledger impact). */
export async function voidPaymentIntent(
  intentId: string,
  reason?: string,
): Promise<ActionResult> {
  if (!intentId) return { ok: false, error: "Intent missing." };

  const supabase = createClient();
  const res = await supabase.rpc("void_payment_intent", {
    p_intent_id: intentId,
    ...(reason?.trim() ? { p_reason: reason.trim() } : {}),
  });

  if (res.error) return fail("voidPaymentIntent", res.error?.message);

  revalidatePath("/receipts");
  return { ok: true };
}
