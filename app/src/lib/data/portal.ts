// =====================================================================
// lib/data/portal.ts — server-only readers for the Customer Portal.
//
// Every read goes through a SECURITY DEFINER RPC that resolves the caller's
// customer from `portal_customer_id()` (live tables), so a principal can only
// ever see/act as their own customer. No client-supplied id is trusted.
// Callers should treat a null/empty result as "not a portal principal".
// =====================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrap } from "./types";
import type { Database } from "@/lib/supabase/database.types";

type Fns = Database["public"]["Functions"];

export interface PortalProfile {
  customerId: string;
  code: string;
  name: string;
  gstin: string | null;
  phone: string | null;
  email: string | null;
  outstanding: number;
  storeCount: number;
}

export interface PortalInvoiceRow {
  id: string;
  invoiceNo: string;
  invoiceDate: string;
  status: string;
  storeCode: string;
  storeName: string;
  taxableAmount: number;
  taxTotal: number;
  grandTotal: number;
  amountPaid: number;
  due: number;
}

export interface PortalStatementRow {
  id: string;
  txnType: string;
  referenceId: string | null;
  referenceType: string | null;
  amount: number;
  balanceAfter: number;
  createdAt: string;
  invoiceNo: string | null;
  receiptNo: string | null;
  storeName: string | null;
}

export interface PortalDocumentRow {
  id: string;
  title: string;
  mimeType: string;
  sizeBytes: number;
  entityType: string;
  entityId: string;
  visibility: string;
  createdAt: string;
  uploadedBy: string | null;
}

export interface PortalCatalogRow {
  id: string;
  sku: string;
  name: string;
  gstRate: number;
  defaultPrice: number;
  qtyOnHand: number;
}

export interface PortalPayIntentRow {
  id: string;
  amount: number;
  mode: string;
  reference: string | null;
  status: string;
  createdAt: string;
}

export interface PortalOrderRow {
  id: string;
  orderNo: string;
  orderDate: string;
  status: string;
  storeCode: string;
  storeName: string;
  notes: string | null;
  createdAt: string;
}

export interface PortalStoreRow {
  id: string;
  code: string;
  name: string;
  kind: string;
  city: string | null;
  isPrimary: boolean;
}

/** My portal profile (name, code, outstanding snapshot). Null if not a principal. */
export async function getPortalProfile(): Promise<PortalProfile | null> {
  const supabase = createClient();
  const res = await supabase.rpc("portal_my_profile").returns<Fns["portal_my_profile"]["Returns"]>();
  const rows = unwrap(res, [], "getPortalProfile");
  const p = rows[0];
  if (!p) return null;
  return {
    customerId: p.customer_id,
    code: p.code,
    name: p.name,
    gstin: p.gstin,
    phone: p.phone,
    email: p.email,
    outstanding: Number(p.outstanding),
    storeCount: Number(p.store_count),
  };
}

/** My invoices (optional status filter). Empty when not a portal principal. */
export async function getPortalInvoices(status?: string): Promise<PortalInvoiceRow[]> {
  const supabase = createClient();
  const res = await supabase
    .rpc("portal_my_invoices", status ? { p_status: status } : {})
    .returns<Fns["portal_my_invoices"]["Returns"]>();
  return unwrap(res, [], "getPortalInvoices").map((r) => ({
    id: r.id,
    invoiceNo: r.invoice_no,
    invoiceDate: r.invoice_date,
    status: r.status,
    storeCode: r.store_code,
    storeName: r.store_name,
    taxableAmount: Number(r.taxable_amount),
    taxTotal: Number(r.tax_total),
    grandTotal: Number(r.grand_total),
    amountPaid: Number(r.amount_paid),
    due: Number(r.due),
  }));
}

/** My statement lines, newest first. */
export async function getPortalStatement(
  limit = 50,
  offset = 0,
): Promise<PortalStatementRow[]> {
  const supabase = createClient();
  const res = await supabase
    .rpc("portal_my_statement", { p_limit: limit, p_offset: offset })
    .returns<Fns["portal_my_statement"]["Returns"]>();
  return unwrap(res, [], "getPortalStatement").map((r) => ({
    id: r.id,
    txnType: r.txn_type,
    referenceId: r.reference_id,
    referenceType: r.reference_type,
    amount: Number(r.amount),
    balanceAfter: Number(r.balance_after),
    createdAt: r.created_at,
    invoiceNo: r.invoice_no,
    receiptNo: r.receipt_no,
    storeName: r.store_name,
  }));
}

/** Documents attached to my customer or any of my stores (metadata only). */
export async function getPortalDocuments(): Promise<PortalDocumentRow[]> {
  const supabase = createClient();
  const res = await supabase
    .rpc("portal_my_documents")
    .returns<Fns["portal_my_documents"]["Returns"]>();
  return unwrap(res, [], "getPortalDocuments").map((r) => ({
    id: r.id,
    title: r.title,
    mimeType: r.mime_type,
    sizeBytes: Number(r.size_bytes),
    entityType: r.entity_type,
    entityId: r.entity_id,
    visibility: r.visibility,
    createdAt: r.created_at,
    uploadedBy: r.uploaded_by,
  }));
}

/** Order-building catalog priced at my effective price list. */
export async function getPortalCatalog(): Promise<PortalCatalogRow[]> {
  const supabase = createClient();
  const res = await supabase.rpc("portal_catalog").returns<Fns["portal_catalog"]["Returns"]>();
  return unwrap(res, [], "getPortalCatalog").map((r) => ({
    id: r.id,
    sku: r.sku,
    name: r.name,
    gstRate: Number(r.gst_rate),
    defaultPrice: Number(r.default_price),
    qtyOnHand: Number(r.qty_on_hand),
  }));
}

/** My pay-intent history. */
export async function getPortalPayIntents(): Promise<PortalPayIntentRow[]> {
  const supabase = createClient();
  const res = await supabase
    .rpc("portal_my_pay_intents")
    .returns<Fns["portal_my_pay_intents"]["Returns"]>();
  return unwrap(res, [], "getPortalPayIntents").map((r) => ({
    id: r.id,
    amount: Number(r.amount),
    mode: r.mode,
    reference: r.reference,
    status: r.status,
    createdAt: r.created_at,
  }));
}

/** My orders. */
export async function getPortalOrders(): Promise<PortalOrderRow[]> {
  const supabase = createClient();
  const res = await supabase.rpc("portal_my_orders").returns<Fns["portal_my_orders"]["Returns"]>();
  return unwrap(res, [], "getPortalOrders").map((r) => ({
    id: r.id,
    orderNo: r.order_no,
    orderDate: r.order_date,
    status: r.status,
    storeCode: r.store_code,
    storeName: r.store_name,
    notes: r.notes,
    createdAt: r.created_at,
  }));
}

/** My active stores (for the order form). */
export async function getPortalStores(): Promise<PortalStoreRow[]> {
  const supabase = createClient();
  const res = await supabase.rpc("portal_my_stores").returns<Fns["portal_my_stores"]["Returns"]>();
  return unwrap(res, [], "getPortalStores").map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    kind: r.kind,
    city: r.city,
    isPrimary: r.is_primary,
  }));
}

export interface PortalStatusRow {
  status: string;
  contactPhone: string | null;
  contactEmail: string | null;
  updatedAt: string | null;
}

/** Admin read of a customer's portal row (RLS: internal staff only). */
export async function getCustomerPortalStatus(customerId: string): Promise<PortalStatusRow | null> {
  const supabase = createClient();
  const res = await supabase
    .from("customer_portal")
    .select("status, contact_phone, contact_email, updated_at")
    .eq("customer_id", customerId)
    .maybeSingle()
    .returns<{
      status: string;
      contact_phone: string | null;
      contact_email: string | null;
      updated_at: string | null;
    } | null>();
  const row = unwrap(res, null, "getCustomerPortalStatus");
  if (!row) return null;
  return {
    status: row.status,
    contactPhone: row.contact_phone,
    contactEmail: row.contact_email,
    updatedAt: row.updated_at,
  };
}
