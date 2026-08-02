import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { unwrap } from "./types";

// =====================================================================
// Fleet thresholds (existing)
// =====================================================================

export interface FleetThresholds {
  fuelRefillThresholdPct: number;
  fuelLeakThresholdPct: number;
  fraudTolerancePct: number;
  warehouseDepartureKm: number;
  warehouseArrivalKm: number;
}

const DEFAULTS: FleetThresholds = {
  fuelRefillThresholdPct: 2,
  fuelLeakThresholdPct: 5,
  fraudTolerancePct: 5,
  warehouseDepartureKm: 1,
  warehouseArrivalKm: 1,
};

export async function getFleetThresholds(supabase?: SupabaseClient): Promise<FleetThresholds> {
  const db = supabase ?? createClient();
  const row = unwrap(
    await db.from("company_settings").select("feature_flags").limit(1).maybeSingle() as any,
    null as { feature_flags: Record<string, number> } | null,
    "getFleetThresholds",
  );
  const ff = row?.feature_flags ?? {};
  return {
    fuelRefillThresholdPct: (ff.fuel_refill_threshold_pct as number) ?? DEFAULTS.fuelRefillThresholdPct,
    fuelLeakThresholdPct: (ff.fuel_leak_threshold_pct as number) ?? DEFAULTS.fuelLeakThresholdPct,
    fraudTolerancePct: (ff.fraud_tolerance_pct as number) ?? DEFAULTS.fraudTolerancePct,
    warehouseDepartureKm: (ff.warehouse_departure_km as number) ?? DEFAULTS.warehouseDepartureKm,
    warehouseArrivalKm: (ff.warehouse_arrival_km as number) ?? DEFAULTS.warehouseArrivalKm,
  };
}

/** Raw snake_case feature_flags map (as stored), for the fleet settings form. */
export async function getFleetThresholdsRaw(supabase?: SupabaseClient): Promise<Record<string, number>> {
  const db = supabase ?? createClient();
  const row = unwrap(
    await db.from("company_settings").select("feature_flags").limit(1).maybeSingle() as any,
    null as { feature_flags: Record<string, number> } | null,
    "getFleetThresholdsRaw",
  );
  return row?.feature_flags ?? {};
}

// =====================================================================
// Company profile
// =====================================================================

export interface CompanyRow {
  id: string;
  legalName: string;
  tradeName: string | null;
  primaryGstin: string | null;
  pan: string | null;
  stateCode: string;
  address: string | null;
  fssaiNo: string | null;
  bisNo: string | null;
  invoiceFooter: string | null;
  fyStartMonth: number;
  baseCurrency: string;
  featureFlags: Record<string, any>;
}

export async function getCompany(): Promise<CompanyRow | null> {
  const supabase = createClient();
  const row = unwrap(
    await (supabase as any)
      .from("company_settings")
      .select("*")
      .limit(1)
      .maybeSingle(),
    null as any,
    "getCompany",
  );
  if (!row) return null;
  return {
    id: row.id,
    legalName: row.legal_name,
    tradeName: row.trade_name,
    primaryGstin: row.primary_gstin,
    pan: row.pan,
    stateCode: row.state_code,
    address: row.address,
    fssaiNo: row.fssai_no,
    bisNo: row.bis_no,
    invoiceFooter: row.invoice_footer,
    fyStartMonth: row.fy_start_month,
    baseCurrency: row.base_currency,
    featureFlags: row.feature_flags ?? {},
  };
}

// =====================================================================
// Financial Years
// =====================================================================

export interface FyRow {
  id: string;
  code: string;
  startDate: string;
  endDate: string;
  status: string;
}

export async function listFinancialYears(): Promise<FyRow[]> {
  const supabase = createClient();
  const rows = unwrap(
    await (supabase as any)
      .from("financial_years")
      .select("id, code, start_date, end_date, status")
      .order("start_date", { ascending: false }),
    [] as any[],
    "listFinancialYears",
  );
  return rows.map((r: any) => ({
    id: r.id,
    code: r.code,
    startDate: r.start_date,
    endDate: r.end_date,
    status: r.status,
  }));
}

// =====================================================================
// Number Series
// =====================================================================

export interface NumberSeriesRow {
  id: string;
  docType: string;
  fyId: string;
  prefix: string;
  nextVal: number;
  padWidth: number;
}

export async function listNumberSeries(fyId?: string): Promise<NumberSeriesRow[]> {
  const supabase = createClient();
  let q = (supabase as any)
    .from("number_series")
    .select("id, doc_type, fy_id, prefix, next_val, pad_width")
    .order("doc_type");
  if (fyId) q = q.eq("fy_id", fyId);
  const rows = unwrap(await q, [] as any[], "listNumberSeries");
  return rows.map((r: any) => ({
    id: r.id,
    docType: r.doc_type,
    fyId: r.fy_id,
    prefix: r.prefix,
    nextVal: Number(r.next_val),
    padWidth: r.pad_width,
  }));
}

// =====================================================================
// Payment Methods
// =====================================================================

export interface PaymentMethodRow {
  id: string;
  code: string;
  name: string;
  destination: string;
  isActive: boolean;
}

export async function listPaymentMethods(): Promise<PaymentMethodRow[]> {
  const supabase = createClient();
  const rows = unwrap(
    await (supabase as any)
      .from("payment_methods")
      .select("id, code, name, destination, is_active")
      .order("sort_order"),
    [] as any[],
    "listPaymentMethods",
  );
  return rows.map((r: any) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    destination: r.destination,
    isActive: r.is_active,
  }));
}

// =====================================================================
// Entity Serials (auto-numbering prefixes)
// =====================================================================

export interface EntitySerialRow {
  entityType: string;
  prefix: string;
  padWidth: number;
  nextVal: number;
}

export async function listEntitySerials(): Promise<EntitySerialRow[]> {
  const supabase = createClient();
  const rows = unwrap(
    await (supabase as any)
      .from("entity_serials")
      .select("entity_type, prefix, pad_width, next_val")
      .order("entity_type"),
    [] as any[],
    "listEntitySerials",
  );
  return rows.map((r: any) => ({
    entityType: r.entity_type,
    prefix: r.prefix,
    padWidth: r.pad_width,
    nextVal: Number(r.next_val),
  }));
}
