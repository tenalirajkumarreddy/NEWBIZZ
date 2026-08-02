"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

// =====================================================================
// Credit terms
// =====================================================================

export async function updateCreditTerms(
  customerId: string,
  data: { creditLimit?: number; creditDays?: number },
): Promise<ActionResult> {
  const supabase = createClient();
  const patch: Record<string, any> = {};
  if (data.creditLimit !== undefined) patch.credit_limit = data.creditLimit;
  if (data.creditDays !== undefined) patch.credit_days = data.creditDays;
  const { error } = await (supabase as any).from("customers").update(patch).eq("id", customerId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/credit");
  revalidatePath(`/customers/${customerId}`);
  return { ok: true };
}
