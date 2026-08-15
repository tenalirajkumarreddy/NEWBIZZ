// =====================================================================
// lib/data/releases.ts — server-only readers for the Release Center.
//
// listReleaseCounts(from, to) tallies, per document register, how many rows
// within the date range are released vs unreleased. "Released" means a row in
// document_releases marks it visible to accountant view-codes (the fine-grained
// gate). Reads only — the actual release mutation lives in lib/actions/releases.ts.
// =====================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrap } from "./types";

export interface ReleaseTypeCount {
  entityType: string;
  label: string;
  released: number;
  unreleased: number;
}

// The registers a month-end release covers, mapped to their base table + the
// date column that carries the document's business date. Table/column names are
// fixed literals — never interpolate user input into identifiers here.
const RELEASE_TYPES: { entityType: string; label: string; table: string; dateCol: string }[] = [
  { entityType: "invoices", label: "Invoices", table: "invoices", dateCol: "invoice_date" },
  { entityType: "expenses", label: "Expenses", table: "expenses", dateCol: "expense_date" },
  { entityType: "supplier_bills", label: "Supplier Bills", table: "supplier_bills", dateCol: "bill_date" },
  { entityType: "vouchers", label: "Ledger Vouchers", table: "journal_entries", dateCol: "entry_date" },
  { entityType: "credit_notes", label: "Credit Notes", table: "credit_notes", dateCol: "created_at" },
  { entityType: "challans", label: "Delivery Challans", table: "delivery_challans", dateCol: "created_at" },
];

/**
 * Released vs unreleased counts per register, for document rows dated within
 * `pFrom`..`pTo` (YYYY-MM-DD). Returns one row per register in RELEASE_TYPES
 * order. Runs under the caller's RLS — the release.manage gate lets managers
 * read everything, so counts reflect the full register.
 */
export async function listReleaseCounts(pFrom: string, pTo: string): Promise<ReleaseTypeCount[]> {
  const supabase = createClient();
  const db = supabase as any;
  const out: ReleaseTypeCount[] = [];

  for (const t of RELEASE_TYPES) {
    // Total rows dated in range.
    const totalRes = await db
      .from(t.table)
      .select("*", { count: "exact", head: true })
      .gte(t.dateCol, pFrom)
      .lte(t.dateCol, pTo);
    const total = Number(totalRes.count ?? 0);

    // Released rows in range: match mark ids against the base table + date.
    const marks = unwrap(
      await db.from("document_releases").select("entity_id").eq("entity_type", t.entityType),
      [] as { entity_id: string }[],
      `listReleaseCounts:${t.entityType}`,
    );
    const ids = marks.map((m) => m.entity_id as string).filter(Boolean);
    let released = 0;
    if (ids.length > 0) {
      const releasedRes = await db
        .from(t.table)
        .select("*", { count: "exact", head: true })
        .in("id", ids)
        .gte(t.dateCol, pFrom)
        .lte(t.dateCol, pTo);
      released = Number(releasedRes.count ?? 0);
    }

    out.push({
      entityType: t.entityType,
      label: t.label,
      released,
      unreleased: Math.max(0, total - released),
    });
  }

  return out;
}