// =====================================================================
// lib/data/assets.ts — server-only readers for Fixed Assets & Depreciation
// (§5.7). WDV is derived live (capitalized − Σ depreciation), never stored.
// Reads only; writes go through the SECURITY DEFINER RPCs in
// lib/actions/assets.ts.
// =====================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrap } from "./types";
import type { Database } from "@/lib/supabase/database.types";

type Tables = Database["public"]["Tables"];
export type AssetClass = Database["public"]["Enums"]["asset_class"];
export type DepMethod = Database["public"]["Enums"]["dep_method"];
export type AssetStatus = Database["public"]["Enums"]["asset_status"];

export interface AssetRow {
  id: string;
  assetNo: string;
  name: string;
  assetClass: AssetClass;
  purchaseDate: string;
  capitalizedValue: number;
  salvageValue: number;
  method: DepMethod;
  usefulLifeYears: number | null;
  depRate: number | null;
  status: AssetStatus;
  disposedOn: string | null;
  /** Live written-down value = capitalized − Σ depreciation booked. */
  accumulatedDep: number;
  wdv: number;
}

type RawAsset = Pick<
  Tables["fixed_assets"]["Row"],
  | "id" | "asset_no" | "name" | "asset_class" | "purchase_date" | "capitalized_value"
  | "salvage_value" | "method" | "useful_life_years" | "dep_rate" | "status" | "disposed_on"
> & {
  dep_lines: { amount: number }[] | null;
};

const ASSET_SELECT =
  "id, asset_no, name, asset_class, purchase_date, capitalized_value, salvage_value, " +
  "method, useful_life_years, dep_rate, status, disposed_on, " +
  "dep_lines:depreciation_lines(amount)";

function toRow(r: RawAsset): AssetRow {
  const accum = (r.dep_lines ?? []).reduce((s, l) => s + Number(l.amount), 0);
  const cap = Number(r.capitalized_value);
  return {
    id: r.id,
    assetNo: r.asset_no,
    name: r.name,
    assetClass: r.asset_class,
    purchaseDate: r.purchase_date,
    capitalizedValue: cap,
    salvageValue: Number(r.salvage_value),
    method: r.method,
    usefulLifeYears: r.useful_life_years,
    depRate: r.dep_rate == null ? null : Number(r.dep_rate),
    status: r.status,
    disposedOn: r.disposed_on,
    accumulatedDep: accum,
    wdv: cap - accum,
  };
}

export async function listFixedAssets(opts: { status?: AssetStatus; limit?: number } = {}): Promise<AssetRow[]> {
  const supabase = createClient();
  let q = supabase.from("fixed_assets").select(ASSET_SELECT).order("purchase_date", { ascending: false }).limit(opts.limit ?? 200);
  if (opts.status) q = q.eq("status", opts.status);
  const rows = unwrap(await q.returns<RawAsset[]>(), [] as RawAsset[], "listFixedAssets");
  return rows.map(toRow);
}

export interface DepLineRow {
  runNo: string;
  runDate: string;
  periodLabel: string | null;
  amount: number;
  wdvBefore: number;
  wdvAfter: number;
}

export interface AssetDetail extends AssetRow {
  note: string | null;
  disposalJournalId: string | null;
  capitalizeJournalId: string | null;
  depHistory: DepLineRow[];
}

export async function getFixedAsset(id: string): Promise<AssetDetail | null> {
  const supabase = createClient();
  const res = await supabase
    .from("fixed_assets")
    .select(
      ASSET_SELECT +
        ", note, disposal_journal_id, capitalize_journal_id, " +
        "history:depreciation_lines(amount, wdv_before, wdv_after, run:depreciation_runs(run_no, run_date, period_label))",
    )
    .eq("id", id)
    .maybeSingle()
    .returns<
      | (RawAsset & {
          note: string | null;
          disposal_journal_id: string | null;
          capitalize_journal_id: string | null;
          history:
            | {
                amount: number;
                wdv_before: number;
                wdv_after: number;
                run: { run_no: string; run_date: string; period_label: string | null } | null;
              }[]
            | null;
        })
      | null
    >();
  const r = unwrap(res, null, "getFixedAsset");
  if (!r) return null;
  const depHistory: DepLineRow[] = (r.history ?? [])
    .map((h) => ({
      runNo: h.run?.run_no ?? "—",
      runDate: h.run?.run_date ?? "",
      periodLabel: h.run?.period_label ?? null,
      amount: Number(h.amount),
      wdvBefore: Number(h.wdv_before),
      wdvAfter: Number(h.wdv_after),
    }))
    .sort((a, b) => (a.runDate < b.runDate ? 1 : -1));
  return {
    ...toRow(r),
    note: r.note,
    disposalJournalId: r.disposal_journal_id,
    capitalizeJournalId: r.capitalize_journal_id,
    depHistory,
  };
}

export interface DepRunRow {
  id: string;
  runNo: string;
  runDate: string;
  periodLabel: string | null;
  totalAmount: number;
  journalEntryId: string | null;
  lineCount: number;
}

export async function listDepreciationRuns(opts: { limit?: number } = {}): Promise<DepRunRow[]> {
  const supabase = createClient();
  const res = await supabase
    .from("depreciation_runs")
    .select("id, run_no, run_date, period_label, total_amount, journal_entry_id, lines:depreciation_lines(id)")
    .order("run_date", { ascending: false })
    .limit(opts.limit ?? 100)
    .returns<
      {
        id: string;
        run_no: string;
        run_date: string;
        period_label: string | null;
        total_amount: number;
        journal_entry_id: string | null;
        lines: { id: string }[] | null;
      }[]
    >();
  const rows = unwrap(res, [] as never[], "listDepreciationRuns");
  return rows.map((r) => ({
    id: r.id,
    runNo: r.run_no,
    runDate: r.run_date,
    periodLabel: r.period_label,
    totalAmount: Number(r.total_amount),
    journalEntryId: r.journal_entry_id,
    lineCount: r.lines?.length ?? 0,
  }));
}
