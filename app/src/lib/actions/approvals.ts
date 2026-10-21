"use server";

// =====================================================================
// lib/actions/approvals.ts — second-approver step for high-value voids.
//
// A void at or above the configured threshold is refused by the RPC with
// SQLSTATE RY001 and filed as a request. This action decides it: approving
// runs the original void inside the approver's transaction, so the reversal,
// the ledger row and the decision commit together. The database refuses an
// approval by the person who filed the request.
// =====================================================================

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "./sales";

function fail(label: string, message: string | undefined): { ok: false; error: string } {
  const msg = (message ?? "").trim() || "Something went wrong. Please try again.";
  console.error(`[action:${label}]`, message);
  return { ok: false, error: msg };
}

export async function decideReversal(
  requestId: string,
  approve: boolean,
  note?: string,
): Promise<ActionResult<{ documentId?: string }>> {
  if (!requestId) return { ok: false, error: "Request missing." };

  const supabase = createClient();
  const trimmed = note?.trim();

  if (approve) {
    const res = await supabase.rpc("approve_reversal", {
      p_request: requestId,
      ...(trimmed ? { p_note: trimmed } : {}),
    });
    if (res.error) return fail("approveReversal", res.error.message);

    revalidatePath("/admin/approvals");
    revalidatePath("/invoices");
    revalidatePath("/receipts");
    revalidatePath("/customers");
    revalidatePath("/");
    return { ok: true, documentId: res.data ?? undefined };
  }

  const res = await supabase.rpc("reject_reversal", {
    p_request: requestId,
    ...(trimmed ? { p_note: trimmed } : {}),
  });
  if (res.error) return fail("rejectReversal", res.error.message);

  revalidatePath("/admin/approvals");
  return { ok: true };
}
