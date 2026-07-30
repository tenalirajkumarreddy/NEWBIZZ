import { createServiceClient } from "@/lib/supabase/service";
import {
  fetchIntangles,
  buildVehicleListPath,
  getIntanglesConfig,
  type IntanglesVehicleRaw,
} from "./client";
import { runTripDetection } from "./trip-detector";
import { runFuelDetection } from "./fuel-detector";

export type PollResult =
  | { ok: true; inserted: number; tripsStarted: number; tripsEnded: number; refillsDetected: number; leaksDetected: number }
  | { ok: false; error: string };

export async function runIntanglesPoll(): Promise<PollResult> {
  try {
    const { accountId } = getIntanglesConfig();
    const vehicles = await fetchIntangles<IntanglesVehicleRaw[]>(
      buildVehicleListPath(accountId, true),
    );

    const supabase = createServiceClient();
    const rows: {
      vehicle_id: string;
      lat: number | null;
      lng: number | null;
      speed: number | null;
      heading: number | null;
      ignition: boolean | null;
      fuel_amount: number | null;
      fuel_pct: number | null;
      recorded_at: string;
    }[] = [];

    for (const v of vehicles) {
      if (!v.last_state) continue;
      const state = v.last_state;
      if (state.timestamp == null) continue;
      const regNo = v.plate ?? v.tag;
      if (!regNo) continue;

      const { data: match } = await (supabase as any)
        .from("vehicles")
        .select("id")
        .eq("reg_no", regNo)
        .maybeSingle();

      if (!match) continue;

      rows.push({
        vehicle_id: match.id,
        lat: state.loc?.lat ?? null,
        lng: state.loc?.lng ?? null,
        speed: state.sp,
        heading: state.hd,
        ignition: state.exb === 1,
        fuel_amount: v.fuel?.amount ?? null,
        fuel_pct: v.fuel?.percentage ?? null,
        recorded_at: new Date(state.timestamp).toISOString(),
      });
    }

    let inserted = 0;
    if (rows.length > 0) {
      const { error } = await (supabase as any)
        .from("vehicle_gps_logs")
        .insert(rows);
      if (error) {
        return { ok: false, error: error.message };
      }
      inserted = rows.length;
    }

    const { tripsStarted, tripsEnded } = await runTripDetection(rows, supabase);
    const { refillsDetected, leaksDetected } = await runFuelDetection(rows, supabase);

    return { ok: true, inserted, tripsStarted, tripsEnded, refillsDetected, leaksDetected };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    return { ok: false, error: msg };
  }
}
