"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getHourlyProduction as getHourlyProductionData } from "@/lib/data/production-devices";
import type { HourlyProductionRow } from "@/lib/data/production-devices";

export type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

function fail(label: string, msg: string | undefined): { ok: false; error: string } {
  const m = (msg ?? "").trim() || "Something went wrong.";
  console.error(`[action:${label}]`, msg);
  return { ok: false, error: m };
}

export async function createMapping(
  deviceId: string,
  deviceIndex: number,
  itemId: string,
): Promise<ActionResult<{ id: string }>> {
  if (!deviceId.trim()) return { ok: false, error: "Device ID is required." };
  if (deviceIndex < 1) return { ok: false, error: "Index must be 1 or greater." };
  if (!itemId) return { ok: false, error: "Item is required." };

  const supabase = createClient();

  const { data, error } = await supabase
    .from("production_device_config")
    .insert({ device_id: deviceId.trim(), device_index: deviceIndex, item_id: itemId })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: `Device "${deviceId}" already has an index ${deviceIndex}.` };
    }
    return fail("createMapping", error.message);
  }

  revalidatePath("/admin/production-devices");
  return { ok: true, id: data.id };
}

export async function updateMapping(
  id: string,
  itemId: string,
): Promise<ActionResult> {
  if (!id || !itemId) return { ok: false, error: "Invalid request." };

  const supabase = createClient();
  const { error } = await supabase
    .from("production_device_config")
    .update({ item_id: itemId, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return fail("updateMapping", error.message);
  revalidatePath("/admin/production-devices");
  return { ok: true };
}

export async function deleteMapping(id: string): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Invalid request." };

  const supabase = createClient();
  const { error } = await supabase
    .from("production_device_config")
    .delete()
    .eq("id", id);

  if (error) return fail("deleteMapping", error.message);
  revalidatePath("/admin/production-devices");
  return { ok: true };
}

export async function getHourlyProductionAction(date: string): Promise<HourlyProductionRow[]> {
  return getHourlyProductionData(date);
}
