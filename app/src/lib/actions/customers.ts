"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export type CustomerResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

function fail(label: string, msg: string | undefined): { ok: false; error: string } {
  const m = (msg ?? "").trim() || "Something went wrong. Please try again.";
  console.error(`[action:${label}]`, msg);
  return { ok: false, error: m };
}

export interface CreateCustomerInput {
  name: string;
  gstin?: string;
  pan?: string;
  phone: string;
  email?: string;
  state_code?: string;
  credit_limit?: number;
  credit_days?: number;
}

async function checkPhoneUnique(
  supabase: ReturnType<typeof createClient>,
  phone: string,
  excludeId?: string,
): Promise<string | null> {
  if (!phone?.trim()) return null;
  const q = supabase.from("customers").select("id").neq("id", excludeId ?? "").eq("phone", phone.trim()).maybeSingle();
  const { data } = await q;
  return data ? "This phone number is already registered to another customer." : null;
}
export async function createCustomer(
  input: CreateCustomerInput,
): Promise<CustomerResult<{ customerId: string; code: string }>> {
  if (!input.name?.trim()) return { ok: false, error: "Name is required." };
  if (!input.phone?.trim()) return { ok: false, error: "Phone number is required." };

  const supabase = createClient();

  const phoneConflict = await checkPhoneUnique(supabase, input.phone);
  if (phoneConflict) return { ok: false, error: phoneConflict };

  const { data: code } = await supabase.rpc("next_entity_code", { p_entity_type: "customer" });
  if (!code) return { ok: false, error: "Could not generate customer code." };

  const { data, error } = await supabase
    .from("customers")
    .insert({
      code,
      name: input.name.trim(),
      gstin: input.gstin?.trim() || null,
      pan: input.pan?.trim() || null,
      phone: input.phone.trim(),
      email: input.email?.trim() || null,
      state_code: input.state_code || "33",
      credit_limit: input.credit_limit ?? 0,
      credit_days: input.credit_days ?? 0,
    })
    .select("id, code")
    .single();

  if (error || !data) return fail("createCustomer", error?.message);
  revalidatePath("/customers");
  return { ok: true, customerId: data.id, code: data.code };
}

export interface UpdateCustomerInput {
  name?: string;
  gstin?: string;
  pan?: string;
  phone?: string;
  email?: string;
  state_code?: string;
  credit_limit?: number;
  credit_days?: number;
  status?: string;
}

export async function updateCustomer(
  id: string,
  input: UpdateCustomerInput,
): Promise<CustomerResult> {
  if (!id) return { ok: false, error: "Missing customer id." };
  const supabase = createClient();

  if (input.phone !== undefined) {
    if (!input.phone?.trim()) return { ok: false, error: "Phone number is required." };
    const phoneConflict = await checkPhoneUnique(supabase, input.phone, id);
    if (phoneConflict) return { ok: false, error: phoneConflict };
  }

  const patch: Database["public"]["Tables"]["customers"]["Update"] = {};
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.gstin !== undefined) patch.gstin = input.gstin?.trim() || null;
  if (input.pan !== undefined) patch.pan = input.pan?.trim() || null;
  if (input.phone !== undefined) patch.phone = input.phone.trim();
  if (input.email !== undefined) patch.email = input.email?.trim() || null;
  if (input.state_code !== undefined) patch.state_code = input.state_code;
  if (input.credit_limit !== undefined) patch.credit_limit = input.credit_limit;
  if (input.credit_days !== undefined) patch.credit_days = input.credit_days;
  if (input.status !== undefined) patch.status = input.status;

  const { error } = await supabase.from("customers").update(patch).eq("id", id);
  if (error) return fail("updateCustomer", error.message);
  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  return { ok: true };
}

export interface CreateStoreInput {
  customer_id: string;
  name: string;
  kind: "retail" | "wholesale" | "distributor" | "institution";
  contact_name?: string;
  phone?: string;
  address_line?: string;
  area?: string;
  city?: string;
  pincode?: string;
  state_code?: string;
  price_list_id?: string;
  is_primary?: boolean;
}

export async function createStore(
  input: CreateStoreInput,
): Promise<CustomerResult<{ storeId: string }>> {
  if (!input.customer_id) return { ok: false, error: "Missing customer." };
  if (!input.name?.trim()) return { ok: false, error: "Store name is required." };

  const supabase = createClient();
  const { data: code } = await supabase.rpc("next_entity_code", { p_entity_type: "store" });
  if (!code) return { ok: false, error: "Could not generate store code." };

  const { data, error } = await supabase
    .from("customer_stores")
    .insert({
      customer_id: input.customer_id,
      code,
      name: input.name.trim(),
      kind: input.kind,
      contact_name: input.contact_name?.trim() || null,
      phone: input.phone?.trim() || null,
      address_line: input.address_line?.trim() || null,
      area: input.area?.trim() || null,
      city: input.city?.trim() || null,
      pincode: input.pincode?.trim() || null,
      state_code: input.state_code || "33",
      price_list_id: input.price_list_id || null,
      is_primary: input.is_primary ?? false,
    })
    .select("id")
    .single();

  if (error || !data) return fail("createStore", error?.message);
  revalidatePath(`/customers/${input.customer_id}`);
  return { ok: true, storeId: data.id };
}

export async function moveStore(
  storeId: string,
  newCustomerId: string,
): Promise<CustomerResult> {
  if (!storeId) return { ok: false, error: "Missing store id." };
  if (!newCustomerId) return { ok: false, error: "Missing new customer." };
  const supabase = createClient();
  const { data, error } = await supabase.rpc("unlink_store_from_customer", {
    p_store: storeId,
    p_new_customer: newCustomerId,
  });
  if (error) return fail("moveStore", error.message);
  revalidatePath("/customers");
  revalidatePath(`/customers/${newCustomerId}`);
  return { ok: true };
}

export interface UpdateStoreInput {
  kind?: "retail" | "wholesale" | "distributor" | "institution";
  contact_name?: string;
  phone?: string;
  address_line?: string;
  area?: string;
  city?: string;
  pincode?: string;
  state_code?: string;
  price_list_id?: string | null;
  is_primary?: boolean;
  geo_lat?: number | null;
  geo_lng?: number | null;
}

export async function updateStore(
  storeId: string,
  customerId: string,
  input: UpdateStoreInput,
): Promise<CustomerResult> {
  if (!storeId) return { ok: false, error: "Missing store id." };
  const supabase = createClient();
  const patch: Database["public"]["Tables"]["customer_stores"]["Update"] = {};
  if (input.kind !== undefined) patch.kind = input.kind;
  if (input.contact_name !== undefined) patch.contact_name = input.contact_name?.trim() || null;
  if (input.phone !== undefined) patch.phone = input.phone?.trim() || null;
  if (input.address_line !== undefined) patch.address_line = input.address_line?.trim() || null;
  if (input.area !== undefined) patch.area = input.area?.trim() || null;
  if (input.city !== undefined) patch.city = input.city?.trim() || null;
  if (input.pincode !== undefined) patch.pincode = input.pincode?.trim() || null;
  if (input.state_code !== undefined) patch.state_code = input.state_code;
  if (input.price_list_id !== undefined) patch.price_list_id = input.price_list_id || null;
  if (input.is_primary !== undefined) patch.is_primary = input.is_primary;
  if (input.geo_lat !== undefined) patch.geo_lat = input.geo_lat;
  if (input.geo_lng !== undefined) patch.geo_lng = input.geo_lng;

  if (input.is_primary === true) {
    await supabase.from("customer_stores").update({ is_primary: false }).eq("customer_id", customerId).neq("id", storeId);
  }

  const { error } = await supabase.from("customer_stores").update(patch).eq("id", storeId);
  if (error) return fail("updateStore", error.message);
  revalidatePath(`/customers/${customerId}`);
  revalidatePath(`/customers/${customerId}/stores/${storeId}`);
  return { ok: true };
}

export async function setStoreStatus(
  storeId: string,
  customerId: string,
  status: "active" | "inactive",
): Promise<CustomerResult> {
  if (!storeId) return { ok: false, error: "Missing store id." };
  const supabase = createClient();
  const { error } = await supabase.from("customer_stores").update({ status }).eq("id", storeId);
  if (error) return fail("setStoreStatus", error.message);
  revalidatePath(`/customers/${customerId}`);
  revalidatePath(`/customers/${customerId}/stores/${storeId}`);
  return { ok: true };
}

export async function setPartyImage(
  target: "customer" | "store",
  id: string,
  imageUrl: string | null,
  customerId?: string,
): Promise<CustomerResult> {
  if (!id) return { ok: false, error: "Missing id." };
  const supabase = createClient();
  const table = target === "customer" ? "customers" : "customer_stores";
  const { error } = await supabase.from(table).update({ image_url: imageUrl }).eq("id", id);
  if (error) return fail("setPartyImage", error.message);
  if (target === "customer") {
    revalidatePath(`/customers/${id}`);
  } else if (customerId) {
    revalidatePath(`/customers/${customerId}`);
    revalidatePath(`/customers/${customerId}/stores/${id}`);
  }
  return { ok: true };
}


