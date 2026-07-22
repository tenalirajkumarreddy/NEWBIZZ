// =====================================================================
// lib/data/fy.ts — resolve the "current" financial year for reads.
//
// Business logic runs in IST (Invariant 9). We ask the DB which FY a given
// business date falls in via fy_for_date(), defaulting to today (IST). The FY
// row (code, dates, status) is then fetched for display + as the p_fy argument
// the accounting readers require.
// =====================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { FinancialYearRow } from "./types";

/** Today's date as an IST YYYY-MM-DD string, for date-scoped RPC args. */
export function todayIST(): string {
  // en-CA yields ISO-style YYYY-MM-DD; the timeZone shifts the civil date to IST.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * The financial year covering `onDate` (default: today IST), or null if none is
 * configured for that date. Uses fy_for_date() to pick the id, then reads the row.
 */
export async function getCurrentFy(onDate?: string): Promise<FinancialYearRow | null> {
  const supabase = createClient();
  const date = onDate ?? todayIST();

  const { data: fyId, error: fyErr } = await supabase.rpc("fy_for_date", { p_date: date });
  if (fyErr || !fyId) {
    if (fyErr) console.error("[data:getCurrentFy:fy_for_date]", fyErr.message);
    return null;
  }

  const { data, error } = await supabase
    .from("financial_years")
    .select("*")
    .eq("id", fyId)
    .maybeSingle();
  if (error) {
    console.error("[data:getCurrentFy:row]", error.message);
    return null;
  }
  return data;
}
