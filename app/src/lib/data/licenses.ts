// =====================================================================
// lib/data/licenses.ts — typed reader for the licence register.
//
// listLicenses() returns every row in the licences table plus a derived
// daysToExpiry field. licenses_due(p_as_of) returns only the statutory
// licences approaching expiry, as of a business date, for nav badges.
// =====================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { todayIST } from "./fy";
import { unwrap, type LicenseDueRow } from "./types";
import type { LicenseRow, LicenseType, LicenseStatus } from "./licenses.types";

export { LICENSE_TYPE_LABELS } from "./licenses.types";
export type { LicenseRow, LicenseType, LicenseStatus } from "./licenses.types";

/**
 * Full licence register. Days-to-expiry is derived server-side (positive =
 * still valid, negative = overdue) so the client never does date math in a
 * different timezone.
 */
export async function listLicenses(): Promise<LicenseRow[]> {
  const supabase = createClient();
  const rows = unwrap(
    await (supabase as any)
      .from("licenses")
      .select("id, type, license_no, status, issued_date, expiry_date, issuing_authority, renewal_reminder_days, notes, document_url")
      .order("expiry_date"),
    [] as any[],
    "listLicenses",
  );
  const today = Date.parse(todayIST());
  return rows.map((r: any) => ({
    id: r.id,
    type: r.type,
    licenseNo: r.license_no,
    status: r.status,
    issuedDate: r.issued_date,
    expiryDate: r.expiry_date,
    issuingAuthority: r.issuing_authority,
    renewalReminderDays: r.renewal_reminder_days,
    notes: r.notes,
    documentUrl: r.document_url,
    daysToExpiry: Math.round((Date.parse(r.expiry_date) - today) / 86400000),
  }));
}

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
