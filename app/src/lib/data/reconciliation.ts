import { createClient } from "@/lib/supabase/server";

// =====================================================================
// lib/data/reconciliation.ts — read-only integrity checks.
//
// Every accounting defect this system has had was two books of the same
// money drifting apart: AR GL vs the invoice subledger, the subledger vs
// the customer ledger, receipts vs their allocations, stock value vs the
// inventory control accounts. The RPCs compare them; nothing here writes.
// =====================================================================

export interface ReconciliationCheck {
  check_name: string;
  expected: number;
  actual: number;
  difference: number;
  status: string;
  detail: string;
}

export interface ArDriftRow {
  customer_id: string;
  customer: string;
  gl_balance: number;
  subledger: number;
  difference: number;
}

export interface ReconciliationResult {
  checks: ReconciliationCheck[];
  drift: ArDriftRow[];
  error: string | null;
}

export async function getReconciliation(limit = 25): Promise<ReconciliationResult> {
  const supabase = createClient();

  const [checksRes, driftRes] = await Promise.all([
    supabase.rpc("reconciliation_checks"),
    supabase.rpc("ar_drift_by_customer", { p_limit: limit }),
  ]);

  if (checksRes.error) {
    return { checks: [], drift: [], error: checksRes.error.message };
  }

  return {
    checks: (checksRes.data ?? []) as ReconciliationCheck[],
    drift: (driftRes.data ?? []) as ArDriftRow[],
    error: driftRes.error?.message ?? null,
  };
}
