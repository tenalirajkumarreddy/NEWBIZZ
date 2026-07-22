"use server";

// =====================================================================
// lib/actions/challans.ts — Server Actions for Delivery Challans (§4.4).
//
// The physical-fulfilment seam over a sales order. Each action invokes one
// SECURITY DEFINER RPC (Invariant 3/4) then revalidates the affected routes.
// No money, no stock: challans record what left and roll the order state
// machine; the value event stays in post_invoice.
//
//   createChallan       → create_challan       (print a delivery note)
//   setChallanStatus    → set_challan_status   (printed→in_transit→delivered)
//   closePartialOrder   → close_partial_order  (split the undelivered balance
//                                               into a follow-up order)
// =====================================================================

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "./sales";
import type { ChallanStatus } from "@/lib/data/challans";

function fail(label: string, message: string | undefined): { ok: false; error: string } {
  const msg = (message ?? "").trim() || "Something went wrong. Please try again.";
  console.error(`[action:${label}]`, message);
  return { ok: false, error: msg };
}

// ---- input shapes (validated, not trusted) ----

export interface ChallanLineInput {
  order_line_id: string;
  qty: number;
}

export interface CreateChallanInput {
  order_id: string;
  challan_date?: string; // ISO date; RPC defaults to today
  branch_id?: string;
  agent_id?: string;
  eway_bill_no?: string;
  notes?: string;
  lines: ChallanLineInput[];
}

/**
 * Print a delivery challan against a confirmed / partially-fulfilled order via
 * create_challan. The RPC validates each delivered qty against the remaining
 * balance (ordered − already fulfilled − qty on other open challans). No
 * ledger, no stock. Returns the new challan id.
 */
export async function createChallan(
  input: CreateChallanInput,
): Promise<ActionResult<{ challanId: string }>> {
  if (!input.order_id) return { ok: false, error: "Missing order for the challan." };

  const lines = (input.lines ?? []).filter(
    (l) => l.order_line_id && Number(l.qty) > 0,
  );
  if (lines.length === 0) return { ok: false, error: "Add at least one line with a delivered quantity." };

  const supabase = createClient();
  const header: { [key: string]: string } = { order_id: input.order_id };
  if (input.challan_date) header.challan_date = input.challan_date;
  if (input.branch_id) header.branch_id = input.branch_id;
  if (input.agent_id) header.agent_id = input.agent_id;
  if (input.eway_bill_no?.trim()) header.eway_bill_no = input.eway_bill_no.trim();
  if (input.notes?.trim()) header.notes = input.notes.trim();

  const res = await supabase.rpc("create_challan", {
    p_header: header,
    p_lines: lines.map((l) => ({
      order_line_id: l.order_line_id,
      qty: Number(l.qty),
    })),
  });

  if (res.error || !res.data) return fail("createChallan", res.error?.message);

  revalidatePath("/challans");
  revalidatePath(`/orders/${input.order_id}`);
  revalidatePath("/orders");
  return { ok: true, challanId: res.data };
}

/**
 * Advance a challan's transit state via set_challan_status:
 *   printed → in_transit → delivered   (printed → delivered allowed)
 *   printed / in_transit → cancelled
 * On "delivered" the RPC bumps sales_order_lines.qty_fulfilled and, once every
 * line is fully delivered, marks the order "fulfilled".
 */
export async function setChallanStatus(
  challanId: string,
  status: ChallanStatus,
  orderId?: string,
): Promise<ActionResult> {
  if (!challanId) return { ok: false, error: "Missing challan." };

  const supabase = createClient();
  const res = await supabase.rpc("set_challan_status", {
    p_id: challanId,
    p_status: status,
  });

  if (res.error) return fail("setChallanStatus", res.error.message);

  revalidatePath("/challans");
  revalidatePath(`/challans/${challanId}`);
  if (orderId) {
    revalidatePath(`/orders/${orderId}`);
    revalidatePath("/orders");
  }
  return { ok: true };
}

/**
 * Close a confirmed order that has been partially delivered via
 * close_partial_order: the undelivered balance is copied into a NEW confirmed
 * follow-up order (linked both ways) and the original becomes
 * "partially_fulfilled". If nothing remains the original becomes "fulfilled"
 * and no follow-up is created (followupOrderId is null).
 */
export async function closePartialOrder(
  orderId: string,
  reason?: string,
): Promise<ActionResult<{ followupOrderId: string | null }>> {
  if (!orderId) return { ok: false, error: "Missing order." };

  const supabase = createClient();
  const res = await supabase.rpc("close_partial_order", {
    p_order: orderId,
    ...(reason?.trim() ? { p_reason: reason.trim() } : {}),
  });

  if (res.error) return fail("closePartialOrder", res.error.message);

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/challans");
  revalidatePath("/");
  return { ok: true, followupOrderId: res.data ?? null };
}
