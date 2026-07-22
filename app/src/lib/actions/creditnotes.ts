"use server";

// =====================================================================
// lib/actions/creditnotes.ts — Server Actions for Credit Notes, Sales
// Returns, and Schemes (§4.5 / §7.5).
//
// Every posting goes through one SECURITY DEFINER RPC (Invariant 3/4) then
// revalidates the affected routes. Credit notes reduce AR via journal_lines;
// no cash ever leaves. Scheme masters are a commercial master edited directly
// (no money impact until a rebate is posted as a credit note).
//
//   recordSalesReturn      → record_sales_return       (reverse invoice + restock)
//   calcSchemeEligibility   → calc_scheme_eligibility   (month-end volume calc)
//   postSchemeCreditNote    → post_scheme_credit_note   (approve + post rebate)
//   postComplaintCreditNote → post_complaint_credit_note (resolve complaint)
//   createScheme/updateScheme (direct table write — commercial master)
// =====================================================================

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "./sales";
import type { Database } from "@/lib/supabase/database.types";

function fail(label: string, message: string | undefined): { ok: false; error: string } {
  const msg = (message ?? "").trim() || "Something went wrong. Please try again.";
  console.error(`[action:${label}]`, message);
  return { ok: false, error: msg };
}

// ---- sales returns (§4.5) ----

export interface SalesReturnLineInput {
  invoice_line_id: string;
  qty: number;
}

export interface RecordSalesReturnInput {
  invoice_id: string;
  date?: string; // ISO date; RPC defaults to today
  narration?: string;
  lines: SalesReturnLineInput[];
}

/**
 * Record a sales return against a posted invoice via record_sales_return: the
 * RPC reverses the exact tax, reverses COGS at the original unit cost, restocks
 * the goods, and issues a customer credit note (reason 'sales_adjustment') that
 * reduces AR. Rejects over-return. Returns the new credit-note id.
 */
export async function recordSalesReturn(
  input: RecordSalesReturnInput,
): Promise<ActionResult<{ creditNoteId: string }>> {
  if (!input.invoice_id) return { ok: false, error: "Missing invoice for the return." };

  const lines = (input.lines ?? []).filter((l) => l.invoice_line_id && Number(l.qty) > 0);
  if (lines.length === 0) return { ok: false, error: "Enter a return quantity on at least one line." };

  const supabase = createClient();
  const opts: { [key: string]: string } = {};
  if (input.date) opts.date = input.date;
  if (input.narration?.trim()) opts.narration = input.narration.trim();

  const res = await supabase.rpc("record_sales_return", {
    p_invoice: input.invoice_id,
    p_lines: lines.map((l) => ({ invoice_line_id: l.invoice_line_id, qty: Number(l.qty) })),
    p_opts: opts,
  });

  if (res.error || !res.data) return fail("recordSalesReturn", res.error?.message);

  revalidatePath("/credit-notes");
  revalidatePath(`/invoices/${input.invoice_id}`);
  revalidatePath("/stock");
  return { ok: true, creditNoteId: res.data };
}

// ---- schemes (§7.5) ----

/**
 * Month-end volume calc for a scheme via calc_scheme_eligibility: sums each
 * store's case volume over the window, picks the highest tier met, and writes
 * pending_approval eligibility rows. Returns the number of stores written.
 */
export async function calcSchemeEligibility(
  schemeId: string,
): Promise<ActionResult<{ rows: number }>> {
  if (!schemeId) return { ok: false, error: "Missing scheme." };

  const supabase = createClient();
  const res = await supabase.rpc("calc_scheme_eligibility", { p_scheme: schemeId });
  if (res.error) return fail("calcSchemeEligibility", res.error.message);

  revalidatePath(`/credit-notes/schemes/${schemeId}`);
  return { ok: true, rows: res.data ?? 0 };
}

/**
 * Post an approved scheme rebate as a credit note via post_scheme_credit_note.
 * Reverses proportional output GST if the scheme is gst_adjusted. Returns the
 * new credit-note id.
 */
export async function postSchemeCreditNote(
  eligibilityId: string,
  schemeId?: string,
): Promise<ActionResult<{ creditNoteId: string }>> {
  if (!eligibilityId) return { ok: false, error: "Missing eligibility row." };

  const supabase = createClient();
  const res = await supabase.rpc("post_scheme_credit_note", { p_eligibility: eligibilityId });
  if (res.error || !res.data) return fail("postSchemeCreditNote", res.error?.message);

  revalidatePath("/credit-notes");
  if (schemeId) revalidatePath(`/credit-notes/schemes/${schemeId}`);
  return { ok: true, creditNoteId: res.data };
}

/**
 * Resolve a complaint by issuing a credit note via post_complaint_credit_note.
 * `gstAdjusted`/`taxAmount` follow the §4.5 return template when the credit is
 * raised against an official sale. Returns the new credit-note id.
 */
export async function postComplaintCreditNote(
  complaintId: string,
  amount: number,
  opts: { narration?: string; gstAdjusted?: boolean; taxAmount?: number } = {},
): Promise<ActionResult<{ creditNoteId: string }>> {
  if (!complaintId) return { ok: false, error: "Missing complaint." };
  if (!(amount > 0)) return { ok: false, error: "Credit amount must be greater than zero." };

  const supabase = createClient();
  const p_opts: { [key: string]: string | number | boolean } = {};
  if (opts.narration?.trim()) p_opts.narration = opts.narration.trim();
  if (opts.gstAdjusted) p_opts.gst_adjusted = true;
  if (opts.taxAmount && opts.taxAmount > 0) p_opts.tax_amount = opts.taxAmount;

  const res = await supabase.rpc("post_complaint_credit_note", {
    p_complaint: complaintId,
    p_amount: amount,
    p_opts,
  });
  if (res.error || !res.data) return fail("postComplaintCreditNote", res.error?.message);

  revalidatePath("/credit-notes");
  revalidatePath("/crm");
  return { ok: true, creditNoteId: res.data };
}

// ---- scheme master (direct table write; commercial master, no money impact) ----

type SchemeInsert = Database["public"]["Tables"]["schemes"]["Insert"];
type SchemeUpdate = Database["public"]["Tables"]["schemes"]["Update"];

export interface SchemeInput {
  name: string;
  period_start: string;
  period_end: string;
  tiers: { min_cases: number; rebate_per_case: number }[];
  gst_adjusted: boolean;
  gst_rate: number;
  eligibility?: string;
  notes?: string;
}

export async function createScheme(input: SchemeInput): Promise<ActionResult<{ schemeId: string }>> {
  if (!input.name?.trim()) return { ok: false, error: "Give the scheme a name." };
  if (!input.period_start || !input.period_end) return { ok: false, error: "Set the scheme window." };
  if (input.period_end < input.period_start) return { ok: false, error: "End date is before the start." };

  const supabase = createClient();
  const payload: SchemeInsert = {
    name: input.name.trim(),
    period_start: input.period_start,
    period_end: input.period_end,
    tiers_json: input.tiers,
    gst_adjusted: input.gst_adjusted,
    gst_rate: input.gst_adjusted ? input.gst_rate : 0,
    eligibility: input.eligibility ?? "global",
    notes: input.notes?.trim() || null,
  };
  const res = await supabase.from("schemes").insert(payload).select("id").maybeSingle();
  if (res.error || !res.data) return fail("createScheme", res.error?.message);

  revalidatePath("/credit-notes/schemes");
  return { ok: true, schemeId: res.data.id };
}

export async function closeScheme(schemeId: string): Promise<ActionResult> {
  if (!schemeId) return { ok: false, error: "Missing scheme." };
  const supabase = createClient();
  const patch: SchemeUpdate = { status: "closed" };
  const res = await supabase.from("schemes").update(patch).eq("id", schemeId);
  if (res.error) return fail("closeScheme", res.error.message);

  revalidatePath("/credit-notes/schemes");
  revalidatePath(`/credit-notes/schemes/${schemeId}`);
  return { ok: true };
}
