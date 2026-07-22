"use server";

// =====================================================================
// lib/actions/suppliers.ts — Server Actions for Suppliers & AVL (§5.3).
//
// Supplier and AVL records are commercial masters with no money/stock impact,
// so they're written directly under RLS (has_permission('purchase.manage')).
// The one ledger action is the opening balance, which posts a journal via RPC.
// =====================================================================

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "./sales";
import type { Database } from "@/lib/supabase/database.types";

function fail(label: string, message: string | undefined): { ok: false; error: string } {
  const msg = (message ?? "").trim() || "Something went wrong. Please try again.";
  console.error(`[action:${label}]`, message);
  return { ok: false, error: msg };
}

type SupplierInsert = Database["public"]["Tables"]["suppliers"]["Insert"];
type SupplierUpdate = Database["public"]["Tables"]["suppliers"]["Update"];
type AvlInsert = Database["public"]["Tables"]["item_suppliers"]["Insert"];

export interface SupplierInput {
  name: string;
  kind: Database["public"]["Enums"]["supplier_kind"];
  gstin?: string;
  pan?: string;
  state_code: string;
  phone?: string;
  email?: string;
  address_line?: string;
  city?: string;
  pincode?: string;
  credit_days?: number;
  payment_terms?: string;
  notes?: string;
}

export async function createSupplier(input: SupplierInput): Promise<ActionResult<{ supplierId: string }>> {
  if (!input.name?.trim()) return { ok: false, error: "Give the supplier a name." };
  if (!input.state_code?.trim()) return { ok: false, error: "State code is required (drives GST)." };

  const supabase = createClient();
  const { data: code } = await supabase.rpc("next_entity_code", { p_entity_type: "supplier" });
  if (!code) return { ok: false, error: "Could not generate supplier code." };
  const payload: SupplierInsert = {
    code,
    name: input.name.trim(),
    kind: input.kind,
    gstin: input.gstin?.trim() || null,
    pan: input.pan?.trim() || null,
    state_code: input.state_code.trim(),
    phone: input.phone?.trim() || null,
    email: input.email?.trim() || null,
    address_line: input.address_line?.trim() || null,
    city: input.city?.trim() || null,
    pincode: input.pincode?.trim() || null,
    credit_days: input.credit_days ?? 0,
    payment_terms: input.payment_terms?.trim() || null,
    notes: input.notes?.trim() || null,
  };
  const res = await supabase.from("suppliers").insert(payload).select("id").maybeSingle();
  if (res.error || !res.data) return fail("createSupplier", res.error?.message);

  revalidatePath("/suppliers");
  return { ok: true, supplierId: res.data.id };
}

export async function updateSupplier(id: string, patch: Partial<SupplierInput> & { status?: string }): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Missing supplier." };
  const supabase = createClient();
  const update: SupplierUpdate = {};
  if (patch.name !== undefined) update.name = patch.name.trim();
  if (patch.kind !== undefined) update.kind = patch.kind;
  if (patch.gstin !== undefined) update.gstin = patch.gstin.trim() || null;
  if (patch.pan !== undefined) update.pan = patch.pan.trim() || null;
  if (patch.state_code !== undefined) update.state_code = patch.state_code.trim();
  if (patch.phone !== undefined) update.phone = patch.phone.trim() || null;
  if (patch.email !== undefined) update.email = patch.email.trim() || null;
  if (patch.address_line !== undefined) update.address_line = patch.address_line.trim() || null;
  if (patch.city !== undefined) update.city = patch.city.trim() || null;
  if (patch.pincode !== undefined) update.pincode = patch.pincode.trim() || null;
  if (patch.credit_days !== undefined) update.credit_days = patch.credit_days;
  if (patch.payment_terms !== undefined) update.payment_terms = patch.payment_terms.trim() || null;
  if (patch.notes !== undefined) update.notes = patch.notes.trim() || null;
  if (patch.status !== undefined) update.status = patch.status;

  const res = await supabase.from("suppliers").update(update).eq("id", id);
  if (res.error) return fail("updateSupplier", res.error.message);

  revalidatePath("/suppliers");
  revalidatePath(`/suppliers/${id}`);
  return { ok: true };
}

// ---- AVL ----

export interface AvlInput {
  item_id: string;
  supplier_id: string;
  unit_price: number;
  lead_time_days?: number;
  min_order_qty?: number;
  preferred?: boolean;
}

/**
 * Add or update an AVL row (item↔supplier). When `preferred` is set, any other
 * preferred row for the item is first cleared, so the one-preferred-per-item
 * index never trips. onConflict upsert on (item_id, supplier_id).
 */
export async function upsertAvl(input: AvlInput): Promise<ActionResult> {
  if (!input.item_id || !input.supplier_id) return { ok: false, error: "Pick an item and a supplier." };

  const supabase = createClient();
  if (input.preferred) {
    const clear = await supabase
      .from("item_suppliers")
      .update({ preferred: false })
      .eq("item_id", input.item_id)
      .neq("supplier_id", input.supplier_id);
    if (clear.error) return fail("upsertAvl:clear", clear.error.message);
  }
  const payload: AvlInsert = {
    item_id: input.item_id,
    supplier_id: input.supplier_id,
    unit_price: input.unit_price,
    lead_time_days: input.lead_time_days ?? 0,
    min_order_qty: input.min_order_qty ?? 0,
    preferred: input.preferred ?? false,
  };
  const res = await supabase.from("item_suppliers").upsert(payload, { onConflict: "item_id,supplier_id" });
  if (res.error) return fail("upsertAvl", res.error.message);

  revalidatePath(`/suppliers/${input.supplier_id}`);
  return { ok: true };
}

export async function removeAvl(id: string, supplierId: string): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Missing AVL row." };
  const supabase = createClient();
  const res = await supabase.from("item_suppliers").delete().eq("id", id);
  if (res.error) return fail("removeAvl", res.error.message);
  revalidatePath(`/suppliers/${supplierId}`);
  return { ok: true };
}

// ---- opening balance (ledger via RPC) ----

export async function supplierOpeningBalance(
  supplierId: string,
  amount: number,
  asOf?: string,
  narration?: string,
): Promise<ActionResult> {
  if (!supplierId) return { ok: false, error: "Missing supplier." };
  if (!amount || amount === 0) return { ok: false, error: "Opening balance must be non-zero." };

  const supabase = createClient();
  const res = await supabase.rpc("supplier_opening_balance", {
    p_supplier: supplierId,
    p_amount: amount,
    ...(asOf ? { p_as_of: asOf } : {}),
    ...(narration?.trim() ? { p_narration: narration.trim() } : {}),
  });
  if (res.error) return fail("supplierOpeningBalance", res.error.message);

  revalidatePath(`/suppliers/${supplierId}`);
  return { ok: true };
}
