"use server";

// =====================================================================
// lib/actions/assets.ts — Server Actions for Fixed Assets & Depreciation
// (§5.7). Each invokes one SECURITY DEFINER RPC (Inv 3/4) then revalidates.
//   createFixedAsset  → create_fixed_asset   (register, optionally capitalize)
//   runDepreciation   → run_depreciation     (batch Dr dep / Cr accumulated)
//   disposeFixedAsset → dispose_fixed_asset  (gain/loss vs WDV)
// =====================================================================
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "./sales";
import type { AssetClass, DepMethod } from "@/lib/data/assets";

function fail(label: string, message: string | undefined): { ok: false; error: string } {
  const msg = (message ?? "").trim() || "Something went wrong. Please try again.";
  console.error(`[action:${label}]`, message);
  return { ok: false, error: msg };
}

export interface CreateAssetInput {
  name: string;
  asset_class: AssetClass;
  purchase_date: string;
  capitalized_value: number;
  salvage_value?: number;
  method: DepMethod;
  useful_life_years?: number;
  dep_rate?: number;
  note?: string;
  capitalize?: boolean;
  pay_account?: string;
}

export async function createFixedAsset(input: CreateAssetInput): Promise<ActionResult<{ assetId: string }>> {
  if (!input.name?.trim()) return { ok: false, error: "Give the asset a name." };
  if (!(input.capitalized_value > 0)) return { ok: false, error: "Capitalized value must be greater than zero." };
  if (input.method === "slm" && !(Number(input.useful_life_years) > 0))
    return { ok: false, error: "Straight-line needs a useful life in years." };
  if (input.method === "wdv" && !(Number(input.dep_rate) > 0))
    return { ok: false, error: "Written-down-value needs a depreciation rate." };

  const supabase = createClient();
  const header: { [key: string]: string | number | boolean } = {
    name: input.name.trim(),
    asset_class: input.asset_class,
    purchase_date: input.purchase_date,
    capitalized_value: input.capitalized_value,
    method: input.method,
  };
  if (input.salvage_value != null) header.salvage_value = input.salvage_value;
  if (input.useful_life_years != null) header.useful_life_years = input.useful_life_years;
  if (input.dep_rate != null) header.dep_rate = input.dep_rate;
  if (input.note?.trim()) header.note = input.note.trim();
  if (input.capitalize) header.capitalize = true;
  if (input.pay_account) header.pay_account = input.pay_account;

  const res = await supabase.rpc("create_fixed_asset", { p_header: header });
  if (res.error || !res.data) return fail("createFixedAsset", res.error?.message);

  revalidatePath("/assets");
  revalidatePath("/trial-balance");
  return { ok: true, assetId: res.data as string };
}

export async function runDepreciation(
  date: string,
  periodLabel?: string,
  months?: number,
): Promise<ActionResult<{ runId: string }>> {
  const supabase = createClient();
  const res = await supabase.rpc("run_depreciation", {
    p_date: date,
    ...(periodLabel?.trim() ? { p_period_label: periodLabel.trim() } : {}),
    ...(months != null ? { p_months: months } : {}),
  });
  if (res.error || !res.data) return fail("runDepreciation", res.error?.message);

  revalidatePath("/assets");
  revalidatePath("/assets/depreciation");
  revalidatePath("/journal");
  revalidatePath("/trial-balance");
  revalidatePath("/reports");
  return { ok: true, runId: res.data as string };
}

export async function disposeFixedAsset(
  assetId: string,
  proceeds: number,
  date: string,
  recvAccount?: string,
): Promise<ActionResult<{ journalId: string }>> {
  if (!assetId) return { ok: false, error: "Missing asset." };
  if (proceeds < 0) return { ok: false, error: "Proceeds cannot be negative." };

  const supabase = createClient();
  const res = await supabase.rpc("dispose_fixed_asset", {
    p_asset: assetId,
    p_proceeds: proceeds,
    p_date: date,
    ...(recvAccount ? { p_recv_account: recvAccount } : {}),
  });
  if (res.error || !res.data) return fail("disposeFixedAsset", res.error?.message);

  revalidatePath("/assets");
  revalidatePath(`/assets/${assetId}`);
  revalidatePath("/journal");
  revalidatePath("/trial-balance");
  return { ok: true, journalId: res.data as string };
}
