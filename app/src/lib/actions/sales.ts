"use server";

// =====================================================================
// lib/actions/sales.ts — Server Actions for the Sell & Collect module.
//
// This is the app's mutation seam: forms/buttons call these, they validate
// input, invoke a SECURITY DEFINER RPC (the ONLY money/stock gateway,
// Invariant 3), then revalidate the affected routes. The RPC gates permission
// and reads the actor from the JWT claim, so we never trust client-sent ids
// for authorization. Returns a typed result the client renders — success
// carries the new row id; failure carries a human message (no throw).
//
// Two ways a sale reaches the ledger:
//   * recordSale  → post_invoice            (Sales Desk: sell now, invoice now)
//   * createOrder → place_order  (demand)   then invoiceOrder → post_invoice_from_order
// Both land in `invoices`; place_order alone has no accounting impact.
// =====================================================================

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCustomerCreditInfo, getCustomerLedger } from "@/lib/data/sales";
import type { CustomerCreditInfo, LedgerSummary } from "@/lib/data/sales";

export type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

// Turn a PostgREST/RPC error into a short, user-facing sentence. The RPCs
// raise clear `place_order: ...` style messages; we surface those directly.
function fail(label: string, message: string | undefined): { ok: false; error: string } {
  const msg = (message ?? "").trim() || "Something went wrong. Please try again.";
  console.error(`[action:${label}]`, message);
  return { ok: false, error: msg };
}

// ---- input shapes (validated, not trusted) ----

export interface OrderLineInput {
  item_id: string;
  qty: number;
  unit_price?: number; // omitted → RPC resolves the effective price
}

export interface CreateOrderInput {
  store_id: string;
  order_date?: string; // ISO date; RPC defaults to today
  branch_id?: string;
  notes?: string;
  lines: OrderLineInput[];
}

export interface RecordSaleInput {
  store_id: string;
  invoice_date?: string; // ISO date; RPC defaults to today
  branch_id?: string;
  place_of_supply?: string; // 2-digit state code; RPC defaults to the store's
  is_official?: boolean;    // false = cash-memo (no tax); defaults to true
  lines: OrderLineInput[];
}

/**
 * Create (confirm) a sales order via place_order. Pure demand capture — no
 * ledger or stock impact until it's invoiced.
 */
export async function createOrder(
  input: CreateOrderInput,
): Promise<ActionResult<{ orderId: string }>> {
  if (!input.store_id) return { ok: false, error: "Select a store for the order." };

  const lines = (input.lines ?? []).filter(
    (l) => l.item_id && Number(l.qty) > 0,
  );
  if (lines.length === 0) return { ok: false, error: "Add at least one line with a quantity." };

  const supabase = createClient();
  const header: Record<string, string> = { store_id: input.store_id };
  if (input.order_date) header.order_date = input.order_date;
  if (input.branch_id) header.branch_id = input.branch_id;
  if (input.notes?.trim()) header.notes = input.notes.trim();

  const res = await supabase.rpc("place_order", {
    p_header: header,
    p_lines: lines.map((l) => ({
      item_id: l.item_id,
      qty: Number(l.qty),
      ...(l.unit_price != null ? { unit_price: Number(l.unit_price) } : {}),
    })),
  });

  if (res.error || !res.data) return fail("createOrder", res.error?.message);

  revalidatePath("/orders");
  revalidatePath("/");
  return { ok: true, orderId: res.data };
}

/**
 * Record a sale for a store via post_invoice — the value event. This is what
 * the Sales Desk does: a store buys, we raise the tax invoice directly (no
 * order step). In one transaction the RPC computes GST (CGST/SGST intra-state,
 * IGST inter-state by place of supply), posts revenue + output tax + AR, and
 * issues stock at weighted-average cost (COGS). Returns the new invoice id.
 */
export async function recordSale(
  input: RecordSaleInput,
): Promise<ActionResult<{ invoiceId: string }>> {
  if (!input.store_id) return { ok: false, error: "Select a store for the sale." };

  const lines = (input.lines ?? []).filter(
    (l) => l.item_id && Number(l.qty) > 0,
  );
  if (lines.length === 0) return { ok: false, error: "Add at least one line with a quantity." };

  const supabase = createClient();
  const header: Record<string, string> = { store_id: input.store_id };
  if (input.invoice_date) header.invoice_date = input.invoice_date;
  if (input.branch_id) header.branch_id = input.branch_id;
  if (input.place_of_supply) header.place_of_supply = input.place_of_supply;
  if (input.is_official === false) header.is_official = "false";

  const res = await supabase.rpc("post_invoice", {
    p_header: header,
    p_lines: lines.map((l) => ({
      item_id: l.item_id,
      qty: Number(l.qty),
      ...(l.unit_price != null ? { unit_price: Number(l.unit_price) } : {}),
    })),
  });

  if (res.error || !res.data) return fail("recordSale", res.error?.message);

  revalidatePath("/invoices");
  revalidatePath("/orders");
  revalidatePath("/");
  return { ok: true, invoiceId: res.data };
}

/**
 * Raise the tax invoice for a confirmed order via post_invoice_from_order.
 * This is the value event: revenue + GST + AR posted and stock issued at WAC,
 * all in one transaction inside the RPC.
 */
export async function invoiceOrder(
  orderId: string,
  invoiceDate?: string,
): Promise<ActionResult<{ invoiceId: string }>> {
  if (!orderId) return { ok: false, error: "Missing order." };

  const supabase = createClient();
  const res = await supabase.rpc("post_invoice_from_order", {
    p_order: orderId,
    ...(invoiceDate ? { p_date: invoiceDate } : {}),
  });

  if (res.error || !res.data) return fail("invoiceOrder", res.error?.message);

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/invoices");
  revalidatePath("/");
  return { ok: true, invoiceId: res.data };
}

/**
 * Cancel a draft/confirmed order via cancel_order. Pure status change — an
 * order that reached "invoiced" already posted value and can only be undone
 * with a credit note, so the RPC refuses it.
 */
export async function cancelOrder(
  orderId: string,
  reason?: string,
): Promise<ActionResult> {
  if (!orderId) return { ok: false, error: "Missing order." };

  const supabase = createClient();
  const res = await supabase.rpc("cancel_order", {
    p_order: orderId,
    ...(reason?.trim() ? { p_reason: reason.trim() } : {}),
  });

  if (res.error) return fail("cancelOrder", res.error.message);

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/");
  return { ok: true };
}

/**
 * Void a posted invoice / cash memo via void_invoice. Reverses its sale
 * journal, restores stock (which reverses the COGS journal too), reverses the
 * customer ledger, and marks the doc void — all in one RPC transaction. Refuses
 * docs that already have receipts allocated (amount_paid ≠ 0). Never renumbers
 * or deletes: the void is an audit-safe reversal (Invariant 6/8).
 */
export async function voidInvoice(
  invoiceId: string,
  reason?: string,
): Promise<ActionResult> {
  if (!invoiceId) return { ok: false, error: "Missing invoice." };

  const supabase = createClient();
  const res = await supabase.rpc("void_invoice", {
    p_invoice: invoiceId,
    ...(reason?.trim() ? { p_reason: reason.trim() } : {}),
  });

  if (res.error) return fail("voidInvoice", res.error.message);

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/sales");
  revalidatePath("/orders");
  revalidatePath("/");
  return { ok: true };
}

/**
 * Fix a wrong-type sale (tax invoice booked as a cash memo, or vice-versa) via
 * convert_invoice_type. The RPC voids the mis-typed document and re-issues the
 * SAME lines under the opposite is_official — recomputing GST/ledger correctly —
 * returning the NEW invoice id. Used when GST was wrongly charged or omitted.
 */
export async function convertInvoiceType(
  invoiceId: string,
  reason?: string,
): Promise<ActionResult<{ invoiceId: string }>> {
  if (!invoiceId) return { ok: false, error: "Missing invoice." };

  const supabase = createClient();
  const res = await supabase.rpc("convert_invoice_type", {
    p_invoice: invoiceId,
    ...(reason?.trim() ? { p_reason: reason.trim() } : {}),
  });

  if (res.error || !res.data) return fail("convertInvoiceType", res.error?.message);

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath(`/invoices/${res.data}`);
  revalidatePath("/sales");
  revalidatePath("/orders");
  revalidatePath("/");
  return { ok: true, invoiceId: res.data };
}

export async function fetchCustomerCreditInfo(
  customerId: string,
): Promise<CustomerCreditInfo | null> {
  return getCustomerCreditInfo(customerId);
}

export async function approveOrder(orderId: string): Promise<ActionResult> {
  if (!orderId) return { ok: false, error: "Missing order." };

  const supabase = createClient();
  const res = await supabase.rpc("approve_order", { p_order_id: orderId });

  if (res.error) return fail("approveOrder", res.error.message);

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/");
  return { ok: true };
}

export async function updateOrder(
  orderId: string,
  version: number,
  header: { notes?: string },
): Promise<ActionResult> {
  if (!orderId) return { ok: false, error: "Missing order." };
  if (version < 1) return { ok: false, error: "Invalid version." };

  const supabase = createClient();
  const res = await supabase.rpc("update_order", {
    p_order_id: orderId,
    p_version: version,
    p_header: header,
  });

  if (res.error) return fail("updateOrder", res.error.message);

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/");
  return { ok: true };
}

export async function updateOrderLine(
  orderId: string,
  version: number,
  lineId: string,
  qty?: number,
  unitPrice?: number,
): Promise<ActionResult> {
  if (!orderId) return { ok: false, error: "Missing order." };
  if (!lineId) return { ok: false, error: "Missing line." };
  if (version < 1) return { ok: false, error: "Invalid version." };

  const supabase = createClient();
  const res = await supabase.rpc("update_order_line", {
    p_order_id: orderId,
    p_version: version,
    p_line_id: lineId,
    ...(qty !== undefined ? { p_qty: qty } : {}),
    ...(unitPrice !== undefined ? { p_unit_price: unitPrice } : {}),
  });

  if (res.error) return fail("updateOrderLine", res.error.message);

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/");
  return { ok: true };
}

/**
 * Fulfil a confirmed/approved order: deliver all remaining qty, post revenue
 * + GST + stock + customer_ledger in one transaction. No invoice created.
 * Calls post_delivery RPC. Returns the challan id.
 */
export async function fulfilOrder(
  orderId: string,
): Promise<ActionResult<{ challanId: string }>> {
  if (!orderId) return { ok: false, error: "Missing order." };

  const supabase = createClient();
  const res = await supabase.rpc("post_delivery", {
    p_order: orderId,
  });

  if (res.error || !res.data) return fail("fulfilOrder", res.error?.message);

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/challans");
  revalidatePath("/");
  return { ok: true, challanId: res.data };
}

/**
 * Generate an optional GST invoice doc from a fulfilled order.
 * No accounting entry — links to the delivery journal instead.
 * Calls generate_gst_invoice RPC. Returns the invoice id.
 */
export async function generateGstInvoice(
  orderId: string,
  invoiceDate?: string,
): Promise<ActionResult<{ invoiceId: string }>> {
  if (!orderId) return { ok: false, error: "Missing order." };

  const supabase = createClient();
  const res = await supabase.rpc("generate_gst_invoice", {
    p_order: orderId,
    ...(invoiceDate ? { p_date: invoiceDate } : {}),
  });

  if (res.error || !res.data) return fail("generateGstInvoice", res.error?.message);

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/invoices");
  revalidatePath("/");
  return { ok: true, invoiceId: res.data };
}

export async function fetchCustomerLedger(
  customerId: string,
  limit = 50,
  offset = 0,
): Promise<LedgerSummary | null> {
  return getCustomerLedger(customerId, limit, offset);
}
