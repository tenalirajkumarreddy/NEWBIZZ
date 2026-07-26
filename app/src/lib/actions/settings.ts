"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export async function updateFleetThresholds(
  thresholds: Record<string, number>,
): Promise<ActionResult> {
  const supabase = createClient();

  const { data: existing } = await supabase
    .from("company_settings")
    .select("id, feature_flags")
    .limit(1)
    .maybeSingle() as any;

  if (!existing) {
    return { ok: false, error: "Company settings not found." };
  }

  const merged = { ...(existing.feature_flags ?? {}), ...thresholds };

  const { error } = await supabase
    .from("company_settings" as any)
    .update({ feature_flags: merged })
    .eq("id", existing.id);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/fleet/settings");
  return { ok: true };
}
