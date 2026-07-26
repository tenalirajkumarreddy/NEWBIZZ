import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrap } from "./types";

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

export async function getFleetThresholds(): Promise<FleetThresholds> {
  const supabase = createClient();
  const row = unwrap(
    await supabase
      .from("company_settings")
      .select("feature_flags")
      .limit(1)
      .maybeSingle() as any,
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

export async function getFleetThresholdsRaw(): Promise<Record<string, number>> {
  const t = await getFleetThresholds();
  return {
    fuel_refill_threshold_pct: t.fuelRefillThresholdPct,
    fuel_leak_threshold_pct: t.fuelLeakThresholdPct,
    fraud_tolerance_pct: t.fraudTolerancePct,
    warehouse_departure_km: t.warehouseDepartureKm,
    warehouse_arrival_km: t.warehouseArrivalKm,
  };
}
