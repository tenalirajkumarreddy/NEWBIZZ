"use server";

// =====================================================================
// lib/actions/portal.ts — Server Actions for the Customer Portal.
//
// Customers act only via the portal RPCs (SECURITY DEFINER, scoped to the
// caller's portal_customer_id — no client-supplied customer id is trusted).
// portalCreateOrder is pure demand capture (no ledger/stock); portalPayIntent
// writes a pending suggestion staff reconcile. adminEnableCustomerPortal is the
// admin-side opt-in gateway (requires customer.manage).
// =====================================================================

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "./sales";

function fail(label: string, message: string | undefined): { ok: false; error: string } {
  const msg = (message ?? "").trim() || "Something went wrong. Please try again.";
  console.error(`[action:${label}]`, message);
  return { ok: false, error: msg };
}

export type PayMode = "cash" | "upi" | "cheque" | "bank";

export interface SubmitPayIntentInput {
  amount: number;
  mode: PayMode;
  reference?: string;
  note?: string;
}

/** Submit a "I paid" suggestion. Staff reconcile it in the main app. */
export async function submitPortalPayIntent(
  input: SubmitPayIntentInput,
): Promise<ActionResult<{ intentId: string }>> {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0)
    return { ok: false, error: "Enter an amount greater than zero." };
  if (!["cash", "upi", "cheque", "bank"].includes(input.mode))
    return { ok: false, error: "Pick a payment mode." };

  const supabase = createClient();
  const res = await supabase.rpc("portal_submit_pay_intent", {
    p_amount: amount,
    p_mode: input.mode,
    ...(input.reference?.trim() ? { p_reference: input.reference.trim() } : {}),
    ...(input.note?.trim() ? { p_note: input.note.trim() } : {}),
  });
  if (res.error || !res.data) return fail("submitPortalPayIntent", res.error?.message);

  revalidatePath("/portal/pay");
  revalidatePath("/portal");
  return { ok: true, intentId: res.data };
}

export interface PortalOrderLine {
  item_id: string;
  qty: number;
  unit_price?: number;
}

export interface PortalCreateOrderInput {
  store_id: string;
  notes?: string;
  lines: PortalOrderLine[];
}

/** Create an order against one of MY stores (order-capture only). */
export async function portalCreateOrder(
  input: PortalCreateOrderInput,
): Promise<ActionResult<{ orderId: string }>> {
  if (!input.store_id) return { ok: false, error: "Select a store for the order." };
  const lines = (input.lines ?? []).filter((l) => l.item_id && Number(l.qty) > 0);
  if (lines.length === 0) return { ok: false, error: "Add at least one line with a quantity." };

  const supabase = createClient();
  const res = await supabase.rpc("portal_create_order", {
    p_store_id: input.store_id,
    p_notes: input.notes?.trim() || "",
    p_lines: lines.map((l) => ({
      item_id: l.item_id,
      qty: Number(l.qty),
      ...(l.unit_price != null ? { unit_price: Number(l.unit_price) } : {}),
    })),
  });
  if (res.error || !res.data) return fail("portalCreateOrder", res.error?.message);

  revalidatePath("/portal/orders");
  revalidatePath("/portal");
  return { ok: true, orderId: res.data };
}

export interface AdminPortalEnableInput {
  customer_id: string;
  contact_phone?: string;
  active: boolean;
}

/** Admin action to turn a customer's portal access on/off (customer.manage). */
export async function adminPortalCustomer(
  input: AdminPortalEnableInput,
): Promise<ActionResult<{ contactPhone: string }>> {
  if (!input.customer_id) return { ok: false, error: "Select a customer." };
  const supabase = createClient();
  const res = await supabase.rpc("admin_enable_customer_portal", {
    p_customer_id: input.customer_id,
    ...(input.contact_phone?.trim() ? { p_contact_phone: input.contact_phone.trim() } : {}),
    p_active: input.active,
  });
  if (res.error) return fail("adminPortalCustomer", res.error.message);

  revalidatePath("/customers");
  revalidatePath(`/customers/${input.customer_id}`);
  return { ok: true, contactPhone: String(res.data) };
}