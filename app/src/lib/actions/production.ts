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
import { explodeBom } from "@/lib/data/bom";
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

// =====================================================================
// Job cards
// =====================================================================

export interface JobCardInput {
  id?: string;
  cardDate: string;
  stage: number;
  outputItemId: string;
  targetQty: number;
  deviceId?: string;
  assignedTo?: string;
  plannedStartAt?: string;
  plannedEndAt?: string;
  instructions?: string;
}

export async function saveJobCard(
  input: JobCardInput,
): Promise<ActionResult<{ cardId: string }>> {
  if (!input.cardDate) return { ok: false, error: "Select a date." };
  if (input.stage !== 1 && input.stage !== 2)
    return { ok: false, error: "Stage must be 1 (Blowing) or 2 (Filling)." };
  if (!input.outputItemId) return { ok: false, error: "Select the output item." };
  if (!input.targetQty || input.targetQty <= 0)
    return { ok: false, error: "Target quantity must be greater than 0." };

  const supabase = createClient();
  const payload: Record<string, Json> = {
    card_date: input.cardDate,
    stage: input.stage,
    output_item_id: input.outputItemId,
    target_qty: input.targetQty,
    instructions: input.instructions?.trim() || null,
  };
  if (input.id) payload.id = input.id;
  if (input.deviceId) payload.device_id = input.deviceId;
  if (input.assignedTo) payload.assigned_to = input.assignedTo;
  if (input.plannedStartAt) payload.planned_start_at = input.plannedStartAt;
  if (input.plannedEndAt) payload.planned_end_at = input.plannedEndAt;

  const res = await supabase.rpc("upsert_job_card", { p_card: payload });
  if (res.error || !res.data) {
    const msg = (res.error?.message ?? "").trim();
    console.error("[action:saveJobCard]", msg);
    return { ok: false, error: msg || "The job card could not be saved." };
  }
  revalidatePath("/production/jobs");
  return { ok: true, cardId: res.data as string };
}

export async function setJobCardStatus(
  id: string,
  status: string,
  runId?: string,
): Promise<ActionResult> {
  const supabase = createClient();
  const res = await supabase.rpc("set_job_card_status", {
    p_id: id,
    p_status: status,
    p_run_id: runId,
  });
  if (res.error) {
    const msg = (res.error?.message ?? "").trim();
    console.error("[action:setJobCardStatus]", msg);
    return { ok: false, error: msg || "The job card could not be updated." };
  }
  revalidatePath("/production/jobs");
  return { ok: true };
}

/** Complete a job card by posting a run for it, then link the run. */
export async function postRunForJobCard(
  cardId: string,
  run: {
    outputItemId: string;
    outputQty: number;
    stage: number;
    runDate?: string;
    abnormalWastage?: number;
    notes?: string;
  },
): Promise<ActionResult<{ runId: string }>> {
  const posted = await postProductionRun(run);
  if (!posted.ok) return posted;
  const linked = await setJobCardStatus(cardId, "completed", posted.runId);
  if (!linked.ok) return linked;
  revalidatePath("/production");
  return { ok: true, runId: posted.runId };
}

export async function reverseProductionRun(
  runId: string,
  reason: string,
): Promise<ActionResult> {
  if (!reason.trim()) return { ok: false, error: "Enter a reason for the reversal." };
  const supabase = createClient();
  const res = await supabase.rpc("reverse_production_run", {
    p_run_id: runId,
    p_reason: reason.trim(),
  });
  if (res.error) {
    const msg = (res.error?.message ?? "").trim();
    console.error("[action:reverseProductionRun]", msg);
    return { ok: false, error: msg || "The production run could not be reversed." };
  }
  revalidatePath("/production");
  revalidatePath(`/production/${runId}`);
  return { ok: true };
}

export interface BomPreviewLine {
  childSku: string;
  childName: string;
  grossQty: number;
}

/** Server-side BOM explosion preview for a job card's output item. */
export async function previewJobBom(
  itemId: string,
  outputQty: number,
  runDate?: string,
): Promise<ActionResult<{ lines: BomPreviewLine[] }>> {
  if (!itemId) return { ok: false, error: "Missing output item." };
  if (!outputQty || outputQty <= 0)
    return { ok: false, error: "Output quantity must be greater than 0." };
  try {
    const lines = await explodeBom(itemId, outputQty, runDate);
    if (lines.length === 0)
      return { ok: false, error: "No active BOM for this item — add inputs manually before posting." };
    return {
      ok: true,
      lines: lines.map((l) => ({ childSku: l.childSku, childName: l.childName, grossQty: l.grossQty })),
    };
  } catch (e) {
    console.error("[action:previewJobBom]", e);
    return { ok: false, error: "Could not resolve the BOM for this item." };
  }
}
