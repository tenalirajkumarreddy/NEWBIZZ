"use server";

// =====================================================================
// lib/actions/catalog.ts — Server Actions for Item Master & Rate Master.
//
// Items and price lists are masters (no money/stock impact), so direct
// table writes are acceptable here — no SECURITY DEFINER RPC needed.
// Stock moves and price resolution still go through their RPCs.
// =====================================================================

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import type { ItemType } from "@/lib/data/catalog";

export type CatalogResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

function fail(label: string, msg: string | undefined): { ok: false; error: string } {
  const m = (msg ?? "").trim() || "Something went wrong. Please try again.";
  console.error(`[action:${label}]`, msg);
  return { ok: false, error: m };
}

// ---- Item Master ----

export interface CreateItemInput {
  name: string;
  type: ItemType;
  category_id?: string;
  base_unit_id: string;
  pack_size?: number;
  pack_unit_id?: string;
  hsn_code?: string;
  gst_rate: number;
  cess_rate?: number;
  default_price: number;
  is_sellable?: boolean;
  is_purchasable?: boolean;
  is_stocked?: boolean;
  reorder_level?: number;
}

export async function createItem(
  input: CreateItemInput,
): Promise<CatalogResult<{ itemId: string; sku: string }>> {
  if (!input.name?.trim()) return { ok: false, error: "Name is required." };
  if (!input.base_unit_id) return { ok: false, error: "Base unit is required." };

  const supabase = createClient();
  const { data: sku } = await supabase.rpc("next_entity_code", { p_entity_type: "item" });
  if (!sku) return { ok: false, error: "Could not generate item code." };

  const { data, error } = await supabase
    .from("items")
    .insert({
      sku,
      name: input.name.trim(),
      type: input.type,
      category_id: input.category_id || null,
      base_unit_id: input.base_unit_id,
      pack_size: input.pack_size ?? 1,
      pack_unit_id: input.pack_unit_id || null,
      hsn_code: input.hsn_code?.trim() || null,
      gst_rate: input.gst_rate,
      cess_rate: input.cess_rate ?? 0,
      default_price: input.default_price,
      is_sellable: input.is_sellable ?? true,
      is_purchasable: input.is_purchasable ?? true,
      is_stocked: input.is_stocked ?? true,
      reorder_level: input.reorder_level ?? 0,
    })
    .select("id, sku")
    .single();

  if (error || !data) return fail("createItem", error?.message);
  revalidatePath("/items");
  return { ok: true, itemId: data.id, sku: data.sku };
}

export interface UpdateItemInput extends Partial<CreateItemInput> {
  sku?: string;
  status?: string;
}

export async function updateItem(
  id: string,
  input: UpdateItemInput,
): Promise<CatalogResult> {
  if (!id) return { ok: false, error: "Missing item id." };
  const supabase = createClient();
  const patch: Database["public"]["Tables"]["items"]["Update"] = {};
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.sku !== undefined) patch.sku = input.sku.trim().toUpperCase();
  if (input.type !== undefined) patch.type = input.type;
  if (input.category_id !== undefined) patch.category_id = input.category_id || null;
  if (input.base_unit_id !== undefined) patch.base_unit_id = input.base_unit_id;
  if (input.pack_size !== undefined) patch.pack_size = input.pack_size;
  if (input.pack_unit_id !== undefined) patch.pack_unit_id = input.pack_unit_id || null;
  if (input.hsn_code !== undefined) patch.hsn_code = input.hsn_code?.trim() || null;
  if (input.gst_rate !== undefined) patch.gst_rate = input.gst_rate;
  if (input.cess_rate !== undefined) patch.cess_rate = input.cess_rate;
  if (input.default_price !== undefined) patch.default_price = input.default_price;
  if (input.is_sellable !== undefined) patch.is_sellable = input.is_sellable;
  if (input.is_purchasable !== undefined) patch.is_purchasable = input.is_purchasable;
  if (input.is_stocked !== undefined) patch.is_stocked = input.is_stocked;
  if (input.reorder_level !== undefined) patch.reorder_level = input.reorder_level;
  if (input.status !== undefined) patch.status = input.status;

  const { error } = await supabase.from("items").update(patch).eq("id", id);
  if (error) return fail("updateItem", error.message);
  revalidatePath("/items");
  revalidatePath(`/items/${id}`);
  return { ok: true };
}

// ---- Price Lists ----

export interface CreatePriceListInput {
  code: string;
  name: string;
  is_default?: boolean;
  valid_from?: string;
  valid_to?: string;
}

export async function createPriceList(
  input: CreatePriceListInput,
): Promise<CatalogResult<{ priceListId: string }>> {
  if (!input.code?.trim()) return { ok: false, error: "Code is required." };
  if (!input.name?.trim()) return { ok: false, error: "Name is required." };

  const supabase = createClient();
  const { data, error } = await supabase
    .from("price_lists")
    .insert({
      code: input.code.trim().toUpperCase(),
      name: input.name.trim(),
      is_default: input.is_default ?? false,
      valid_from: input.valid_from ?? new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }),
      valid_to: input.valid_to || null,
    })
    .select("id")
    .single();

  if (error || !data) return fail("createPriceList", error?.message);
  revalidatePath("/pricing");
  return { ok: true, priceListId: data.id };
}

export async function upsertPriceListItem(
  priceListId: string,
  itemId: string,
  unitPrice: number,
  minQty = 0,
): Promise<CatalogResult> {
  if (!priceListId || !itemId) return { ok: false, error: "Missing price list or item." };
  if (!Number.isFinite(unitPrice) || unitPrice < 0)
    return { ok: false, error: "Enter a valid price." };

  const supabase = createClient();
  const { error } = await supabase.from("price_list_items").upsert(
    { price_list_id: priceListId, item_id: itemId, unit_price: unitPrice, min_qty: minQty },
    { onConflict: "price_list_id,item_id,min_qty" },
  );
  if (error) return fail("upsertPriceListItem", error.message);
  revalidatePath(`/pricing/${priceListId}`);
  return { ok: true };
}

export async function deletePriceListItem(
  priceListId: string,
  itemId: string,
  minQty: number,
): Promise<CatalogResult> {
  const supabase = createClient();
  const { error } = await supabase
    .from("price_list_items")
    .delete()
    .eq("price_list_id", priceListId)
    .eq("item_id", itemId)
    .eq("min_qty", minQty);
  if (error) return fail("deletePriceListItem", error.message);
  revalidatePath(`/pricing/${priceListId}`);
  return { ok: true };
}
