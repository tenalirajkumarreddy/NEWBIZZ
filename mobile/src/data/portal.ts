import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { isPortal } from "@/lib/claims";
import { rpc, RpcError } from "@/lib/rpc";
import { qk } from "./keys";

// =====================================================================
// src/data/portal.ts — customer-portal data layer for the APK.
//
// Every read/write goes through the 0091 SECURITY DEFINER portal RPCs,
// which resolve the caller's customer from the JWT's portal_customer_id —
// no client-supplied customer id is trusted. All queries are enabled only
// for portal principals (isPortal), so staff devices never fire them.
// =====================================================================

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

export function usePortalProfile() {
  const { user, claims } = useSession();
  return useQuery({
    queryKey: qk.portalProfile(),
    enabled: !!user?.id && isPortal(claims),
    queryFn: async (): Promise<PortalProfile | null> => {
      const rows = await rpc<Record<string, unknown>[]>("portal_my_profile");
      const p = rows?.[0];
      if (!p) return null;
      return {
        customerId: String(p.customer_id),
        code: String(p.code),
        name: String(p.name),
        gstin: (p.gstin as string) ?? null,
        phone: (p.phone as string) ?? null,
        email: (p.email as string) ?? null,
        outstanding: Number(p.outstanding ?? 0),
        storeCount: Number(p.store_count ?? 0),
      };
    },
  });
}

export interface PortalInvoice {
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

export function usePortalInvoices(enabled = true) {
  const { user, claims } = useSession();
  return useQuery({
    queryKey: qk.portalInvoices("all"),
    enabled: !!user?.id && isPortal(claims) && enabled,
    queryFn: async (): Promise<PortalInvoice[]> => {
      const rows = await rpc<Record<string, unknown>[]>("portal_my_invoices");
      return (rows ?? []).map((r) => ({
        id: String(r.id),
        invoiceNo: String(r.invoice_no),
        invoiceDate: String(r.invoice_date),
        status: String(r.status),
        storeCode: String(r.store_code),
        storeName: String(r.store_name),
        taxableAmount: Number(r.taxable_amount ?? 0),
        taxTotal: Number(r.tax_total ?? 0),
        grandTotal: Number(r.grand_total ?? 0),
        amountPaid: Number(r.amount_paid ?? 0),
        due: Number(r.due ?? 0),
      }));
    },
  });
}

export interface PortalStatementLine {
  id: string;
  txnType: string;
  amount: number;
  balanceAfter: number;
  createdAt: string;
  invoiceNo: string | null;
  receiptNo: string | null;
  storeName: string | null;
}

export function usePortalStatement(limit = 100, enabled = true) {
  const { user, claims } = useSession();
  return useQuery({
    queryKey: qk.portalStatement(limit),
    enabled: !!user?.id && isPortal(claims) && enabled,
    queryFn: async (): Promise<PortalStatementLine[]> => {
      const rows = await rpc<Record<string, unknown>[]>("portal_my_statement", {
        p_limit: limit,
        p_offset: 0,
      });
      return (rows ?? []).map((r) => ({
        id: String(r.id),
        txnType: String(r.txn_type),
        amount: Number(r.amount ?? 0),
        balanceAfter: Number(r.balance_after ?? 0),
        createdAt: String(r.created_at),
        invoiceNo: (r.invoice_no as string) ?? null,
        receiptNo: (r.receipt_no as string) ?? null,
        storeName: (r.store_name as string) ?? null,
      }));
    },
  });
}

export interface PortalOrder {
  id: string;
  orderNo: string;
  orderDate: string;
  status: string;
  storeCode: string;
  storeName: string;
  notes: string | null;
  createdAt: string;
}

export function usePortalOrders(enabled = true) {
  const { user, claims } = useSession();
  return useQuery({
    queryKey: qk.portalOrders(),
    enabled: !!user?.id && isPortal(claims) && enabled,
    queryFn: async (): Promise<PortalOrder[]> => {
      const rows = await rpc<Record<string, unknown>[]>("portal_my_orders");
      return (rows ?? []).map((r) => ({
        id: String(r.id),
        orderNo: String(r.order_no),
        orderDate: String(r.order_date),
        status: String(r.status),
        storeCode: String(r.store_code),
        storeName: String(r.store_name),
        notes: (r.notes as string) ?? null,
        createdAt: String(r.created_at),
      }));
    },
  });
}

export interface PortalStore {
  id: string;
  code: string;
  name: string;
  kind: string;
  city: string | null;
  isPrimary: boolean;
}

export function usePortalStores(enabled = true) {
  const { user, claims } = useSession();
  return useQuery({
    queryKey: qk.portalStores(),
    enabled: !!user?.id && isPortal(claims) && enabled,
    queryFn: async (): Promise<PortalStore[]> => {
      const rows = await rpc<Record<string, unknown>[]>("portal_my_stores");
      return (rows ?? []).map((r) => ({
        id: String(r.id),
        code: String(r.code),
        name: String(r.name),
        kind: String(r.kind),
        city: (r.city as string) ?? null,
        isPrimary: !!r.is_primary,
      }));
    },
  });
}

export interface PortalCatalogItem {
  id: string;
  sku: string;
  name: string;
  gstRate: number;
  defaultPrice: number;
  qtyOnHand: number;
}

export function usePortalCatalog(enabled = true) {
  const { user, claims } = useSession();
  return useQuery({
    queryKey: qk.portalCatalog(),
    enabled: !!user?.id && isPortal(claims) && enabled,
    queryFn: async (): Promise<PortalCatalogItem[]> => {
      const rows = await rpc<Record<string, unknown>[]>("portal_catalog");
      return (rows ?? []).map((r) => ({
        id: String(r.id),
        sku: String(r.sku),
        name: String(r.name),
        gstRate: Number(r.gst_rate ?? 0),
        defaultPrice: Number(r.default_price ?? 0),
        qtyOnHand: Number(r.qty_on_hand ?? 0),
      }));
    },
  });
}

export interface PortalPayIntent {
  id: string;
  amount: number;
  mode: string;
  reference: string | null;
  status: string;
  createdAt: string;
}

export function usePortalPayIntents(enabled = true) {
  const { user, claims } = useSession();
  return useQuery({
    queryKey: qk.portalPayIntents(),
    enabled: !!user?.id && isPortal(claims) && enabled,
    queryFn: async (): Promise<PortalPayIntent[]> => {
      const rows = await rpc<Record<string, unknown>[]>("portal_my_pay_intents");
      return (rows ?? []).map((r) => ({
        id: String(r.id),
        amount: Number(r.amount ?? 0),
        mode: String(r.mode),
        reference: (r.reference as string) ?? null,
        status: String(r.status),
        createdAt: String(r.created_at),
      }));
    },
  });
}

export interface PortalDocument {
  id: string;
  title: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export function usePortalDocuments(enabled = true) {
  const { user, claims } = useSession();
  return useQuery({
    queryKey: qk.portalDocuments(),
    enabled: !!user?.id && isPortal(claims) && enabled,
    queryFn: async (): Promise<PortalDocument[]> => {
      const rows = await rpc<Record<string, unknown>[]>("portal_my_documents");
      return (rows ?? []).map((r) => ({
        id: String(r.id),
        title: String(r.title),
        mimeType: String(r.mime_type),
        sizeBytes: Number(r.size_bytes ?? 0),
        createdAt: String(r.created_at),
      }));
    },
  });
}

export type PortalPayMode = "cash" | "upi" | "cheque" | "bank";

export interface SubmitPayIntentInput {
  amount: number;
  mode: PortalPayMode;
  reference?: string;
  note?: string;
}

/** "I paid" suggestion — staff reconcile it in the main app. */
export async function submitPortalPayIntent(input: SubmitPayIntentInput): Promise<string> {
  const intentId = await rpc<string>("portal_submit_pay_intent", {
    p_amount: input.amount,
    p_mode: input.mode,
    ...(input.reference?.trim() ? { p_reference: input.reference.trim() } : {}),
    ...(input.note?.trim() ? { p_note: input.note.trim() } : {}),
  });
  return String(intentId);
}

export interface PortalOrderLine {
  item_id: string;
  qty: number;
  unit_price?: number;
}

export interface CreateOrderInput {
  storeId: string;
  notes?: string;
  lines: PortalOrderLine[];
}

/** Order-capture only — no ledger/stock movement until staff convert it. */
export async function createPortalOrder(input: CreateOrderInput): Promise<string> {
  const orderId = await rpc<string>("portal_create_order", {
    p_store_id: input.storeId,
    p_notes: input.notes?.trim() || "",
    p_lines: input.lines,
  });
  return String(orderId);
}

/** One-shot invalidation after any portal mutation. */
export function usePortalInvalidate() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["portalProfile"] });
    void qc.invalidateQueries({ queryKey: ["portalInvoices"] });
    void qc.invalidateQueries({ queryKey: ["portalStatement"] });
    void qc.invalidateQueries({ queryKey: ["portalOrders"] });
    void qc.invalidateQueries({ queryKey: ["portalPayIntents"] });
  };
}

export { RpcError };
