"use server";

// =====================================================================
// lib/actions/production.ts — Server Actions for Production Runs (§6.4).
//
// The only mutation is posting a run via the post_production_run SECURITY
// DEFINER RPC (migration 0018). No explicit inputs are sent — the RPC
// auto-explodes the active BOM for the requested output item + quantity.
// =====================================================================

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

export type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export interface PostRunInput {
  outputItemId: string;
  outputQty: number;
  stage: number;
  runDate?: string;
  abnormalWastage?: number;
  notes?: string;
}

export async function postProductionRun(
  input: PostRunInput,
): Promise<ActionResult<{ runId: string }>> {
  const { outputItemId, outputQty, stage } = input;
  if (!outputItemId) return { ok: false, error: "Select the output item." };
  if (!outputQty || outputQty <= 0)
    return { ok: false, error: "Output quantity must be greater than 0." };
  if (stage !== 1 && stage !== 2)
    return { ok: false, error: "Stage must be 1 (Blowing) or 2 (Filling)." };

  const supabase = createClient();
  const header: Record<string, Json> = { output_item_id: outputItemId, output_qty: outputQty, stage };
  if (input.runDate) header.run_date = input.runDate;
  if (input.abnormalWastage && input.abnormalWastage > 0)
    header.abnormal_wastage_value = input.abnormalWastage;
  if (input.notes?.trim()) header.notes = input.notes.trim();

  const res = await supabase.rpc("post_production_run", { p_header: header });

  if (res.error || !res.data) {
    const msg = (res.error?.message ?? "").trim();
    console.error("[action:postProductionRun]", msg);
    return { ok: false, error: msg || "The production run could not be posted." };
  }
  revalidatePath("/production");
  return { ok: true, runId: res.data as string };
}
