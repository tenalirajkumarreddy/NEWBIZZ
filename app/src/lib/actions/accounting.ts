"use server";

// =====================================================================
// lib/actions/accounting.ts — manual voucher posting and journal reversal
// (§5.2). postVoucher forwards to the gated post_voucher RPC; reverseJournal
// calls reverse_journal (both SECURITY DEFINER, actor from the JWT sub).
// Balance (Dr=Cr) and open-FY checks are enforced in the DB.
// =====================================================================
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import type { ActionResult } from "./sales";

export interface VoucherLineInput {
  account_code?: string;
  account_id?: string;
  debit?: number;
  credit?: number;
  party_type?: string;
  party_id?: string;
  cost_center_code?: string;
  memo?: string;
}

export interface PostVoucherInput {
  entry_date: string;
  voucher_type?: string; // payment | receipt | contra | journal
  narration?: string;
  lines: VoucherLineInput[];
}

export async function postVoucher(input: PostVoucherInput): Promise<ActionResult<{ entryId: string }>> {
  if (!input.lines || input.lines.length < 2) {
    return { ok: false, error: "A voucher needs at least two lines." };
  }
  const dr = input.lines.reduce((s, l) => s + Number(l.debit ?? 0), 0);
  const cr = input.lines.reduce((s, l) => s + Number(l.credit ?? 0), 0);
  if (Math.abs(dr - cr) > 0.005) {
    return { ok: false, error: `Voucher is unbalanced (Dr ${dr.toFixed(2)} ≠ Cr ${cr.toFixed(2)}).` };
  }
  if (dr === 0) {
    return { ok: false, error: "A voucher cannot be zero-value." };
  }

  const supabase = createClient();
  const header: { [key: string]: string } = { entry_date: input.entry_date };
  if (input.voucher_type) header.voucher_type = input.voucher_type;
  if (input.narration) header.narration = input.narration;

  const res = await supabase.rpc("post_voucher", {
    p_header: header,
    p_lines: input.lines as unknown as Json,
  });

  if (res.error) return { ok: false, error: res.error.message };

  revalidatePath("/vouchers");
  revalidatePath("/journal");
  revalidatePath("/trial-balance");
  revalidatePath("/reports");
  return { ok: true, entryId: res.data as string };
}

export async function reverseJournal(entryId: string, reason?: string): Promise<ActionResult<{ entryId: string }>> {
  const supabase = createClient();
  const res = await supabase.rpc("reverse_journal", {
    p_entry_id: entryId,
    p_reason: reason ?? undefined,
  });
  if (res.error) return { ok: false, error: res.error.message };

  revalidatePath("/journal");
  revalidatePath(`/journal/${entryId}`);
  revalidatePath("/vouchers");
  revalidatePath("/trial-balance");
  revalidatePath("/reports");
  return { ok: true, entryId: res.data as string };
}
