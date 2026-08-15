"use server";

// =====================================================================
// lib/actions/releases.ts — Server Action for the Release Center.
//
// runRelease calls the release_documents RPC, which gates on release.manage
// and permanently marks the chosen document types in the given date range as
// released (visible to accountant view-codes). Returns the count of documents
// actually released; a revalidate keeps the admin page counts fresh.
// =====================================================================

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/actions/sales";

export async function runRelease(
  types: string[],
  from: string,
  to: string,
): Promise<ActionResult<{ released: number }>> {
  if (types.length === 0) return { ok: false, error: "Select at least one document type." };
  if (!from || !to || from > to) return { ok: false, error: "Pick a valid date range." };

  const supabase = createClient();
  const res = await (supabase as any).rpc("release_documents", {
    p_types: types,
    p_from: from,
    p_to: to,
  });
  if (res.error || typeof res.data !== "number") {
    return { ok: false, error: res.error?.message ?? "Release failed." };
  }

  revalidatePath("/admin/releases");
  return { ok: true, released: res.data };
}