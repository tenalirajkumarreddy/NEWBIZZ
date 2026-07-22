// =====================================================================
// lib/data/types.ts — convenient aliases over the generated Database types,
// plus a small result-unwrapping helper shared by every reader wrapper.
//
// These wrappers are READ-ONLY, server-only accessors for the safe reader RPCs
// and read-models (trial balance, AR aging, notifications, permissions). They
// never mutate — every money/stock change still goes through a SECURITY DEFINER
// RPC (Invariant 3). RLS is enforced under the caller's JWT, so these only ever
// return rows the signed-in user is allowed to see.
// =====================================================================
import type { Database } from "@/lib/supabase/database.types";

type Fns = Database["public"]["Functions"];
type Tables = Database["public"]["Tables"];

// ---- RPC return-row shapes (setof readers) ----
export type TrialBalanceRow = Fns["get_trial_balance"]["Returns"][number];
export type ArAgingRow = Fns["get_ar_aging"]["Returns"][number];
export type LicenseDueRow = Fns["licenses_due"]["Returns"][number];

// ---- table rows ----
export type NotificationRow = Tables["notifications"]["Row"];
export type FinancialYearRow = Tables["financial_years"]["Row"];

// ---- enums surfaced in the UI ----
export type NotificationSeverity = Database["public"]["Enums"]["notification_severity"];
export type NotificationStatus = Database["public"]["Enums"]["notification_status"];
export type AccountType = Database["public"]["Enums"]["account_type"];

/**
 * Unwrap a PostgREST `{ data, error }` for a reader. Readers should be resilient:
 * a failed/blocked read returns the supplied fallback and logs, so a dashboard
 * widget degrades to "—" instead of crashing the whole page render.
 */
export function unwrap<T>(
  res: { data: T | null; error: { message: string } | null },
  fallback: T,
  label: string,
): T {
  if (res.error) {
    console.error(`[data:${label}]`, res.error.message);
    return fallback;
  }
  return res.data ?? fallback;
}
