// =====================================================================
// lib/data/suppliers.ts — server-only readers for Suppliers & the Approved
// Vendor List (§5.3).
//
// Suppliers are the buy-side party; AP (2110) is keyed by party=supplier. The
// AVL (item_suppliers) links an item to the suppliers that sell it, with price
// and terms, and marks one preferred source. Reads only — writes go through
// lib/actions/suppliers.ts (masters are direct writes; opening balance is an RPC).
// =====================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrap } from "./types";
import type { Database } from "@/lib/supabase/database.types";

type Tables = Database["public"]["Tables"];
export type SupplierKind = Database["public"]["Enums"]["supplier_kind"];

export interface SupplierListRow {
  id: string;
  code: string;
  name: string;
  kind: SupplierKind;
  gstin: string | null;
  stateCode: string;
  phone: string | null;
  city: string | null;
  status: string;
  creditDays: number;
}

type RawSupplier = Pick<
  Tables["suppliers"]["Row"],
  | "id" | "code" | "name" | "kind" | "gstin" | "state_code" | "phone"
  | "email" | "city" | "pincode" | "address_line" | "pan" | "payment_terms"
  | "credit_days" | "status" | "notes"
>;

function toListRow(r: RawSupplier): SupplierListRow {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    kind: r.kind,
    gstin: r.gstin,
    stateCode: r.state_code,
    phone: r.phone,
    city: r.city,
    status: r.status,
    creditDays: r.credit_days,
  };
}

/** All suppliers, newest-relevant first (active before others, then by name). */
export async function listSuppliers(opts: { kind?: SupplierKind } = {}): Promise<SupplierListRow[]> {
  const supabase = createClient();
  let q = supabase
    .from("suppliers")
    .select(
      "id, code, name, kind, gstin, state_code, phone, email, city, pincode, address_line, pan, payment_terms, credit_days, status, notes",
    )
    .order("name");
  if (opts.kind) q = q.eq("kind", opts.kind);
  const rows = unwrap(await q.returns<RawSupplier[]>(), [] as RawSupplier[], "listSuppliers");
  return rows.map(toListRow);
}

export interface AvlItemRow {
  id: string;
  itemId: string;
  itemName: string | null;
  sku: string | null;
  unitPrice: number;
  leadTimeDays: number;
  minOrderQty: number;
  preferred: boolean;
  isActive: boolean;
}

export interface SupplierDetail {
  id: string;
  code: string;
  name: string;
  kind: SupplierKind;
  gstin: string | null;
  pan: string | null;
  stateCode: string;
  phone: string | null;
  email: string | null;
  addressLine: string | null;
  city: string | null;
  pincode: string | null;
  creditDays: number;
  paymentTerms: string | null;
  status: string;
  notes: string | null;
  /** Live payable from supplier_outstanding(id). */
  outstanding: number;
  avl: AvlItemRow[];
}

type RawAvl = Pick<
  Tables["item_suppliers"]["Row"],
  "id" | "item_id" | "unit_price" | "lead_time_days" | "min_order_qty" | "preferred" | "is_active"
> & { item: { name: string; sku: string } | null };

/** One supplier with its live payable and AVL items, or null. */
export async function getSupplier(id: string): Promise<SupplierDetail | null> {
  const supabase = createClient();
  const [supRes, avlRes, outRes] = await Promise.all([
    supabase
      .from("suppliers")
      .select(
        "id, code, name, kind, gstin, state_code, phone, email, city, pincode, address_line, pan, payment_terms, credit_days, status, notes",
      )
      .eq("id", id)
      .maybeSingle()
      .returns<RawSupplier | null>(),
    supabase
      .from("item_suppliers")
      .select(
        "id, item_id, unit_price, lead_time_days, min_order_qty, preferred, is_active, item:items(name, sku)",
      )
      .eq("supplier_id", id)
      .order("preferred", { ascending: false })
      .returns<RawAvl[]>(),
    supabase.rpc("supplier_outstanding", { p_supplier: id }),
  ]);

  const r = unwrap(supRes, null as RawSupplier | null, "getSupplier");
  if (!r) return null;
  const avlRows = unwrap(avlRes, [] as RawAvl[], "getSupplier:avl");

  return {
    id: r.id,
    code: r.code,
    name: r.name,
    kind: r.kind,
    gstin: r.gstin,
    pan: r.pan,
    stateCode: r.state_code,
    phone: r.phone,
    email: r.email,
    addressLine: r.address_line,
    city: r.city,
    pincode: r.pincode,
    creditDays: r.credit_days,
    paymentTerms: r.payment_terms,
    status: r.status,
    notes: r.notes,
    outstanding: Number(outRes.data ?? 0),
    avl: avlRows.map((a) => ({
      id: a.id,
      itemId: a.item_id,
      itemName: a.item?.name ?? null,
      sku: a.item?.sku ?? null,
      unitPrice: Number(a.unit_price),
      leadTimeDays: a.lead_time_days,
      minOrderQty: Number(a.min_order_qty),
      preferred: a.preferred,
      isActive: a.is_active,
    })),
  };
}

// ---- pickers ----

export interface SupplierOption {
  id: string;
  code: string;
  name: string;
  stateCode: string;
}

/** Active suppliers for pickers on the PO / GRN / bill / payment forms. */
export async function listSupplierOptions(): Promise<SupplierOption[]> {
  const supabase = createClient();
  const rows = unwrap(
    await supabase
      .from("suppliers")
      .select("id, code, name, state_code, status")
      .eq("status", "active")
      .order("name")
      .returns<{ id: string; code: string; name: string; state_code: string }[]>(),
    [] as { id: string; code: string; name: string; state_code: string }[],
    "listSupplierOptions",
  );
  return rows.map((r) => ({ id: r.id, code: r.code, name: r.name, stateCode: r.state_code }));
}
