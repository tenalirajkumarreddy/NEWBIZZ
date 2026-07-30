import type { SupabaseClient } from "@supabase/supabase-js";
import { getFleetThresholds } from "@/lib/data/settings";

interface GpsSnapshotWithFuel {
  vehicle_id: string;
  fuel_amount: number | null;
  fuel_pct: number | null;
  ignition: boolean | null;
  recorded_at: string;
}

export async function runFuelDetection(
  snapshots: GpsSnapshotWithFuel[],
  supabase: SupabaseClient,
): Promise<{ refillsDetected: number; leaksDetected: number }> {
  const thresholds = await getFleetThresholds(supabase);
  let refillsDetected = 0;
  let leaksDetected = 0;

  for (const snap of snapshots) {
    if (snap.fuel_amount == null) continue;

    const { data: prev } = await supabase
      .from("vehicle_gps_logs" as any)
      .select("fuel_amount, ignition, recorded_at")
      .eq("vehicle_id", snap.vehicle_id)
      .neq("recorded_at", snap.recorded_at)
      .order("recorded_at", { ascending: false })
      .limit(1)
      .maybeSingle() as unknown as {
      data: { fuel_amount: number; ignition: boolean; recorded_at: string } | null;
    };

    if (!prev || prev.fuel_amount == null) continue;

    const prevAmount = prev.fuel_amount;
    const newAmount = snap.fuel_amount;

    if (prevAmount < 1) continue;

    const pctChange = ((newAmount - prevAmount) / prevAmount) * 100;

    if (pctChange > thresholds.fuelRefillThresholdPct) {
      const { data: lastEvent } = await supabase
        .from("fuel_refill_events" as any)
        .select("event_type, detected_at")
        .eq("vehicle_id", snap.vehicle_id)
        .order("detected_at", { ascending: false })
        .limit(1)
        .maybeSingle() as unknown as {
        data: { event_type: string; detected_at: string } | null;
      };

      if (
        lastEvent &&
        lastEvent.event_type === "refill" &&
        new Date(snap.recorded_at).getTime() - new Date(lastEvent.detected_at).getTime() < 30 * 60 * 1000
      ) {
        continue;
      }

      const { error } = await supabase.from("fuel_refill_events" as any).insert({
        vehicle_id: snap.vehicle_id,
        detected_at: snap.recorded_at,
        event_type: "refill",
        prev_amount: prevAmount,
        new_amount: newAmount,
        delta_litres: newAmount - prevAmount,
        status: "pending",
      });
      if (!error) refillsDetected++;
    } else if (pctChange < -thresholds.fuelLeakThresholdPct && snap.ignition === false) {
      const { data: lastEvent } = await supabase
        .from("fuel_refill_events" as any)
        .select("event_type, detected_at")
        .eq("vehicle_id", snap.vehicle_id)
        .order("detected_at", { ascending: false })
        .limit(1)
        .maybeSingle() as unknown as {
        data: { event_type: string; detected_at: string } | null;
      };

      if (
        lastEvent &&
        lastEvent.event_type === "leak" &&
        new Date(snap.recorded_at).getTime() - new Date(lastEvent.detected_at).getTime() < 30 * 60 * 1000
      ) {
        continue;
      }

      const { error } = await supabase.from("fuel_refill_events" as any).insert({
        vehicle_id: snap.vehicle_id,
        detected_at: snap.recorded_at,
        event_type: "leak",
        prev_amount: prevAmount,
        new_amount: newAmount,
        delta_litres: newAmount - prevAmount,
        status: "pending",
      });
      if (!error) leaksDetected++;
    }
  }

  return { refillsDetected, leaksDetected };
}
