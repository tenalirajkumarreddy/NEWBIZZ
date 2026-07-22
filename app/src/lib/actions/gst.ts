"use server";

// =====================================================================
// lib/actions/gst.ts — Server Actions for GSTR-2B import & reconciliation
// (§5.9). The report reads are plain data readers; the only mutations are
// importing a 2B statement and reconciling it against recorded bills.
//   importGstr2b   → import_gstr2b     (store the uploaded rows)
//   reconcileGstr2b → reconcile_gstr2b (match rows to supplier bills)
// =====================================================================
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "./sales";
import type { Json } from "@/lib/supabase/database.types";

function fail(label: string, message: string | undefined): { ok: false; error: string } {
  const msg = (message ?? "").trim() || "Something went wrong. Please try again.";
  console.error(`[action:${label}]`, message);
  return { ok: false, error: msg };
}

export interface Gstr2bInputRow {
  supplier_gstin?: string;
  invoice_no?: string;
  invoice_date?: string;
  taxable?: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
  cess?: number;
}

export async function importGstr2b(
  period: string,
  rows: Gstr2bInputRow[],
  filename?: string,
): Promise<ActionResult<{ importId: string }>> {
  if (!/^\d{4}-\d{2}$/.test(period)) return { ok: false, error: "Pick a valid period (YYYY-MM)." };
  const clean = (rows ?? []).filter(
    (r) => r.supplier_gstin || r.invoice_no || Number(r.taxable) > 0,
  );
  if (clean.length === 0) return { ok: false, error: "Add at least one 2B row." };

  const supabase = createClient();
  const res = await supabase.rpc("import_gstr2b", {
    p_period: period,
    p_filename: filename ?? "",
    p_rows: clean as unknown as Json,
  });
  if (res.error || !res.data) return fail("importGstr2b", res.error?.message);

  revalidatePath("/gst/2b");
  return { ok: true, importId: res.data as string };
}

export async function reconcileGstr2b(importId: string): Promise<ActionResult<{ matched: number }>> {
  if (!importId) return { ok: false, error: "Missing import." };
  const supabase = createClient();
  const res = await supabase.rpc("reconcile_gstr2b", { p_import: importId });
  if (res.error) return fail("reconcileGstr2b", res.error.message);

  revalidatePath("/gst/2b");
  revalidatePath(`/gst/2b/${importId}`);
  return { ok: true, matched: (res.data as number) ?? 0 };
}
