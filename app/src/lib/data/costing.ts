// =====================================================================
// lib/data/costing.ts — server-only readers for Process Costing (§6.8).
//
// Costing is a valuation/reporting read-model. All writes go through
// definer RPCs (run_process_costing, compute_loaded_cost) or direct
// INSERT/UPDATE on overhead_pools (gated by config.edit).
// =====================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrap } from "./types";

// --------------------------------------------------------- Costing runs

export interface CostingRunRow {
  id: string;
  periodMonth: string;
  stage: number;
  status: string;           // "draft" | "final"
  unitsCompleted: number;
  wipUnits: number;
  matEquivUnits: number;
  convEquivUnits: number;
  costMatPerEu: number;     // materials cost per equivalent unit
  costConvPerEu: number;    // conversion cost per equivalent unit
  transferredInPerUnit: number | null;
  cogmPerUnit: number;
  computedAt: string;
  computedBy: string;
}

type RawCostingRun = {
  id: string;
  period_month: string;
  stage: number;
  status: string;
  units_completed: number;
  wip_units: number;
  mat_equiv_units: number;
  conv_equiv_units: number;
  cost_mat_per_eu: number;
  cost_conv_per_eu: number;
  transferred_in_per_unit: number | null;
  cogm_per_unit: number;
  computed_at: string;
  computed_by: string | null;
  computer: { full_name: string } | null;
};

const RUN_SELECT =
  "id, period_month, stage, status, units_completed, wip_units, mat_equiv_units, conv_equiv_units, " +
  "cost_mat_per_eu, cost_conv_per_eu, transferred_in_per_unit, cogm_per_unit, computed_at, computed_by, " +
  "computer:users!costing_runs_computed_by_fkey(full_name)";

export async function listCostingRuns(): Promise<CostingRunRow[]> {
  const supabase = createClient();
  const rows = unwrap(
    await supabase
      .from("costing_runs")
      .select(RUN_SELECT)
      .order("period_month", { ascending: false })
      .order("stage")
      .returns<RawCostingRun[]>(),
    [] as RawCostingRun[],
    "listCostingRuns",
  );
  return rows.map((r) => ({
    id: r.id,
    periodMonth: r.period_month,
    stage: r.stage,
    status: r.status,
    unitsCompleted: Number(r.units_completed),
    wipUnits: Number(r.wip_units),
    matEquivUnits: Number(r.mat_equiv_units),
    convEquivUnits: Number(r.conv_equiv_units),
    costMatPerEu: Number(r.cost_mat_per_eu),
    costConvPerEu: Number(r.cost_conv_per_eu),
    transferredInPerUnit: r.transferred_in_per_unit != null ? Number(r.transferred_in_per_unit) : null,
    cogmPerUnit: Number(r.cogm_per_unit),
    computedAt: r.computed_at,
    computedBy: r.computer?.full_name ?? "—",
  }));
}

export interface CostingRunLineRow {
  id: string;
  itemId: string;
  itemSku: string;
  itemName: string;
  units: number;
  costMat: number;
  costConv: number;
  transferredIn: number;
  cogmTotal: number;
  cogmPerUnit: number;
}

interface RawCostingRunLine {
  id: string;
  item_id: string;
  units: number;
  cost_mat: number;
  cost_conv: number;
  transferred_in: number;
  cogm_total: number;
  cogm_per_unit: number;
  item: { sku: string; name: string } | null;
}

export interface CostingRunDetail extends CostingRunRow {
  lines: CostingRunLineRow[];
}

const LINE_SELECT =
  "id, item_id, units, cost_mat, cost_conv, transferred_in, cogm_total, cogm_per_unit, " +
  "item:items!costing_run_lines_item_id_fkey(sku, name)";

export async function getCostingRun(id: string): Promise<CostingRunDetail | null> {
  const supabase = createClient();
  const [hdrRes, lineRes] = await Promise.all([
    supabase
      .from("costing_runs")
      .select(RUN_SELECT)
      .eq("id", id)
      .maybeSingle()
      .returns<RawCostingRun | null>(),
    supabase
      .from("costing_run_lines")
      .select(LINE_SELECT)
      .eq("run_id", id)
      .order("item_id")
      .returns<RawCostingRunLine[]>(),
  ]);
  const hdr = unwrap(hdrRes, null as RawCostingRun | null, "getCostingRun");
  if (!hdr) return null;
  const lines = unwrap(lineRes, [] as RawCostingRunLine[], "getCostingRun:lines");
  return {
    id: hdr.id,
    periodMonth: hdr.period_month,
    stage: hdr.stage,
    status: hdr.status,
    unitsCompleted: Number(hdr.units_completed),
    wipUnits: Number(hdr.wip_units),
    matEquivUnits: Number(hdr.mat_equiv_units),
    convEquivUnits: Number(hdr.conv_equiv_units),
    costMatPerEu: Number(hdr.cost_mat_per_eu),
    costConvPerEu: Number(hdr.cost_conv_per_eu),
    transferredInPerUnit: hdr.transferred_in_per_unit != null ? Number(hdr.transferred_in_per_unit) : null,
    cogmPerUnit: Number(hdr.cogm_per_unit),
    computedAt: hdr.computed_at,
    computedBy: hdr.computer?.full_name ?? "—",
    lines: lines.map((l) => ({
      id: l.id,
      itemId: l.item_id,
      itemSku: l.item?.sku ?? "—",
      itemName: l.item?.name ?? "—",
      units: Number(l.units),
      costMat: Number(l.cost_mat),
      costConv: Number(l.cost_conv),
      transferredIn: Number(l.transferred_in),
      cogmTotal: Number(l.cogm_total),
      cogmPerUnit: Number(l.cogm_per_unit),
    })),
  };
}

// --------------------------------------------------------- Overhead pools

export interface OverheadPoolRow {
  id: string;
  name: string;
  stage: string;          // "blowing" | "filling" | "shared"
  periodMonth: string;
  amount: number;
  source: string;         // "estimated" | "actual"
  allocationDriver: string; // "cases" | "machine_hours" | "labour_hours"
  createdAt: string;
  createdBy: string;
}

type RawPool = {
  id: string;
  name: string;
  stage: string;
  period_month: string;
  amount: number;
  source: string;
  allocation_driver: string;
  created_at: string;
  created_by: string | null;
  creator: { full_name: string } | null;
};

const POOL_SELECT =
  "id, name, stage, period_month, amount, source, allocation_driver, created_at, created_by, " +
  "creator:users!overhead_pools_created_by_fkey(full_name)";

export async function listOverheadPools(opts: {
  month?: string;
  stage?: string;
} = {}): Promise<OverheadPoolRow[]> {
  const supabase = createClient();
  let q = supabase
    .from("overhead_pools")
    .select(POOL_SELECT)
    .order("period_month", { ascending: false })
    .order("name");
  if (opts.month) q = q.eq("period_month", opts.month);
  if (opts.stage) q = q.eq("stage", opts.stage);

  const rows = unwrap(await q.returns<RawPool[]>(), [] as RawPool[], "listOverheadPools");
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    stage: r.stage,
    periodMonth: r.period_month,
    amount: Number(r.amount),
    source: r.source,
    allocationDriver: r.allocation_driver,
    createdAt: r.created_at,
    createdBy: r.creator?.full_name ?? "—",
  }));
}

// --------------------------------------------------------- Product cost snapshots

export interface CostSnapshotRow {
  itemId: string;
  itemSku: string;
  itemName: string;
  periodMonth: string;
  cogmPerCase: number;
  loadedPerCase: number;
  sourceRunId: string | null;
  updatedAt: string;
}

type RawSnapshot = {
  item_id: string;
  period_month: string;
  cogm_per_case: number;
  loaded_per_case: number;
  source_run_id: string | null;
  updated_at: string;
  item: { sku: string; name: string } | null;
};

const SNAPSHOT_SELECT =
  "item_id, period_month, cogm_per_case, loaded_per_case, source_run_id, updated_at, " +
  "item:items!product_cost_snapshots_item_id_fkey(sku, name)";

export async function listCostSnapshots(opts: {
  month?: string;
} = {}): Promise<CostSnapshotRow[]> {
  const supabase = createClient();
  let q = supabase
    .from("product_cost_snapshots")
    .select(SNAPSHOT_SELECT)
    .order("period_month", { ascending: false })
    .order("item_id");
  if (opts.month) q = q.eq("period_month", opts.month);

  const rows = unwrap(await q.returns<RawSnapshot[]>(), [] as RawSnapshot[], "listCostSnapshots");
  return rows.map((r) => ({
    itemId: r.item_id,
    itemSku: r.item?.sku ?? "—",
    itemName: r.item?.name ?? "—",
    periodMonth: r.period_month,
    cogmPerCase: Number(r.cogm_per_case),
    loadedPerCase: Number(r.loaded_per_case),
    sourceRunId: r.source_run_id,
    updatedAt: r.updated_at,
  }));
}

// --------------------------------------------------------- Untagged accounts

export interface UntaggedAccountRow {
  code: string;
  name: string;
}

export async function costingUntaggedAccounts(month: string): Promise<UntaggedAccountRow[]> {
  const supabase = createClient();
  const res = await supabase.rpc("costing_untagged_accounts", { p_month: month });
  if (res.error) return [];
  return (res.data ?? []) as UntaggedAccountRow[];
}
