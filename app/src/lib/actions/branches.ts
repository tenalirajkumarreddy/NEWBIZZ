"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export async function updateBranchLocation(
  branchId: string,
  lat: number,
  lng: number,
): Promise<ActionResult> {
  if (lat == null || lng == null) {
    return { ok: false, error: "Latitude and longitude are required." };
  }
  if (lat < -90 || lat > 90) {
    return { ok: false, error: "Latitude must be between -90 and 90." };
  }
  if (lng < -180 || lng > 180) {
    return { ok: false, error: "Longitude must be between -180 and 180." };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("branches")
    .update({ lat, lng } as never)
    .eq("id", branchId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/fleet/settings");
  return { ok: true };
}
