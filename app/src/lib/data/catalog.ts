// =====================================================================
// lib/data/catalog.ts — server-only readers for Item Master & Rate Master.
//
// Items, categories, units, price lists, and price list items.
// All reads are RLS-scoped under the caller's JWT. No writes here —
// mutations go through lib/actions/catalog.ts.
// =====================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrap } from "./types";
import type { Database } from "@/lib/supabase/database.types";

type Tables = Database["public"]["Tables"];
export type ItemType = Database["public"]["Enums"]["item_type"];

// ---- units ----

export interface UnitOption {
  id: string;
  code: string;
  name: string;
}

export async function listUnits(): Promise<UnitOption[]> {
  const supabase = createClient();
  const res = await supabase
    .from("units")
    .select("id, code, name")
    .order("code")
    .returns<UnitOption[]>();
  return unwrap(res, [], "listUnits");
}

// ---- item categories ----

export interface CategoryOption {
  id: string;
  code: string;
  name: string;
  status: string;
}

export async function listCategories(): Promise<CategoryOption[]> {
  const supabase = createClient();
  const res = await supabase
    .from("item_categories")
    .select("id, code, name, status")
    .order("name")
    .returns<CategoryOption[]>();
  return unwrap(res, [], "listCategories");
}

// ---- items ----

export interface ItemListRow {
  id: string;
  sku: string;
  name: string;
  type: ItemType;
  categoryName: string | null;
  baseUnitCode: string | null;
  gstRate: number;
  defaultPrice: number;
  isSellable: boolean;
  isPurchasable: boolean;
  isStocked: boolean;
  reorderLevel: number;
  status: string;
}

const ITEM_LIST_SELECT =
  "id, sku, name, type, gst_rate, default_price, is_sellable, is_purchasable, " +
  "is_stocked, reorder_level, status, " +
  "category:item_categories(name), base_unit:units!items_base_unit_id_fkey(code)";

type RawItemList = {
  id: string;
  sku: string;
  name: string;
  type: ItemType;
  gst_rate: number;
  default_price: number;
  is_sellable: boolean;
  is_purchasable: boolean;
  is_stocked: boolean;
  reorder_level: number;
  status: string;
  category: { name: string } | null;
  base_unit: { code: string } | null;
};

export async function listItems(opts: {
  type?: ItemType;
  status?: string;
  limit?: number;
} = {}): Promise<ItemListRow[]> {
  const supabase = createClient();
  let q = supabase
    .from("items")
    .select(ITEM_LIST_SELECT)
    .order("name")
    .limit(opts.limit ?? 500);
  if (opts.type) q = q.eq("type", opts.type);
  if (opts.status) q = q.eq("status", opts.status);

  const rows = unwrap(await q.returns<RawItemList[]>(), [] as RawItemList[], "listItems");
  return rows.map((r) => ({
    id: r.id,
    sku: r.sku,
    name: r.name,
    type: r.type,
    categoryName: r.category?.name ?? null,
    baseUnitCode: r.base_unit?.code ?? null,
    gstRate: Number(r.gst_rate),
    defaultPrice: Number(r.default_price),
    isSellable: r.is_sellable,
    isPurchasable: r.is_purchasable,
    isStocked: r.is_stocked,
    reorderLevel: Number(r.reorder_level),
    status: r.status,
  }));
}

export interface ItemDetail extends ItemListRow {
  hsnCode: string | null;
  packSize: number;
  packUnitCode: string | null;
  cessRate: number;
  createdAt: string;
}

const ITEM_DETAIL_SELECT =
  ITEM_LIST_SELECT +
  ", hsn_code, pack_size, cess_rate, created_at, " +
  "pack_unit:units!items_pack_unit_id_fkey(code)";

type RawItemDetail = RawItemList & {
  hsn_code: string | null;
  pack_size: number;
  cess_rate: number;
  created_at: string;
  pack_unit: { code: string } | null;
};

export async function getItem(id: string): Promise<ItemDetail | null> {
  const supabase = createClient();
  const res = await supabase
    .from("items")
    .select(ITEM_DETAIL_SELECT)
    .eq("id", id)
    .maybeSingle()
    .returns<RawItemDetail | null>();
  const r = unwrap(res, null as RawItemDetail | null, "getItem");
  if (!r) return null;
  return {
    id: r.id,
    sku: r.sku,
    name: r.name,
    type: r.type,
    categoryName: r.category?.name ?? null,
    baseUnitCode: r.base_unit?.code ?? null,
    gstRate: Number(r.gst_rate),
    defaultPrice: Number(r.default_price),
    isSellable: r.is_sellable,
    isPurchasable: r.is_purchasable,
    isStocked: r.is_stocked,
    reorderLevel: Number(r.reorder_level),
    status: r.status,
    hsnCode: r.hsn_code,
    packSize: Number(r.pack_size),
    packUnitCode: r.pack_unit?.code ?? null,
    cessRate: Number(r.cess_rate),
    createdAt: r.created_at,
  };
}

// ---- price lists ----

export interface PriceListRow {
  id: string;
  code: string;
  name: string;
  isDefault: boolean;
  validFrom: string;
  validTo: string | null;
  status: string;
  itemCount: number;
}

type RawPriceList = {
  id: string;
  code: string;
  name: string;
  is_default: boolean;
  valid_from: string;
  valid_to: string | null;
  status: string;
  price_list_items: { count: number }[];
};

export async function listPriceLists(): Promise<PriceListRow[]> {
  const supabase = createClient();
  const res = await supabase
    .from("price_lists")
    .select("id, code, name, is_default, valid_from, valid_to, status, price_list_items(count)")
    .order("is_default", { ascending: false })
    .order("name")
    .returns<RawPriceList[]>();
  const rows = unwrap(res, [] as RawPriceList[], "listPriceLists");
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    isDefault: r.is_default,
    validFrom: r.valid_from,
    validTo: r.valid_to,
    status: r.status,
    itemCount: r.price_list_items?.[0]?.count ?? 0,
  }));
}

export interface PriceListItemRow {
  itemId: string;
  itemName: string;
  sku: string;
  baseUnitCode: string | null;
  minQty: number;
  unitPrice: number;
}

type RawPriceListItem = {
  item_id: string;
  min_qty: number;
  unit_price: number;
  item: { name: string; sku: string; base_unit: { code: string } | null } | null;
};

export interface PriceListDetail {
  id: string;
  code: string;
  name: string;
  isDefault: boolean;
  validFrom: string;
  validTo: string | null;
  status: string;
  items: PriceListItemRow[];
}

export async function getPriceList(id: string): Promise<PriceListDetail | null> {
  const supabase = createClient();
  const [listRes, itemsRes] = await Promise.all([
    supabase
      .from("price_lists")
      .select("id, code, name, is_default, valid_from, valid_to, status")
      .eq("id", id)
      .maybeSingle()
      .returns<{
        id: string; code: string; name: string; is_default: boolean;
        valid_from: string; valid_to: string | null; status: string;
      } | null>(),
    supabase
      .from("price_list_items")
      .select("item_id, min_qty, unit_price, item:items(name, sku, base_unit:units!items_base_unit_id_fkey(code))")
      .eq("price_list_id", id)
      .order("item_id")
      .order("min_qty")
      .returns<RawPriceListItem[]>(),
  ]);
  const pl = unwrap(listRes, null, "getPriceList:header");
  if (!pl) return null;
  const rows = unwrap(itemsRes, [] as RawPriceListItem[], "getPriceList:items");
  return {
    id: pl.id,
    code: pl.code,
    name: pl.name,
    isDefault: pl.is_default,
    validFrom: pl.valid_from,
    validTo: pl.valid_to,
    status: pl.status,
    items: rows.map((r) => ({
      itemId: r.item_id,
      itemName: r.item?.name ?? "—",
      sku: r.item?.sku ?? "—",
      baseUnitCode: r.item?.base_unit?.code ?? null,
      minQty: Number(r.min_qty),
      unitPrice: Number(r.unit_price),
    })),
  };
}
