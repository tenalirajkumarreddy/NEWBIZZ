import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrap } from "./types";
import type { Database } from "@/lib/supabase/database.types";

type CommissionBasis = Database["public"]["Enums"]["commission_basis"];

export interface CommissionSummary {
  totalTarget: number;
  totalAchieved: number;
  achievementPct: number | null;
  pendingCommission: number;
}

export interface TargetAchievementRow {
  userId: string;
  userName: string;
  targetAmount: number;
  achievedAmount: number;
  pct: number | null;
  targetCases: number;
  achievedCases: number;
}

export interface CommissionRunRow {
  id: string;
  periodMonth: string;
  status: string;
  totalAmount: number;
  computedAt: string | null;
  journalEntryId: string | null;
}

export interface CommissionLineRow {
  userId: string;
  userName: string;
  basis: CommissionBasis;
  baseAmount: number;
  rate: number;
  commissionAmount: number;
}

export interface CommissionRuleRow {
  id: string;
  roleCode: string | null;
  userId: string | null;
  userName: string | null;
  basis: CommissionBasis;
  rate: number;
  threshold: number;
  tiers: { min: number; rate: number }[];
  status: string;
}

export interface SalesTargetRow {
  userId: string;
  userName: string;
  targetAmount: number;
  targetCases: number;
}

export interface UserOption {
  id: string;
  fullName: string;
}

export interface RoleOption {
  code: string;
  name: string;
}

type RawSalesTarget = {
  user_id: string;
  target_amount: number;
  target_cases: number;
  user: { full_name: string } | null;
};

type RawCommissionRun = {
  id: string;
  period_month: string;
  status: string;
  total_amount: number;
  computed_at: string | null;
  journal_entry_id: string | null;
};

type RawCommissionLine = {
  user_id: string;
  basis: CommissionBasis;
  base_amount: number;
  rate: number;
  commission_amount: number;
  user: { full_name: string } | null;
};

type RawCommissionRule = {
  id: string;
  role_code: string | null;
  user_id: string | null;
  basis: CommissionBasis;
  rate: number;
  threshold: number;
  tier_json: unknown;
  status: string;
  user: { full_name: string } | null;
};

async function commissionBase(userId: string, basis: CommissionBasis, from: string, to: string): Promise<number> {
  const supabase = createClient();
  const res = await supabase.rpc("_user_commission_base", {
    p_user: userId,
    p_basis: basis,
    p_from: from,
    p_to: to,
  });
  if (res.error) return 0;
  return Number(res.data ?? 0);
}

function monthRange(month: string): { from: string; to: string } {
  const d = new Date(month + "T00:00:00");
  const yr = d.getFullYear();
  const mo = d.getMonth() + 1;
  const from = `${yr}-${String(mo).padStart(2, "0")}-01`;
  const lastDay = new Date(yr, mo, 0).getDate();
  const to = `${yr}-${String(mo).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

export async function getCommissionSummary(month: string): Promise<CommissionSummary> {
  const supabase = createClient();
  const { from, to } = monthRange(month);

  const [targetRes, pendingRes] = await Promise.all([
    supabase.from("sales_targets").select("target_amount").eq("period_month", month),
    supabase
      .from("commission_runs")
      .select("total_amount")
      .eq("status", "computed")
      .order("period_month", { ascending: false })
      .limit(1),
  ]);

  const totalTarget = (targetRes.data ?? []).reduce((s, r) => s + Number(r.target_amount), 0);
  const pendingCommission = pendingRes.data?.[0] ? Number(pendingRes.data[0].total_amount) : 0;

  const activeUsersRes = await supabase
    .from("users")
    .select("id")
    .eq("status", "active");

  const activeUserIds = (activeUsersRes.data ?? []).map((u) => u.id);
  const bases = await Promise.all(
    activeUserIds.map((uid) => commissionBase(uid, "revenue", from, to)),
  );
  const totalAchieved = bases.reduce((s, v) => s + v, 0);

  return {
    totalTarget,
    totalAchieved,
    achievementPct: totalTarget > 0 ? Math.round((totalAchieved / totalTarget) * 10000) / 100 : null,
    pendingCommission,
  };
}

export async function getTargetAchievement(month: string): Promise<TargetAchievementRow[]> {
  const supabase = createClient();
  const { from, to } = monthRange(month);

  const targetsRes = await supabase
    .from("sales_targets")
    .select("user_id, target_amount, target_cases, user:users(full_name)")
    .eq("period_month", month)
    .returns<RawSalesTarget[]>();

  const targets = unwrap(targetsRes, [] as RawSalesTarget[], "getTargetAchievement");
  if (targets.length === 0) return [];

  const rows = await Promise.all(
    targets.map(async (t) => {
      const [amt, cases] = await Promise.all([
        commissionBase(t.user_id, "revenue", from, to),
        commissionBase(t.user_id, "cases", from, to),
      ]);
      return {
        userId: t.user_id,
        userName: t.user?.full_name ?? "—",
        targetAmount: Number(t.target_amount),
        achievedAmount: amt,
        pct: Number(t.target_amount) > 0 ? Math.round((amt / Number(t.target_amount)) * 10000) / 100 : null,
        targetCases: Number(t.target_cases),
        achievedCases: cases,
      };
    }),
  );

  return rows.sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));
}

export async function listCommissionRuns(): Promise<CommissionRunRow[]> {
  const supabase = createClient();
  const res = await supabase
    .from("commission_runs")
    .select("id, period_month, status, total_amount, computed_at, journal_entry_id")
    .order("period_month", { ascending: false })
    .returns<RawCommissionRun[]>();
  return unwrap(res, [] as RawCommissionRun[], "listCommissionRuns").map((r) => ({
    id: r.id,
    periodMonth: r.period_month,
    status: r.status,
    totalAmount: Number(r.total_amount),
    computedAt: r.computed_at,
    journalEntryId: r.journal_entry_id,
  }));
}

export async function getCommissionRunDetail(runId: string): Promise<{
  run: CommissionRunRow;
  lines: CommissionLineRow[];
}> {
  const supabase = createClient();

  const [runRes, linesRes] = await Promise.all([
    supabase
      .from("commission_runs")
      .select("id, period_month, status, total_amount, computed_at, journal_entry_id")
      .eq("id", runId)
      .maybeSingle()
      .returns<RawCommissionRun | null>(),
    supabase
      .from("commission_lines")
      .select("user_id, basis, base_amount, rate, commission_amount, user:users(full_name)")
      .eq("run_id", runId)
      .returns<RawCommissionLine[]>(),
  ]);

  const rawRun = runRes.data;
  if (!rawRun) throw new Error("Commission run not found");

  const run: CommissionRunRow = {
    id: rawRun.id,
    periodMonth: rawRun.period_month,
    status: rawRun.status,
    totalAmount: Number(rawRun.total_amount),
    computedAt: rawRun.computed_at,
    journalEntryId: rawRun.journal_entry_id,
  };

  const lines: CommissionLineRow[] = (linesRes.data ?? []).map((l) => ({
    userId: l.user_id,
    userName: l.user?.full_name ?? "—",
    basis: l.basis,
    baseAmount: Number(l.base_amount),
    rate: Number(l.rate),
    commissionAmount: Number(l.commission_amount),
  }));

  return { run, lines };
}

export async function listCommissionRules(): Promise<CommissionRuleRow[]> {
  const supabase = createClient();
  const res = await supabase
    .from("commission_rules")
    .select("id, role_code, user_id, basis, rate, threshold, tier_json, status, user:users(full_name)")
    .order("created_at", { ascending: false })
    .returns<RawCommissionRule[]>();
  return unwrap(res, [] as RawCommissionRule[], "listCommissionRules").map((r) => ({
    id: r.id,
    roleCode: r.role_code,
    userId: r.user_id,
    userName: r.user?.full_name ?? null,
    basis: r.basis,
    rate: Number(r.rate),
    threshold: Number(r.threshold),
    tiers: Array.isArray(r.tier_json)
      ? (r.tier_json as { min: number; rate: number }[])
      : [],
    status: r.status,
  }));
}

export async function getTargetsForMonth(month: string): Promise<SalesTargetRow[]> {
  const supabase = createClient();
  const res = await supabase
    .from("sales_targets")
    .select("user_id, target_amount, target_cases, user:users(full_name)")
    .eq("period_month", month)
    .returns<RawSalesTarget[]>();
  return unwrap(res, [] as RawSalesTarget[], "getTargetsForMonth").map((t) => ({
    userId: t.user_id,
    userName: t.user?.full_name ?? "—",
    targetAmount: Number(t.target_amount),
    targetCases: Number(t.target_cases),
  }));
}

export async function listActiveUsers(): Promise<UserOption[]> {
  const supabase = createClient();
  const rows = unwrap(
    await supabase.from("users").select("id, full_name").eq("status", "active").order("full_name"),
    [],
    "listActiveUsers",
  );
  return rows.map((r: Record<string, unknown>) => ({
    id: r.id as string,
    fullName: r.full_name as string,
  }));
}

export async function listRoles(): Promise<RoleOption[]> {
  const supabase = createClient();
  const rows = unwrap(
    await supabase.from("roles").select("code, name").order("name"),
    [],
    "listRoles",
  );
  return rows as RoleOption[];
}
