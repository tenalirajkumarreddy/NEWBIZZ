// =====================================================================
// lib/data/collections.ts — server-only readers for Collections (§4.6).
//
// Reads only (Invariant 3): the receipts register, a receipt's allocations,
// customers for the receipt form, and a customer's open invoices for the
// allocation picker. record_receipt (SECURITY DEFINER) does every write.
// RLS runs under the caller's JWT.
// =====================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrap } from "./types";
import type { Database } from "@/lib/supabase/database.types";

export type ReceiptMode = Database["public"]["Enums"]["receipt_mode"];

// ---- receipts register ----

export interface ReceiptListRow {
  id: string;
  receipt_no: string;
  receipt_date: string;
  mode: ReceiptMode;
  methodName: string | null;
  amount: number;
  allocatedAmount: number;
  reference: string | null;
  status: string;
  customerName: string | null;
  customerId: string | null;
  storeName: string | null;
  /** '1110' cash · '1120' bank · '2140' user custody */
  depositAccount: string;
}

const RECEIPT_SELECT =
  "id, receipt_no, receipt_date, mode, method_id, amount, allocated_amount, reference, status, " +
  "deposit_account, customer_id, customer:customers(name), store:customer_stores(name), " +
  "method:payment_methods(name)";

type RawReceipt = {
  id: string;
  receipt_no: string;
  receipt_date: string;
  mode: ReceiptMode;
  method_id: string;
  amount: number;
  allocated_amount: number;
  reference: string | null;
  status: string;
  deposit_account: string;
  customer_id: string | null;
  customer: { name: string } | null;
  store: { name: string } | null;
  method: { name: string } | null;
};

/** Recent receipts, newest first. [] on a blocked/failed read. */
export async function listReceipts(opts: { limit?: number } = {}): Promise<ReceiptListRow[]> {
  const supabase = createClient();
  const res = await supabase
    .from("customer_receipts")
    .select(RECEIPT_SELECT)
    .order("receipt_date", { ascending: false })
    .order("receipt_no", { ascending: false })
    .limit(opts.limit ?? 100)
    .returns<RawReceipt[]>();

  const rows = unwrap(res, [] as RawReceipt[], "listReceipts");
  return rows.map((r) => ({
    id: r.id,
    receipt_no: r.receipt_no,
    receipt_date: r.receipt_date,
    mode: r.mode,
    amount: Number(r.amount),
    allocatedAmount: Number(r.allocated_amount),
    reference: r.reference,
    status: r.status,
    customerName: r.customer?.name ?? null,
    customerId: r.customer_id,
    storeName: r.store?.name ?? null,
    methodName: r.method?.name ?? null,
    depositAccount: r.deposit_account,
  }));
}

// ---- form pickers ----

export interface CustomerOption {
  id: string;
  name: string;
}

/** Active customers for the receipt form's payer picker. */
export async function listCustomers(): Promise<CustomerOption[]> {
  const supabase = createClient();
  const res = await supabase
    .from("customers")
    .select("id, name, status")
    .eq("status", "active")
    .order("name")
    .returns<{ id: string; name: string; status: string }[]>();
  const rows = unwrap(res, [], "listCustomers");
  return rows.map((r) => ({ id: r.id, name: r.name }));
}

export interface StoreOption {
  id: string;
  name: string;
  code: string;
  kind: string;
  customerId: string;
  customerName: string;
}

/** All active stores for the receipt form's store picker. */
export async function listAllStores(): Promise<StoreOption[]> {
  const supabase = createClient();
  const res = await supabase
    .from("customer_stores")
    .select("id, name, code, kind, customer_id, customer:customers(name)")
    .eq("status", "active")
    .order("name")
    .returns<{ id: string; name: string; code: string; kind: string; customer_id: string; customer: { name: string } | null }[]>();
  const rows = unwrap(res, [], "listAllStores");
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    code: r.code,
    kind: r.kind,
    customerId: r.customer_id,
    customerName: r.customer?.name ?? "—",
  }));
}

export interface OpenInvoiceRow {
  id: string;
  invoice_no: string;
  invoice_date: string;
  grandTotal: number;
  amountPaid: number;
  /** grand_total − amount_paid (read-model, maintained by record_receipt). */
  outstanding: number;
  storeName: string | null;
}

export interface PaymentMethodOption {
  id: string;
  name: string;
  destination: string;
  destinationLabel: string;
}

/** Active payment methods for the receipt form's method picker. */
export async function listPaymentMethods(): Promise<PaymentMethodOption[]> {
  const supabase = createClient();
  const res = await supabase
    .from("payment_methods")
    .select("id, name, destination")
    .eq("is_active", true)
    .order("sort_order")
    .returns<{ id: string; name: string; destination: string }[]>();
  const rows = unwrap(res, [], "listPaymentMethods");
  const labels: Record<string, string> = {
    user_cash: "User cash holding",
    bank: "Bank account",
    cheques_in_hand: "Cheques in hand",
    customer_advance: "Customer advance",
  };
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    destination: r.destination,
    destinationLabel: labels[r.destination] ?? r.destination,
  }));
}

/** A customer's unpaid/partly-paid invoices for the allocation picker. */
export async function listOpenInvoices(customerId: string): Promise<OpenInvoiceRow[]> {
  if (!customerId) return [];
  const supabase = createClient();
  const res = await supabase
    .from("invoices")
    .select("id, invoice_no, invoice_date, grand_total, amount_paid, status, store:customer_stores(name)")
    .eq("customer_id", customerId)
    .in("status", ["posted", "part_paid"])
    .order("invoice_date", { ascending: true })
    .returns<
      {
        id: string;
        invoice_no: string;
        invoice_date: string;
        grand_total: number;
        amount_paid: number;
        status: string;
        store: { name: string } | null;
      }[]
    >();

  const rows = unwrap(res, [], "listOpenInvoices");
  return rows.map((r) => ({
    id: r.id,
    invoice_no: r.invoice_no,
    invoice_date: r.invoice_date,
    grandTotal: Number(r.grand_total),
    amountPaid: Number(r.amount_paid),
    outstanding: Number(r.grand_total) - Number(r.amount_paid),
    storeName: r.store?.name ?? null,
  }));
}

// ---- payment intents (portal "I paid" suggestions) ----

export interface PaymentIntentRow {
  id: string;
  amount: number;
  mode: string;
  reference: string | null;
  note: string | null;
  status: "pending" | "matched" | "void";
  createdAt: string;
  customerId: string | null;
  customerName: string | null;
  matchedReceiptId: string | null;
  matchedReceiptNo: string | null;
}

const INTENT_SELECT =
  "id, amount, mode, reference, note, status, created_at, customer_id, matched_receipt_id, " +
  "customer:customers(name), receipt:customer_receipts!matched_receipt_id(receipt_no)";

type RawIntent = {
  id: string;
  amount: number;
  mode: string;
  reference: string | null;
  note: string | null;
  status: "pending" | "matched" | "void";
  created_at: string;
  customer_id: string | null;
  matched_receipt_id: string | null;
  customer: { name: string } | null;
  receipt: { receipt_no: string } | null;
};

/**
 * Payment intents visible to staff (RLS: receipt.record/accounting.manage only).
 * Newest first. Use opts.status to filter to a single status.
 */
export async function listPaymentIntents(opts: { status?: string; customerId?: string } = {}): Promise<PaymentIntentRow[]> {
  const supabase = createClient();
  let q = supabase.from("payment_intents").select(INTENT_SELECT);
  if (opts.status) q = q.eq("status", opts.status);
  if (opts.customerId) q = q.eq("customer_id", opts.customerId);
  const res = await q.order("created_at", { ascending: false }).returns<RawIntent[]>();
  const rows = unwrap(res, [] as RawIntent[], "listPaymentIntents");
  return rows.map((r) => ({
    id: r.id,
    amount: Number(r.amount),
    mode: r.mode,
    reference: r.reference,
    note: r.note,
    status: r.status,
    createdAt: r.created_at,
    customerId: r.customer_id,
    customerName: r.customer?.name ?? null,
    matchedReceiptId: r.matched_receipt_id,
    matchedReceiptNo: r.receipt?.receipt_no ?? null,
  }));
}

/**
 * Resolve an invoice to its paying customer — used by the ?invoice= deep link
 * from the Sales Desk "Payment" button to preselect customer + allocation.
 * Null if the invoice is missing, void, or already fully paid.
 */
export async function getReceiptPrefill(
  invoiceId: string,
): Promise<{ customerId: string; storeId: string; invoiceId: string } | null> {
  if (!invoiceId) return null;
  const supabase = createClient();
  const res = await supabase
    .from("invoices")
    .select("id, customer_id, store_id, status")
    .eq("id", invoiceId)
    .maybeSingle()
    .returns<{ id: string; customer_id: string; store_id: string; status: string } | null>();
  const row = unwrap(res, null, "getReceiptPrefill");
  if (!row || !["posted", "part_paid"].includes(row.status)) return null;
  return { customerId: row.customer_id, storeId: row.store_id, invoiceId: row.id };
}
