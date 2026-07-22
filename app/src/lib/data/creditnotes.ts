// =====================================================================
// lib/data/creditnotes.ts — server-only readers for Credit Notes, Sales
// Returns, and Schemes (§4.5 / §7.5).
//
// A credit note is the AR-reducing money document: scheme rebates, complaint
// credits, and sales returns all land here (reason distinguishes them). Its
// journal_entry_id carries the posted truth (Invariant 1/3). Schemes drive
// volume rebates; scheme_eligibility is the per-store achievement that a
// manager approves and posts. Reads only — every posting goes through a
// SECURITY DEFINER RPC in lib/actions/creditnotes.ts.
// =====================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrap } from "./types";
import type { Database } from "@/lib/supabase/database.types";

type Tables = Database["public"]["Tables"];
export type CreditNoteReason = Database["public"]["Enums"]["credit_note_reason"];
export type CreditNoteStatus = Database["public"]["Enums"]["credit_note_status"];
export type SchemeStatus = Database["public"]["Enums"]["scheme_status"];
export type SchemeEligibilityStatus = Database["public"]["Enums"]["scheme_eligibility_status"];

// ---- credit notes ----

export interface CreditNoteListRow {
  id: string;
  credit_note_no: string;
  status: CreditNoteStatus;
  reason: CreditNoteReason;
  customerName: string | null;
  storeName: string | null;
  amount: number;
  baseAmount: number;
  taxAmount: number;
  referenceSaleId: string | null;
  referenceInvoiceNo: string | null;
  createdAt: string;
}

export interface CreditNoteReturnLine {
  id: string;
  itemName: string | null;
  sku: string | null;
  qty: number;
  unitCogs: number;
  taxableAmount: number;
  taxAmount: number;
  line_no: number;
}

export interface CreditNoteDetail extends CreditNoteListRow {
  narration: string | null;
  journalEntryId: string | null;
  returnLines: CreditNoteReturnLine[];
}

const CN_SELECT =
  "id, credit_note_no, status, reason, amount, base_amount, tax_amount, " +
  "reference_sale_id, journal_entry_id, narration, created_at, " +
  "customer:customers(name), store:customer_stores(name), " +
  "invoice:invoices!credit_notes_reference_sale_id_fkey(invoice_no)";

type RawCreditNote = Pick<
  Tables["credit_notes"]["Row"],
  | "id" | "credit_note_no" | "status" | "reason" | "amount" | "base_amount"
  | "tax_amount" | "reference_sale_id" | "journal_entry_id" | "narration" | "created_at"
> & {
  customer: { name: string } | null;
  store: { name: string } | null;
  invoice: { invoice_no: string } | null;
};

function toListRow(r: RawCreditNote): CreditNoteListRow {
  return {
    id: r.id,
    credit_note_no: r.credit_note_no,
    status: r.status,
    reason: r.reason,
    customerName: r.customer?.name ?? null,
    storeName: r.store?.name ?? null,
    amount: Number(r.amount),
    baseAmount: Number(r.base_amount),
    taxAmount: Number(r.tax_amount),
    referenceSaleId: r.reference_sale_id,
    referenceInvoiceNo: r.invoice?.invoice_no ?? null,
    createdAt: r.created_at,
  };
}

/** Recent credit notes, newest first. Optionally filter by reason. */
export async function listCreditNotes(opts: {
  reason?: CreditNoteReason;
  limit?: number;
} = {}): Promise<CreditNoteListRow[]> {
  const supabase = createClient();
  let q = supabase
    .from("credit_notes")
    .select(CN_SELECT)
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 100);
  if (opts.reason) q = q.eq("reason", opts.reason);

  const rows = unwrap(await q.returns<RawCreditNote[]>(), [] as RawCreditNote[], "listCreditNotes");
  return rows.map(toListRow);
}

/** One credit note with its sales-return lines (if any), or null. */
export async function getCreditNote(id: string): Promise<CreditNoteDetail | null> {
  const supabase = createClient();
  const res = await supabase
    .from("credit_notes")
    .select(
      CN_SELECT +
        ", return_lines:sales_return_lines(id, qty, unit_cogs, taxable_amount, tax_amount, line_no, item:items(name, sku))",
    )
    .eq("id", id)
    .maybeSingle()
    .returns<
      | (RawCreditNote & {
          return_lines:
            | {
                id: string;
                qty: number;
                unit_cogs: number;
                taxable_amount: number;
                tax_amount: number;
                line_no: number;
                item: { name: string; sku: string } | null;
              }[]
            | null;
        })
      | null
    >();
  const r = unwrap(res, null, "getCreditNote");
  if (!r) return null;

  const returnLines: CreditNoteReturnLine[] = (r.return_lines ?? [])
    .slice()
    .sort((a, b) => a.line_no - b.line_no)
    .map((l) => ({
      id: l.id,
      itemName: l.item?.name ?? null,
      sku: l.item?.sku ?? null,
      qty: Number(l.qty),
      unitCogs: Number(l.unit_cogs),
      taxableAmount: Number(l.taxable_amount),
      taxAmount: Number(l.tax_amount),
      line_no: l.line_no,
    }));

  return {
    ...toListRow(r),
    narration: r.narration,
    journalEntryId: r.journal_entry_id,
    returnLines,
  };
}

// ---- schemes ----

export interface SchemeTier {
  min_cases: number;
  rebate_per_case: number;
}

export interface SchemeListRow {
  id: string;
  name: string;
  status: SchemeStatus;
  periodStart: string;
  periodEnd: string;
  gstAdjusted: boolean;
  gstRate: number;
  tiers: SchemeTier[];
  eligibleStores: number;
  pendingApproval: number;
}

export interface SchemeEligibilityRow {
  id: string;
  storeName: string | null;
  customerName: string | null;
  totalVolume: number;
  tierAchieved: number | null;
  rebateAmount: number;
  status: SchemeEligibilityStatus;
  creditNoteId: string | null;
}

export interface SchemeDetail extends SchemeListRow {
  targetType: string;
  eligibility: string;
  notes: string | null;
  rows: SchemeEligibilityRow[];
}

/**
 * Already-returned quantity per invoice line, keyed by invoice_line_id, across
 * all prior sales returns for an invoice. Drives the return form's "remaining"
 * preview; the RPC is authoritative and rejects over-return regardless.
 */
export async function getReturnedByLine(invoiceId: string): Promise<Record<string, number>> {
  const supabase = createClient();
  const res = await supabase
    .from("sales_return_lines")
    .select("invoice_line_id, qty")
    .eq("invoice_id", invoiceId);
  type Raw = { invoice_line_id: string; qty: number };
  const rows = unwrap(res, [] as Raw[], "getReturnedByLine");
  const map: Record<string, number> = {};
  for (const r of rows) {
    map[r.invoice_line_id] = (map[r.invoice_line_id] ?? 0) + Number(r.qty);
  }
  return map;
}

function parseTiers(raw: unknown): SchemeTier[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t) => {
      const o = (t ?? {}) as Record<string, unknown>;
      return { min_cases: Number(o.min_cases ?? 0), rebate_per_case: Number(o.rebate_per_case ?? 0) };
    })
    .sort((a, b) => a.min_cases - b.min_cases);
}

type RawScheme = Pick<
  Tables["schemes"]["Row"],
  | "id" | "name" | "status" | "period_start" | "period_end" | "gst_adjusted"
  | "gst_rate" | "tiers_json" | "target_type" | "eligibility" | "notes"
> & {
  eligibility_rows: { status: SchemeEligibilityStatus }[] | null;
};

/** All schemes, newest window first, with an eligibility roll-up. */
export async function listSchemes(): Promise<SchemeListRow[]> {
  const supabase = createClient();
  const res = await supabase
    .from("schemes")
    .select(
      "id, name, status, period_start, period_end, gst_adjusted, gst_rate, tiers_json, target_type, eligibility, notes, " +
        "eligibility_rows:scheme_eligibility(status)",
    )
    .order("period_start", { ascending: false })
    .returns<RawScheme[]>();
  const rows = unwrap(res, [] as RawScheme[], "listSchemes");
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    gstAdjusted: r.gst_adjusted,
    gstRate: Number(r.gst_rate),
    tiers: parseTiers(r.tiers_json),
    eligibleStores: r.eligibility_rows?.length ?? 0,
    pendingApproval: (r.eligibility_rows ?? []).filter((e) => e.status === "pending_approval").length,
  }));
}

/** One scheme with its per-store eligibility rows, or null. */
export async function getScheme(id: string): Promise<SchemeDetail | null> {
  const supabase = createClient();
  const res = await supabase
    .from("schemes")
    .select(
      "id, name, status, period_start, period_end, gst_adjusted, gst_rate, tiers_json, target_type, eligibility, notes, " +
        "rows:scheme_eligibility(id, total_volume, tier_achieved, rebate_amount, status, credit_note_id, " +
        "store:customer_stores(name, customer:customers(name)))",
    )
    .eq("id", id)
    .maybeSingle()
    .returns<
      | (Omit<RawScheme, "eligibility_rows"> & {
          rows:
            | {
                id: string;
                total_volume: number;
                tier_achieved: number | null;
                rebate_amount: number;
                status: SchemeEligibilityStatus;
                credit_note_id: string | null;
                store: { name: string; customer: { name: string } | null } | null;
              }[]
            | null;
        })
      | null
    >();
  const r = unwrap(res, null, "getScheme");
  if (!r) return null;

  const rows: SchemeEligibilityRow[] = (r.rows ?? [])
    .slice()
    .sort((a, b) => b.rebate_amount - a.rebate_amount)
    .map((e) => ({
      id: e.id,
      storeName: e.store?.name ?? null,
      customerName: e.store?.customer?.name ?? null,
      totalVolume: Number(e.total_volume),
      tierAchieved: e.tier_achieved,
      rebateAmount: Number(e.rebate_amount),
      status: e.status,
      creditNoteId: e.credit_note_id,
    }));

  return {
    id: r.id,
    name: r.name,
    status: r.status,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    gstAdjusted: r.gst_adjusted,
    gstRate: Number(r.gst_rate),
    tiers: parseTiers(r.tiers_json),
    eligibleStores: rows.length,
    pendingApproval: rows.filter((e) => e.status === "pending_approval").length,
    targetType: r.target_type,
    eligibility: r.eligibility,
    notes: r.notes,
    rows,
  };
}
