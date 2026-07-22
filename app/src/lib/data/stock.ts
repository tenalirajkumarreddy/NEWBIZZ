// =====================================================================
// lib/data/stock.ts — server-only readers for Warehouse Stock.
// =====================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrap } from "./types";

export interface StockRow {
  itemId: string;
  branchId: string;
  itemSku: string;
  itemName: string;
  itemType: string;
  baseUnitCode: string | null;
  branchName: string;
  qtyOnHand: number;
  avgCost: number;
  carryingValue: number;
  reorderLevel: number;
  belowReorder: boolean;
}

type RawStock = {
  item_id: string;
  branch_id: string;
  qty_on_hand: number;
  avg_cost: number;
  item: { sku: string; name: string; type: string; reorder_level: number; base_unit: { code: string } | null } | null;
  branch: { name: string } | null;
};

export async function listStock(opts: { branchId?: string } = {}): Promise<StockRow[]> {
  const supabase = createClient();
  let q = supabase
    .from("stock")
    .select(
      "item_id, branch_id, qty_on_hand, avg_cost, " +
      "item:items(sku, name, type, reorder_level, base_unit:units!items_base_unit_id_fkey(code)), " +
      "branch:branches(name)",
    )
    .order("item_id");
  if (opts.branchId) q = q.eq("branch_id", opts.branchId);

  const rows = unwrap(await q.returns<RawStock[]>(), [] as RawStock[], "listStock");
  return rows.map((r) => {
    const qty = Number(r.qty_on_hand);
    const cost = Number(r.avg_cost);
    const reorder = Number(r.item?.reorder_level ?? 0);
    return {
      itemId: r.item_id,
      branchId: r.branch_id,
      itemSku: r.item?.sku ?? "—",
      itemName: r.item?.name ?? "—",
      itemType: r.item?.type ?? "—",
      baseUnitCode: r.item?.base_unit?.code ?? null,
      branchName: r.branch?.name ?? "—",
      qtyOnHand: qty,
      avgCost: cost,
      carryingValue: qty * cost,
      reorderLevel: reorder,
      belowReorder: reorder > 0 && qty <= reorder,
    };
  });
}

// ---------------------------------------------------------------------
// Reorder alerts (§4.8 dashboard). Stocked lines at or below their reorder
// level, worst shortfall first. Same source of truth as the /stock register's
// amber badge; the DB trigger (0042) notifies on the downward crossing, this
// is the standing "what's low right now" view.
// ---------------------------------------------------------------------
export async function listReorderAlerts(opts: { branchId?: string; limit?: number } = {}): Promise<StockRow[]> {
  const rows = await listStock({ branchId: opts.branchId });
  const alerts = rows
    .filter((r) => r.belowReorder)
    .sort((a, b) => a.reorderLevel - a.qtyOnHand - (b.reorderLevel - b.qtyOnHand)); // deepest shortfall first
  return typeof opts.limit === "number" ? alerts.slice(0, opts.limit) : alerts;
}

// ---------------------------------------------------------------------
// Opening-stock pickers (master plan §3.4). Read-only options for the
// opening entry form: active branches and stocked items with their
// current on-hand qty at the chosen branch (so the operator can see
// which lines already have stock and won't double-load them).
// ---------------------------------------------------------------------

export interface BranchOption {
  id: string;
  code: string;
  name: string;
}

export async function listBranches(): Promise<BranchOption[]> {
  const supabase = createClient();
  const rows = unwrap(
    await supabase
      .from("branches")
      .select("id, code, name")
      .eq("status", "active")
      .order("code")
      .returns<BranchOption[]>(),
    [] as BranchOption[],
    "listBranches",
  );
  return rows;
}

export interface StockableItemOption {
  id: string;
  sku: string;
  name: string;
  type: string;
  baseUnitCode: string | null;
  defaultPrice: number;
}

type RawStockableItem = {
  id: string;
  sku: string;
  name: string;
  type: string;
  default_price: number;
  base_unit: { code: string } | null;
};

export async function listStockableItems(): Promise<StockableItemOption[]> {
  const supabase = createClient();
  const rows = unwrap(
    await supabase
      .from("items")
      .select("id, sku, name, type, default_price, base_unit:units!items_base_unit_id_fkey(code)")
      .eq("is_stocked", true)
      .eq("status", "active")
      .order("sku")
      .returns<RawStockableItem[]>(),
    [] as RawStockableItem[],
    "listStockableItems",
  );
  return rows.map((r) => ({
    id: r.id,
    sku: r.sku,
    name: r.name,
    type: r.type,
    baseUnitCode: r.base_unit?.code ?? null,
    defaultPrice: Number(r.default_price),
  }));
}
