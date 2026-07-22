"use server";

// =====================================================================
// lib/actions/transfers.ts — Server Actions for §4.7 Handover/Transfers.
//
// All balance movement happens inside SECURITY DEFINER RPCs (Invariant 3):
//   create_transfer(header, lines)  → pending (bank deposits post at once)
//   respond_transfer(id, accept)    → accept moves balances ATOMICALLY
//   cancel_transfer(id)             → sender withdraws a pending transfer
// Permissions (stock.transfer / cash.transfer) are enforced in the DB.
// =====================================================================

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "./sales";

const PATHS = ["/holdings", "/stock", "/"];

function friendly(msg: string): string {
  if (msg.includes("not authorized")) {
    return msg.includes("cash.transfer")
      ? "You need the cash.transfer permission for this."
      : "You need the stock.transfer permission for this.";
  }
  if (msg.includes("holds less cash"))
    return "The sender does not hold that much cash right now.";
  if (msg.includes("holds") && msg.includes("needs"))
    return "The sender does not hold enough of that item right now.";
  if (msg.includes("insufficient stock"))
    return "The warehouse does not have enough stock for that item.";
  if (msg.includes("only the receiving user"))
    return "Only the receiving user can accept or reject this transfer.";
  if (msg.includes("already"))
    return "This transfer has already been responded to.";
  return msg;
}

export interface CashTransferInput {
  toUserId?: string;      // omit when depositing to bank
  amount: number;
  deposit?: boolean;      // true → Dr 1120 Bank / Cr 2140(sender), posts now
  note?: string;
}

export async function createCashTransfer(
  input: CashTransferInput,
): Promise<ActionResult<{ id: string }>> {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0)
    return { ok: false, error: "Enter an amount greater than zero." };
  if (!input.deposit && !input.toUserId)
    return { ok: false, error: "Pick who receives the cash, or choose bank deposit." };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You are not signed in." };

  const res = await supabase.rpc("create_transfer", {
    p_header: {
      type: "cash",
      from_user_id: user.id,
      ...(input.deposit ? { deposit_account: "1120" } : { to_user_id: input.toUserId }),
      amount,
      ...(input.note ? { note: input.note } : {}),
    },
  });
  if (res.error || res.data == null) {
    const msg = (res.error?.message ?? "").trim();
    console.error("[action:createCashTransfer]", msg);
    return { ok: false, error: friendly(msg || "The transfer could not be created.") };
  }
  PATHS.forEach((p) => revalidatePath(p));
  return { ok: true, id: res.data };
}

export interface StockTransferLineInput {
  item_id: string;
  qty: number;
}

export interface StockTransferInput {
  fromBranchId?: string;  // warehouse → user (issue to field)
  toUserId?: string;
  toBranchId?: string;    // user → warehouse (return)
  fromSelf?: boolean;     // sender is the signed-in user
  lines: StockTransferLineInput[];
  note?: string;
}

export async function createStockTransfer(
  input: StockTransferInput,
): Promise<ActionResult<{ id: string }>> {
  const lines = (input.lines ?? []).filter((l) => l.item_id && Number(l.qty) > 0);
  if (lines.length === 0)
    return { ok: false, error: "Add at least one line with an item and a quantity." };
  const seen = new Set<string>();
  for (const l of lines) {
    if (seen.has(l.item_id))
      return { ok: false, error: "The same item appears twice — merge the lines." };
    seen.add(l.item_id);
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You are not signed in." };

  const header: { [key: string]: string } = { type: "stock" };
  if (input.fromBranchId) header.from_branch_id = input.fromBranchId;
  else header.from_user_id = user.id;
  if (input.toBranchId) header.to_branch_id = input.toBranchId;
  else if (input.toUserId) header.to_user_id = input.toUserId;
  else return { ok: false, error: "Pick who or which warehouse receives the stock." };
  if (input.note) header.note = input.note;

  const res = await supabase.rpc("create_transfer", {
    p_header: header,
    p_lines: lines.map((l) => ({ item_id: l.item_id, qty: Number(l.qty) })),
  });
  if (res.error || res.data == null) {
    const msg = (res.error?.message ?? "").trim();
    console.error("[action:createStockTransfer]", msg);
    return { ok: false, error: friendly(msg || "The transfer could not be created.") };
  }
  PATHS.forEach((p) => revalidatePath(p));
  return { ok: true, id: res.data };
}

export async function respondTransfer(
  id: string,
  accept: boolean,
): Promise<ActionResult<{ id: string }>> {
  if (!id) return { ok: false, error: "Missing transfer." };
  const supabase = createClient();
  const res = await supabase.rpc("respond_transfer", { p_id: id, p_accept: accept });
  if (res.error || res.data == null) {
    const msg = (res.error?.message ?? "").trim();
    console.error("[action:respondTransfer]", msg);
    return { ok: false, error: friendly(msg || "The response could not be recorded.") };
  }
  PATHS.forEach((p) => revalidatePath(p));
  return { ok: true, id: res.data };
}

export async function cancelTransfer(id: string): Promise<ActionResult<{ id: string }>> {
  if (!id) return { ok: false, error: "Missing transfer." };
  const supabase = createClient();
  const res = await supabase.rpc("cancel_transfer", { p_id: id });
  if (res.error || res.data == null) {
    const msg = (res.error?.message ?? "").trim();
    console.error("[action:cancelTransfer]", msg);
    return { ok: false, error: friendly(msg || "The transfer could not be cancelled.") };
  }
  PATHS.forEach((p) => revalidatePath(p));
  return { ok: true, id: res.data };
}
