"use server";

// =====================================================================
// lib/actions/costing.ts — Server Actions for Process Costing (§6.8).
//
// Costing is valuation/reporting. The main actions trigger the definer
// RPCs (run_process_costing, compute_loaded_cost); overhead pool CRUD
// writes directly to overhead_pools (gated by config.edit RLS).
// =====================================================================

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

// ----------------------------------------------------- Costing computation

export async function runProcessCosting(
  month: string,
  stage: number,
  finalize: boolean,
): Promise<ActionResult<{ runId: string }>> {
  if (!month) return { ok: false, error: "Month is required." };
  if (stage !== 1 && stage !== 2) return { ok: false, error: "Stage must be 1 or 2." };
  const supabase = createClient();
  const res = await supabase.rpc("run_process_costing", {
    p_month: month,
    p_stage: stage,
    p_finalize: finalize,
  });
  if (res.error || !res.data) {
    const msg = (res.error?.message ?? "").trim();
    console.error("[action:runProcessCosting]", msg);
    return {
      ok: false,
      error: msg || "Costing could not be run. Check that production runs exist for this month+stage.",
    };
  }
  revalidatePath("/costing");
  return { ok: true, runId: res.data as string };
}

export async function computeLoadedCost(
  month: string,
): Promise<ActionResult> {
  if (!month) return { ok: false, error: "Month is required." };
  const supabase = createClient();
  const res = await supabase.rpc("compute_loaded_cost", { p_month: month });
  if (res.error) {
    console.error("[action:computeLoadedCost]", res.error.message);
    return { ok: false, error: res.error.message };
  }
  revalidatePath("/costing");
  return { ok: true };
}

// ----------------------------------------------------- Overhead pools

export interface UpsertPoolInput {
  id?: string;
  name: string;
  stage: string;
  periodMonth: string;
  amount: number;
  source?: string;
  allocationDriver?: string;
}

export async function upsertOverheadPool(
  input: UpsertPoolInput,
): Promise<ActionResult<{ poolId: string }>> {
  const { id, name, stage, periodMonth, amount } = input;
  if (!name?.trim()) return { ok: false, error: "Pool name is required." };
  if (!stage) return { ok: false, error: "Stage is required." };
  if (!periodMonth) return { ok: false, error: "Period month is required." };
  if (amount == null || amount < 0)
    return { ok: false, error: "Amount must be a positive number." };

  const supabase = createClient();
  const payload: Record<string, unknown> = {
    name: name.trim(),
    stage,
    period_month: periodMonth,
    amount,
    source: input.source ?? "estimated",
    allocation_driver: input.allocationDriver ?? "cases",
  };

  if (id) {
    const res = await supabase
      .from("overhead_pools")
      .update(payload as never)
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (res.error) {
      console.error("[action:upsertPool]", res.error.message);
      return { ok: false, error: res.error.message };
    }
    revalidatePath("/costing");
    return { ok: true, poolId: id };
  }

  const res = await supabase
    .from("overhead_pools")
    .insert(payload as never)
    .select("id")
    .maybeSingle();
  if (res.error) {
    const msg = res.error.message.includes("unique")
      ? "A pool with this name already exists for this month and stage."
      : res.error.message;
    console.error("[action:upsertPool]", msg);
    return { ok: false, error: msg };
  }
  revalidatePath("/costing");
  return { ok: true, poolId: res.data!.id };
}

export async function deleteOverheadPool(id: string): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Pool ID is required." };
  const supabase = createClient();
  const res = await supabase
    .from("overhead_pools")
    .delete()
    .eq("id", id);
  if (res.error) {
    console.error("[action:deletePool]", res.error.message);
    return { ok: false, error: res.error.message };
  }
  revalidatePath("/costing");
  return { ok: true };
}
