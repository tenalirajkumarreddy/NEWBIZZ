// =====================================================================
// lib/data/licenses.ts — typed reader for licences approaching expiry.
//
// licenses_due(p_as_of) returns statutory licences (FSSAI, trade, pollution,
// etc.) with days-to-expiry and an is_expired flag, as of a business date.
// =====================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { todayIST } from "./fy";
import { unwrap, type LicenseDueRow } from "./types";

/**
 * Licences due for renewal as of `asOf` (default: today IST). The DB decides the
 * lookahead window; rows already past expiry carry is_expired = true.
 */
export async function getLicensesDue(asOf?: string): Promise<LicenseDueRow[]> {
  const supabase = createClient();
  const res = await supabase.rpc("licenses_due", { p_as_of: asOf ?? todayIST() });
  return unwrap(res, [], "getLicensesDue");
}

/** Split due licences into expired vs. still-valid-but-expiring, for badge tones. */
export function partitionLicenses(rows: LicenseDueRow[]): {
  expired: LicenseDueRow[];
  expiring: LicenseDueRow[];
} {
  const expired: LicenseDueRow[] = [];
  const expiring: LicenseDueRow[] = [];
  for (const r of rows) (r.is_expired ? expired : expiring).push(r);
  return { expired, expiring };
}
