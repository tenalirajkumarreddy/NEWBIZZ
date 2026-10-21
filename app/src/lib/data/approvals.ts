import "server-only";
import { createClient } from "@/lib/supabase/server";

// =====================================================================
// lib/data/approvals.ts — maker-checker queue for high-value voids.
// =====================================================================

export interface ReversalQueueRow {
  id: string;
  kind: "invoice_void" | "receipt_void";
  target_id: string;
  doc_no: string | null;
  customer: string | null;
  amount: number;
  reason: string | null;
  requested_by: string | null;
  requested_by_name: string | null;
  requested_at: string;
  status: string;
  decision_note: string | null;
}

export interface ReversalPolicyRow {
  kind: string;
  threshold_amount: number;
  enabled: boolean;
}

export async function getReversalQueue(status = "pending"): Promise<ReversalQueueRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("reversal_queue", { p_status: status });
  if (error) {
    console.error("[data:reversalQueue]", error.message);
    return [];
  }
  return (data ?? []) as ReversalQueueRow[];
}

export async function getReversalPolicy(): Promise<ReversalPolicyRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("reversal_policy")
    .select("kind, threshold_amount, enabled")
    .order("kind");
  if (error) {
    console.error("[data:reversalPolicy]", error.message);
    return [];
  }
  return (data ?? []) as ReversalPolicyRow[];
}
