"use server";

// =====================================================================
// lib/actions/purchases.ts — Server Actions for Purchasing (§5.4/§5.5).
//
// Each action invokes one SECURITY DEFINER RPC (Invariant 3/4) then revalidates
// the affected routes. The buy-side value/stock chain:
//   placePurchaseOrder → place_purchase_order  (intent; no ledger)
//   postGrn / postGrnFromPo → post_grn(_from_po)  (stock IN at cost, Cr 2115)
//   postSupplierBill / postBillFromGrn → post_(bill)(_from_grn)  (clears 2115,
//                                          books Input GST + AP)
//   paySupplier        → pay_supplier          (Dr AP / Cr bank/cash)
//   recordPurchaseReturn → record_purchase_return  (debit note)
// =====================================================================

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "./sales";
import { listOpenBills, type OpenBillRow } from "@/lib/data/purchases";

function fail(label: string, message: string | undefined): { ok: false; error: string } {
  const msg = (message ?? "").trim() || "Something went wrong. Please try again.";
  console.error(`[action:${label}]`, message);
  return { ok: false, error: msg };
}

/** Client bridge: open bills for a supplier (the payment allocation picker). */
export async function fetchOpenBills(supplierId: string): Promise<OpenBillRow[]> {
  if (!supplierId) return [];
  return listOpenBills(supplierId);
}

type JsonHeader = { [key: string]: string };

// ---- purchase orders ----

export interface PoLineInput {
  item_id: string;
  qty: number;
  unit_cost: number;
  gst_rate?: number;
}

export interface PlacePoInput {
  supplier_id: string;
  po_date?: string;
  expected_date?: string;
  branch_id?: string;
  notes?: string;
  lines: PoLineInput[];
}

export async function placePurchaseOrder(input: PlacePoInput): Promise<ActionResult<{ poId: string }>> {
  if (!input.supplier_id) return { ok: false, error: "Pick a supplier." };
  const lines = (input.lines ?? []).filter((l) => l.item_id && Number(l.qty) > 0);
  if (lines.length === 0) return { ok: false, error: "Add at least one line with a quantity." };

  const supabase = createClient();
  const header: JsonHeader = { supplier_id: input.supplier_id };
  if (input.po_date) header.po_date = input.po_date;
  if (input.expected_date) header.expected_date = input.expected_date;
  if (input.branch_id) header.branch_id = input.branch_id;
  if (input.notes?.trim()) header.notes = input.notes.trim();

  const res = await supabase.rpc("place_purchase_order", {
    p_header: header,
    p_lines: lines.map((l) => ({
      item_id: l.item_id,
      qty: Number(l.qty),
      unit_cost: Number(l.unit_cost),
      ...(l.gst_rate != null ? { gst_rate: Number(l.gst_rate) } : {}),
    })),
  });
  if (res.error || !res.data) return fail("placePurchaseOrder", res.error?.message);

  revalidatePath("/purchasing");
  return { ok: true, poId: res.data };
}

// ---- goods receipts ----

export interface GrnLineInput {
  item_id: string;
  qty: number;
  unit_cost: number;
  gst_rate?: number;
}

export interface PostGrnInput {
  supplier_id: string;
  grn_date?: string;
  branch_id?: string;
  po_id?: string;
  supplier_dc_no?: string;
  notes?: string;
  lines: GrnLineInput[];
}

export async function postGrn(input: PostGrnInput): Promise<ActionResult<{ grnId: string }>> {
  if (!input.supplier_id) return { ok: false, error: "Pick a supplier." };
  const lines = (input.lines ?? []).filter((l) => l.item_id && Number(l.qty) > 0 && Number(l.unit_cost) >= 0);
  if (lines.length === 0) return { ok: false, error: "Add at least one received line." };

  const supabase = createClient();
  const header: JsonHeader = { supplier_id: input.supplier_id };
  if (input.grn_date) header.grn_date = input.grn_date;
  if (input.branch_id) header.branch_id = input.branch_id;
  if (input.po_id) header.po_id = input.po_id;
  if (input.supplier_dc_no?.trim()) header.supplier_dc_no = input.supplier_dc_no.trim();
  if (input.notes?.trim()) header.notes = input.notes.trim();

  const res = await supabase.rpc("post_grn", {
    p_header: header,
    p_lines: lines.map((l) => ({
      item_id: l.item_id,
      qty: Number(l.qty),
      unit_cost: Number(l.unit_cost),
      ...(l.gst_rate != null ? { gst_rate: Number(l.gst_rate) } : {}),
    })),
  });
  if (res.error || !res.data) return fail("postGrn", res.error?.message);

  revalidatePath("/purchasing/grn");
  revalidatePath("/purchasing");
  revalidatePath("/stock");
  return { ok: true, grnId: res.data };
}

/** Receive a whole PO in one GRN (post_grn_from_po). */
export async function postGrnFromPo(poId: string, date?: string): Promise<ActionResult<{ grnId: string }>> {
  if (!poId) return { ok: false, error: "Missing purchase order." };
  const supabase = createClient();
  const res = await supabase.rpc("post_grn_from_po", { p_po: poId, ...(date ? { p_date: date } : {}) });
  if (res.error || !res.data) return fail("postGrnFromPo", res.error?.message);

  revalidatePath("/purchasing/grn");
  revalidatePath("/purchasing");
  revalidatePath(`/purchasing/po/${poId}`);
  revalidatePath("/stock");
  return { ok: true, grnId: res.data };
}

// ---- supplier bills ----

export interface BillLineInput {
  item_id?: string;
  expense_account?: string;
  description?: string;
  qty?: number;
  unit_cost: number;
  gst_rate?: number;
}

export interface PostBillInput {
  supplier_id: string;
  bill_date?: string;
  branch_id?: string;
  supplier_bill_no?: string;
  due_date?: string;
  grn_id?: string;
  notes?: string;
  lines: BillLineInput[];
}

export async function postSupplierBill(input: PostBillInput): Promise<ActionResult<{ billId: string }>> {
  if (!input.supplier_id) return { ok: false, error: "Pick a supplier." };
  const lines = (input.lines ?? []).filter(
    (l) => (l.item_id || l.expense_account) && Number(l.unit_cost) >= 0,
  );
  if (lines.length === 0) return { ok: false, error: "Add at least one line (stock item or expense)." };

  const supabase = createClient();
  const header: JsonHeader = { supplier_id: input.supplier_id };
  if (input.bill_date) header.bill_date = input.bill_date;
  if (input.branch_id) header.branch_id = input.branch_id;
  if (input.supplier_bill_no?.trim()) header.supplier_bill_no = input.supplier_bill_no.trim();
  if (input.due_date) header.due_date = input.due_date;
  if (input.grn_id) header.grn_id = input.grn_id;
  if (input.notes?.trim()) header.notes = input.notes.trim();

  const res = await supabase.rpc("post_supplier_bill", {
    p_header: header,
    p_lines: lines.map((l) => ({
      ...(l.item_id ? { item_id: l.item_id } : {}),
      ...(l.expense_account ? { expense_account: l.expense_account } : {}),
      ...(l.description ? { description: l.description } : {}),
      ...(l.qty != null ? { qty: Number(l.qty) } : {}),
      unit_cost: Number(l.unit_cost),
      ...(l.gst_rate != null ? { gst_rate: Number(l.gst_rate) } : {}),
    })),
  });
  if (res.error || !res.data) return fail("postSupplierBill", res.error?.message);

  revalidatePath("/purchasing/bills");
  revalidatePath("/purchasing");
  return { ok: true, billId: res.data };
}

/** Bill a received GRN in one step (post_bill_from_grn). */
export async function postBillFromGrn(
  grnId: string,
  supplierBillNo?: string,
  date?: string,
): Promise<ActionResult<{ billId: string }>> {
  if (!grnId) return { ok: false, error: "Missing GRN." };
  const supabase = createClient();
  const res = await supabase.rpc("post_bill_from_grn", {
    p_grn: grnId,
    ...(supplierBillNo?.trim() ? { p_supplier_bill_no: supplierBillNo.trim() } : {}),
    ...(date ? { p_date: date } : {}),
  });
  if (res.error || !res.data) return fail("postBillFromGrn", res.error?.message);

  revalidatePath("/purchasing/bills");
  revalidatePath("/purchasing/grn");
  revalidatePath(`/purchasing/grn/${grnId}`);
  return { ok: true, billId: res.data };
}

// ---- payments ----

export interface PaymentAllocationInput {
  bill_id: string;
  amount: number;
}

export interface PaySupplierInput {
  supplier_id: string;
  mode: string;
  amount: number;
  payment_date?: string;
  reference?: string;
  source_account?: string;
  notes?: string;
  allocations: PaymentAllocationInput[];
}

export async function paySupplier(input: PaySupplierInput): Promise<ActionResult<{ paymentId: string }>> {
  if (!input.supplier_id) return { ok: false, error: "Pick a supplier." };
  if (!(input.amount > 0)) return { ok: false, error: "Payment amount must be greater than zero." };

  const supabase = createClient();
  const header: { [key: string]: string | number } = {
    supplier_id: input.supplier_id,
    mode: input.mode,
    amount: input.amount,
  };
  if (input.payment_date) header.payment_date = input.payment_date;
  if (input.reference?.trim()) header.reference = input.reference.trim();
  if (input.source_account?.trim()) header.source_account = input.source_account.trim();
  if (input.notes?.trim()) header.notes = input.notes.trim();

  const allocations = (input.allocations ?? []).filter((a) => a.bill_id && Number(a.amount) > 0);

  const res = await supabase.rpc("pay_supplier", {
    p_header: header,
    p_allocations: allocations.map((a) => ({ bill_id: a.bill_id, amount: Number(a.amount) })),
  });
  if (res.error || !res.data) return fail("paySupplier", res.error?.message);

  revalidatePath("/purchasing/pay");
  revalidatePath("/purchasing/bills");
  revalidatePath("/purchasing");
  return { ok: true, paymentId: res.data };
}

// ---- purchase returns (debit notes) ----

export interface PurchaseReturnLineInput {
  item_id: string;
  qty: number;
  gst_rate?: number;
}

export interface RecordPurchaseReturnInput {
  supplier_id: string;
  date?: string;
  branch_id?: string;
  purchase_bill_id?: string;
  reason?: string;
  narration?: string;
  lines: PurchaseReturnLineInput[];
}

export async function recordPurchaseReturn(
  input: RecordPurchaseReturnInput,
): Promise<ActionResult<{ debitNoteId: string }>> {
  if (!input.supplier_id) return { ok: false, error: "Pick a supplier." };
  const lines = (input.lines ?? []).filter((l) => l.item_id && Number(l.qty) > 0);
  if (lines.length === 0) return { ok: false, error: "Add at least one returned line." };

  const supabase = createClient();
  const opts: JsonHeader = {};
  if (input.date) opts.date = input.date;
  if (input.branch_id) opts.branch_id = input.branch_id;
  if (input.purchase_bill_id) opts.purchase_bill_id = input.purchase_bill_id;
  if (input.reason?.trim()) opts.reason = input.reason.trim();
  if (input.narration?.trim()) opts.narration = input.narration.trim();

  const res = await supabase.rpc("record_purchase_return", {
    p_supplier: input.supplier_id,
    p_lines: lines.map((l) => ({
      item_id: l.item_id,
      qty: Number(l.qty),
      ...(l.gst_rate != null ? { gst_rate: Number(l.gst_rate) } : {}),
    })),
    p_opts: opts,
  });
  if (res.error || !res.data) return fail("recordPurchaseReturn", res.error?.message);

  revalidatePath("/purchasing/debit-notes");
  revalidatePath("/purchasing");
  revalidatePath("/stock");
  return { ok: true, debitNoteId: res.data };
}
