// =====================================================================
// lib/data/holdings.ts — server-only readers for §4.7 User Holdings &
// Handover/Transfers.
//
//   user_cash_holdings   read-model of cash in each user's custody (2140)
//   user_stock_holdings  AUTHORITATIVE qty in user custody (Invariant 2)
//   transfers            accept/reject handover state machine
// =====================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrap } from "./types";

// ------------------------------------------------------------- holdings

export interface CashHoldingRow {
  userId: string;
  userName: string;
  amount: number;
}

type RawCashHolding = {
  user_id: string;
  amount: number;
  user: { full_name: string } | null;
};

export async function listCashHoldings(): Promise<CashHoldingRow[]> {
  const supabase = createClient();
  const rows = unwrap(
    await supabase
      .from("user_cash_holdings")
      .select("user_id, amount, user:users(full_name)")
      .order("amount", { ascending: false })
      .returns<RawCashHolding[]>(),
    [] as RawCashHolding[],
    "listCashHoldings",
  );
  return rows
    .filter((r) => Number(r.amount) !== 0)
    .map((r) => ({
      userId: r.user_id,
      userName: r.user?.full_name ?? "—",
      amount: Number(r.amount),
    }));
}

export interface StockHoldingRow {
  userId: string;
  userName: string;
  itemId: string;
  itemSku: string;
  itemName: string;
  baseUnitCode: string | null;
  qty: number;
  avgCost: number;
  carryingValue: number;
}

type RawStockHolding = {
  user_id: string;
  item_id: string;
  qty: number;
  avg_cost: number;
  user: { full_name: string } | null;
  item: { sku: string; name: string; base_unit: { code: string } | null } | null;
};

export async function listStockHoldings(): Promise<StockHoldingRow[]> {
  const supabase = createClient();
  const rows = unwrap(
    await supabase
      .from("user_stock_holdings")
      .select(
        "user_id, item_id, qty, avg_cost, user:users(full_name), " +
        "item:items(sku, name, base_unit:units!items_base_unit_id_fkey(code))",
      )
      .gt("qty", 0)
      .returns<RawStockHolding[]>(),
    [] as RawStockHolding[],
    "listStockHoldings",
  );
  return rows.map((r) => ({
    userId: r.user_id,
    userName: r.user?.full_name ?? "—",
    itemId: r.item_id,
    itemSku: r.item?.sku ?? "—",
    itemName: r.item?.name ?? "—",
    baseUnitCode: r.item?.base_unit?.code ?? null,
    qty: Number(r.qty),
    avgCost: Number(r.avg_cost),
    carryingValue: Number(r.qty) * Number(r.avg_cost),
  }));
}

/** The signed-in user's own custody (cash amount + stock lines). */
export async function getMyHoldings(): Promise<{
  userId: string | null;
  cash: number;
  stock: StockHoldingRow[];
}> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { userId: null, cash: 0, stock: [] };

  const [cashRes, stockRes] = await Promise.all([
    supabase.from("user_cash_holdings").select("amount").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("user_stock_holdings")
      .select(
        "user_id, item_id, qty, avg_cost, user:users(full_name), " +
        "item:items(sku, name, base_unit:units!items_base_unit_id_fkey(code))",
      )
      .eq("user_id", user.id)
      .gt("qty", 0)
      .returns<RawStockHolding[]>(),
  ]);

  const cash = Number(cashRes.data?.amount ?? 0);
  const stock = (stockRes.data ?? []).map((r) => ({
    userId: r.user_id,
    userName: r.user?.full_name ?? "—",
    itemId: r.item_id,
    itemSku: r.item?.sku ?? "—",
    itemName: r.item?.name ?? "—",
    baseUnitCode: r.item?.base_unit?.code ?? null,
    qty: Number(r.qty),
    avgCost: Number(r.avg_cost),
    carryingValue: Number(r.qty) * Number(r.avg_cost),
  }));
  return { userId: user.id, cash, stock };
}

// ------------------------------------------------------------ transfers

export interface TransferLineRow {
  itemId: string;
  itemSku: string;
  itemName: string;
  qty: number;
  baseUnitCode: string | null;
}

export interface TransferRow {
  id: string;
  transferNo: string;
  type: "stock" | "cash";
  status: "pending" | "accepted" | "rejected" | "cancelled";
  fromLabel: string;
  toLabel: string;
  fromUserId: string | null;
  toUserId: string | null;
  amount: number | null;
  isDeposit: boolean;
  note: string | null;
  createdAt: string;
  respondedAt: string | null;
  lines: TransferLineRow[];
}

type RawTransfer = {
  id: string;
  transfer_no: string;
  type: string;
  status: string;
  amount: number | null;
  deposit_account: string | null;
  note: string | null;
  created_at: string;
  responded_at: string | null;
  from_user_id: string | null;
  to_user_id: string | null;
  from_user: { full_name: string } | null;
  to_user: { full_name: string } | null;
  from_branch: { name: string } | null;
  to_branch: { name: string } | null;
  lines: {
    item_id: string;
    qty: number;
    item: { sku: string; name: string; base_unit: { code: string } | null } | null;
  }[];
};

const TRANSFER_SELECT =
  "id, transfer_no, type, status, amount, deposit_account, note, created_at, responded_at, " +
  "from_user_id, to_user_id, " +
  "from_user:users!transfers_from_user_id_fkey(full_name), " +
  "to_user:users!transfers_to_user_id_fkey(full_name), " +
  "from_branch:branches!transfers_from_branch_id_fkey(name), " +
  "to_branch:branches!transfers_to_branch_id_fkey(name), " +
  "lines:transfer_lines(item_id, qty, item:items(sku, name, base_unit:units!items_base_unit_id_fkey(code)))";

function mapTransfer(r: RawTransfer): TransferRow {
  return {
    id: r.id,
    transferNo: r.transfer_no,
    type: r.type as TransferRow["type"],
    status: r.status as TransferRow["status"],
    fromLabel: r.from_user?.full_name ?? r.from_branch?.name ?? "—",
    toLabel: r.deposit_account
      ? "Bank deposit"
      : r.to_user?.full_name ?? r.to_branch?.name ?? "—",
    fromUserId: r.from_user_id,
    toUserId: r.to_user_id,
    amount: r.amount == null ? null : Number(r.amount),
    isDeposit: r.deposit_account != null,
    note: r.note,
    createdAt: r.created_at,
    respondedAt: r.responded_at,
    lines: (r.lines ?? []).map((l) => ({
      itemId: l.item_id,
      itemSku: l.item?.sku ?? "—",
      itemName: l.item?.name ?? "—",
      qty: Number(l.qty),
      baseUnitCode: l.item?.base_unit?.code ?? null,
    })),
  };
}

export async function listTransfers(opts: { limit?: number } = {}): Promise<TransferRow[]> {
  const supabase = createClient();
  const rows = unwrap(
    await supabase
      .from("transfers")
      .select(TRANSFER_SELECT)
      .order("created_at", { ascending: false })
      .limit(opts.limit ?? 100)
      .returns<RawTransfer[]>(),
    [] as RawTransfer[],
    "listTransfers",
  );
  return rows.map(mapTransfer);
}

// ------------------------------------------------------ people picker

export interface UserOption {
  id: string;
  fullName: string;
}

type RawUserOption = { id: string; full_name: string };

export async function listActiveUsers(): Promise<UserOption[]> {
  const supabase = createClient();
  const rows = unwrap(
    await supabase
      .from("users")
      .select("id, full_name")
      .eq("status", "active")
      .order("full_name")
      .returns<RawUserOption[]>(),
    [] as RawUserOption[],
    "listActiveUsers",
  );
  return rows.map((r) => ({ id: r.id, fullName: r.full_name }));
}
