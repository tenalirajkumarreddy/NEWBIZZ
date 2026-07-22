// =====================================================================
// lib/data/accounting.ts — typed readers for the accounting read-models.
//
// get_trial_balance(p_fy) and get_ar_aging(p_branch) are SETOF readers backed by
// the mv_trial_balance / mv_ar_aging materialized views. They are pure reads;
// the numbers ultimately derive from journal_lines (Invariant 1).
// =====================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getCurrentFy } from "./fy";
import { unwrap, type TrialBalanceRow, type ArAgingRow } from "./types";

/**
 * Trial balance for a financial year. Pass an explicit `fyId`, else the current
 * FY is resolved. Returns [] if no FY is configured or the read is blocked.
 */
export async function getTrialBalance(fyId?: string): Promise<TrialBalanceRow[]> {
  const fy = fyId ?? (await getCurrentFy())?.id;
  if (!fy) return [];
  const supabase = createClient();
  const res = await supabase.rpc("get_trial_balance", { p_fy: fy });
  return unwrap(res, [], "getTrialBalance");
}

/**
 * Accounts-receivable aging rows (one per open invoice), optionally scoped to a
 * branch. Callers aggregate into buckets; see summariseArAging().
 */
export async function getArAging(branchId?: string | null): Promise<ArAgingRow[]> {
  const supabase = createClient();
  const res = await supabase.rpc(
    "get_ar_aging",
    branchId ? { p_branch: branchId } : {},
  );
  return unwrap(res, [], "getArAging");
}

export interface PostableAccount {
  id: string;
  code: string;
  name: string;
  type: string;
}

/**
 * Postable (leaf) accounts for voucher/ledger pickers — active, is_postable
 * accounts ordered by code. Read via RLS (chart_of_accounts is world-readable
 * to authenticated).
 */
export async function listPostableAccounts(): Promise<PostableAccount[]> {
  const supabase = createClient();
  const res = await supabase
    .from("chart_of_accounts")
    .select("id, code, name, type")
    .eq("is_postable", true)
    .eq("status", "active")
    .order("code", { ascending: true })
    .returns<PostableAccount[]>();
  return unwrap(res, [], "listPostableAccounts");
}

export interface ArAgingSummary {
  totalOutstanding: number;
  invoiceCount: number;
  partyCount: number;
  buckets: Record<string, number>;
}

/** Roll AR aging rows up into totals + per-bucket sums for a metric/panel. */
export function summariseArAging(rows: ArAgingRow[]): ArAgingSummary {
  const buckets: Record<string, number> = {};
  const parties = new Set<string>();
  let total = 0;

  for (const r of rows) {
    const out = Number(r.outstanding ?? 0);
    total += out;
    const b = r.bucket ?? "unknown";
    buckets[b] = (buckets[b] ?? 0) + out;
    if (r.customer_id) parties.add(r.customer_id);
  }

  return {
    totalOutstanding: total,
    invoiceCount: rows.length,
    partyCount: parties.size,
    buckets,
  };
}
