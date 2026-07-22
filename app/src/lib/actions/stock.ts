"use server";

// =====================================================================
// lib/actions/stock.ts — Server Actions for stock loading (master plan §3.4).
//
// Opening stock touches BOTH physical qty and money value, so it must go
// through a SECURITY DEFINER RPC (Invariant 3). receive_opening_stock_batch
// posts the whole batch in ONE transaction (Invariant 4, §3.4 "a batch
// commits fully in one transaction or fails"): per line
//   Dr <inventory account for item type> / Cr 3900 Opening Balance Equity
// and recomputes WAC via post_stock_move. Auth (settings.manage) is
// enforced inside the RPC — never trust the client.
// =====================================================================

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "./sales";

export interface OpeningStockLine {
  item_id: string;
  branch_id: string;
  qty: number;
  unit_cost: number;
}

export async function receiveOpeningStock(
  lines: OpeningStockLine[],
  asOf?: string,
): Promise<ActionResult<{ posted: number }>> {
  const clean = (lines ?? []).filter(
    (l) => l.item_id && l.branch_id && Number(l.qty) > 0,
  );
  if (clean.length === 0)
    return { ok: false, error: "Add at least one line with an item and a quantity." };
  for (const l of clean) {
    if (!Number.isFinite(Number(l.qty)) || Number(l.qty) <= 0)
      return { ok: false, error: "Every quantity must be a number greater than zero." };
    if (!Number.isFinite(Number(l.unit_cost)) || Number(l.unit_cost) < 0)
      return { ok: false, error: "Unit cost cannot be negative." };
  }
  const seen = new Set<string>();
  for (const l of clean) {
    const key = `${l.item_id}:${l.branch_id}`;
    if (seen.has(key))
      return { ok: false, error: "The same item appears twice for one warehouse — merge the lines." };
    seen.add(key);
  }

  const supabase = createClient();
  const res = await supabase.rpc("receive_opening_stock_batch", {
    p_lines: clean.map((l) => ({
      item_id: l.item_id,
      branch_id: l.branch_id,
      qty: Number(l.qty),
      unit_cost: Number(l.unit_cost),
    })),
    ...(asOf ? { p_as_of: asOf } : {}),
  });

  if (res.error || res.data == null) {
    const msg = (res.error?.message ?? "").trim();
    console.error("[action:receiveOpeningStock]", msg);
    return {
      ok: false,
      error: msg.includes("not authorized")
        ? "You need the settings.manage permission to load opening stock."
        : msg || "Opening stock could not be posted. Nothing was saved.",
    };
  }

  revalidatePath("/stock");
  revalidatePath("/");
  return { ok: true, posted: res.data };
}
