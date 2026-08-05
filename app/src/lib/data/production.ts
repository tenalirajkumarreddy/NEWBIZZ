// =====================================================================
// lib/data/production.ts — server-only readers for Production Runs (§6.4).
//
// Reads are RLS-scoped under the caller's JWT. All writes go through
// the post_production_run SECURITY DEFINER RPC (migration 0018).
// =====================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrap } from "./types";
import { todayIST } from "./fy";

// --------------------------------------------------------- Run list

export interface ProductionRunRow {
  id: string;
  runNo: string;
  runDate: string;
  stage: number;
  outputItemId: string;
  outputSku: string;
  outputName: string;
  outputQty: number;
  outputUnitCost: number;
  inputValue: number;
  abnormalWastage: number;
  status: string;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  inputCount: number;
}

type RawRunList = {
  id: string;
  run_no: string;
  run_date: string;
  stage: number;
  output_item_id: string;
  output_qty: number;
  output_unit_cost: number;
  input_value: number;
  abnormal_wastage_value: number;
  status: string;
  notes: string | null;
  created_at: string;
  output_item: { sku: string; name: string } | null;
  creator: { full_name: string } | null;
  inputs: { count: number }[];
};

const RUN_LIST_SELECT =
  "id, run_no, run_date, stage, output_item_id, output_qty, output_unit_cost, input_value, abnormal_wastage_value, status, notes, created_at, " +
  "output_item:items!production_runs_output_item_id_fkey(sku, name), " +
  "creator:users!production_runs_created_by_fkey(full_name), " +
  "inputs:production_run_inputs(count)";

export async function listRuns(opts: {
  stage?: number;
  status?: string;
  limit?: number;
} = {}): Promise<ProductionRunRow[]> {
  const supabase = createClient();
  let q = supabase
    .from("production_runs")
    .select(RUN_LIST_SELECT)
    .order("run_date", { ascending: false })
    .order("run_no", { ascending: false });
  if (opts.stage != null) q = q.eq("stage", opts.stage);
  if (opts.status) q = q.eq("status", opts.status as "posted" | "reversed");
  if (opts.limit) q = q.limit(opts.limit);

  const rows = unwrap(await q.returns<RawRunList[]>(), [] as RawRunList[], "listRuns");
  return rows.map((r) => ({
    id: r.id,
    runNo: r.run_no,
    runDate: r.run_date,
    stage: r.stage,
    outputItemId: r.output_item_id,
    outputSku: r.output_item?.sku ?? "—",
    outputName: r.output_item?.name ?? "—",
    outputQty: Number(r.output_qty),
    outputUnitCost: Number(r.output_unit_cost),
    inputValue: Number(r.input_value),
    abnormalWastage: Number(r.abnormal_wastage_value),
    status: r.status,
    notes: r.notes,
    createdBy: r.creator?.full_name ?? "—",
    createdAt: r.created_at,
    inputCount: r.inputs?.[0]?.count ?? 0,
  }));
}

// --------------------------------------------------------- Run detail

export interface ProductionRunInputRow {
  id: string;
  itemId: string;
  itemSku: string;
  itemName: string;
  qty: number;
  unitCost: number;
  value: number;
  lineNo: number;
}

export interface ProductionRunDetail extends ProductionRunRow {
  inputs: ProductionRunInputRow[];
}

type RawInput = {
  id: string;
  item_id: string;
  qty: number;
  unit_cost: number;
  value: number;
  line_no: number;
  item: { sku: string; name: string } | null;
};

type RawRunDetail = RawRunList;

const RUN_DETAIL_SELECT = RUN_LIST_SELECT;
const INPUT_SELECT =
  "id, item_id, qty, unit_cost, value, line_no, " +
  "item:items!production_run_inputs_item_id_fkey(sku, name)";

export async function getRun(id: string): Promise<ProductionRunDetail | null> {
  const supabase = createClient();
  const [hdrRes, inpRes] = await Promise.all([
    supabase
      .from("production_runs")
      .select(RUN_DETAIL_SELECT)
      .eq("id", id)
      .maybeSingle()
      .returns<RawRunDetail | null>(),
    supabase
      .from("production_run_inputs")
      .select(INPUT_SELECT)
      .eq("run_id", id)
      .order("line_no")
      .returns<RawInput[]>(),
  ]);
  const hdr = unwrap(hdrRes, null as RawRunDetail | null, "getRun");
  if (!hdr) return null;
  const inputs = unwrap(inpRes, [] as RawInput[], "getRun:inputs");
  return {
    id: hdr.id,
    runNo: hdr.run_no,
    runDate: hdr.run_date,
    stage: hdr.stage,
    outputItemId: hdr.output_item_id,
    outputSku: hdr.output_item?.sku ?? "—",
    outputName: hdr.output_item?.name ?? "—",
    outputQty: Number(hdr.output_qty),
    outputUnitCost: Number(hdr.output_unit_cost),
    inputValue: Number(hdr.input_value),
    abnormalWastage: Number(hdr.abnormal_wastage_value),
    status: hdr.status,
    notes: hdr.notes,
    createdBy: hdr.creator?.full_name ?? "—",
    createdAt: hdr.created_at,
    inputCount: inputs.length,
    inputs: inputs.map((l) => ({
      id: l.id,
      itemId: l.item_id,
      itemSku: l.item?.sku ?? "—",
      itemName: l.item?.name ?? "—",
      qty: Number(l.qty),
      unitCost: Number(l.unit_cost),
      value: Number(l.value),
      lineNo: l.line_no,
    })),
  };
}

// --------------------------------------------------------- Dashboard monitor

export interface ProductionMonitor {
  runCount: number;
  outputUnits: number;
  outputValue: number;
  inputValue: number;
  wastageValue: number;
  /** Count of distinct output items produced today. */
  productCount: number;
  recent: ProductionRunRow[];
}

/**
 * Aggregate for the dashboard Production monitor: today's posted runs rolled up
 * into totals, plus the most recent runs. Returns an all-zero shape when there
 * is no activity so the widget renders an honest empty state.
 */
export async function getProductionMonitor(limit = 6): Promise<ProductionMonitor> {
  const today = todayIST();
  const runs = await listRuns({ status: "posted", limit: 50 });
  const todays = runs.filter((r) => r.runDate === today);

  const outputUnits = todays.reduce((s, r) => s + r.outputQty, 0);
  const outputValue = todays.reduce((s, r) => s + r.outputQty * r.outputUnitCost, 0);
  const inputValue = todays.reduce((s, r) => s + r.inputValue, 0);
  const wastageValue = todays.reduce((s, r) => s + r.abnormalWastage, 0);
  const products = new Set(todays.map((r) => r.outputItemId));

  return {
    runCount: todays.length,
    outputUnits,
    outputValue,
    inputValue,
    wastageValue,
    productCount: products.size,
    recent: runs.slice(0, limit),
  };
}
