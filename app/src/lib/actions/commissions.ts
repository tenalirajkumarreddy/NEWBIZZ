"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";


export type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

function fail(label: string, message: string | undefined): { ok: false; error: string } {
  const msg = (message ?? "").trim() || "Something went wrong. Please try again.";
  console.error(`[action:commissions:${label}]`, message);
  return { ok: false, error: msg };
}

export async function computeCommissionRun(month: string): Promise<ActionResult<{ runId: string }>> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("compute_commissions", { p_month: month });
  if (error) return fail("computeCommissionRun", error.message);
  revalidatePath("/commissions");
  return { ok: true, runId: data as string };
}

export async function postCommissionRun(runId: string): Promise<ActionResult<{ journalEntryId: string }>> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("post_commission_run", { p_run: runId });
  if (error) return fail("postCommissionRun", error.message);
  revalidatePath("/commissions");
  return { ok: true, journalEntryId: data as string };
}

export async function saveTargets(
  month: string,
  targets: { userId: string; targetAmount: number; targetCases: number }[],
): Promise<ActionResult> {
  const supabase = createClient();

  for (const t of targets) {
    const { error } = await supabase.from("sales_targets").upsert(
      {
        user_id: t.userId,
        period_month: month,
        target_amount: t.targetAmount,
        target_cases: t.targetCases,
      },
      { onConflict: "user_id, period_month" },
    );
    if (error) return fail("saveTargets", error.message);
  }

  revalidatePath("/commissions");
  return { ok: true };
}

export interface CommissionRuleInput {
  id?: string;
  roleCode?: string | null;
  userId?: string | null;
  basis: string;
  rate: number;
  threshold: number;
  tiers: { min: number; rate: number }[];
  status?: string;
}

export async function saveRule(data: CommissionRuleInput): Promise<ActionResult<{ id: string }>> {
  const supabase = createClient();
  const basis = data.basis as "revenue" | "cases" | "collection";
  const payload = {
    role_code: data.roleCode ?? null,
    user_id: data.userId ?? null,
    basis,
    rate: data.rate,
    threshold: data.threshold,
    tier_json: data.tiers as never,
    status: data.status ?? "active",
  };

  if (data.id) {
    const { error } = await supabase.from("commission_rules").update(payload).eq("id", data.id).select("id").maybeSingle();
    if (error) return fail("saveRule:update", error.message);
  } else {
    const { data: inserted, error } = await supabase
      .from("commission_rules")
      .insert(payload)
      .select("id")
      .maybeSingle();
    if (error) return fail("saveRule:insert", error.message);
    revalidatePath("/commissions");
    return { ok: true, id: inserted!.id };
  }

  revalidatePath("/commissions");
  return { ok: true, id: data.id };
}

export async function getRunDetail(
  runId: string,
): Promise<
  ActionResult<{
    run: {
      id: string;
      periodMonth: string;
      status: string;
      totalAmount: number;
      computedAt: string | null;
      journalEntryId: string | null;
    };
    lines: {
      userId: string;
      userName: string;
      basis: string;
      baseAmount: number;
      rate: number;
      commissionAmount: number;
    }[];
  }>
> {
  const supabase = createClient();

  const [runRes, linesRes] = await Promise.all([
    supabase
      .from("commission_runs")
      .select("id, period_month, status, total_amount, computed_at, journal_entry_id")
      .eq("id", runId)
      .maybeSingle(),
    supabase
      .from("commission_lines")
      .select("user_id, basis, base_amount, rate, commission_amount, user:users(full_name)")
      .eq("run_id", runId),
  ]);

  const rawRun = runRes.data;
  if (!rawRun || runRes.error) return fail("getRunDetail", runRes.error?.message ?? "Run not found");

  const run = {
    id: rawRun.id,
    periodMonth: rawRun.period_month,
    status: rawRun.status,
    totalAmount: Number(rawRun.total_amount),
    computedAt: rawRun.computed_at,
    journalEntryId: rawRun.journal_entry_id,
  };

  const lines = (linesRes.data ?? []).map((l: Record<string, unknown>) => ({
    userId: l.user_id as string,
    userName: ((l.user as { full_name?: string } | null)?.full_name) ?? "—",
    basis: l.basis as string,
    baseAmount: Number(l.base_amount),
    rate: Number(l.rate),
    commissionAmount: Number(l.commission_amount),
  }));

  return { ok: true, run, lines };
}

export async function deactivateRule(id: string): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await supabase
    .from("commission_rules")
    .update({ status: "inactive" })
    .eq("id", id);
  if (error) return fail("deactivateRule", error.message);
  revalidatePath("/commissions");
  return { ok: true };
}
