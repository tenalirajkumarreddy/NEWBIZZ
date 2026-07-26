import { createClient } from "@/lib/supabase/server";
import { getFleetThresholds } from "@/lib/data/settings";

function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}

function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371;
  const dLat = deg2rad(lat2 - lat1);
  const dLng = deg2rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export interface WarehouseLocation {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export async function getWarehouses(): Promise<WarehouseLocation[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("branches")
    .select("id, name, lat, lng")
    .eq("is_warehouse", true)
    .not("lat", "is", null)
    .not("lng", "is", null);
  return (data ?? []).map((r: any) => ({
    id: r.id,
    name: r.name,
    lat: Number(r.lat),
    lng: Number(r.lng),
  }));
}

interface GpsSnapshot {
  vehicle_id: string;
  lat: number | null;
  lng: number | null;
  speed: number | null;
  heading: number | null;
  ignition: boolean | null;
  recorded_at: string;
}

export async function runTripDetection(
  snapshots: GpsSnapshot[],
): Promise<{ tripsStarted: number; tripsEnded: number }> {
  const thresholds = await getFleetThresholds();
  const warehouses = await getWarehouses();
  const supabase = createClient();
  const tripsApi = supabase.from("trips") as any;

  let tripsStarted = 0;
  let tripsEnded = 0;

  for (const snap of snapshots) {
    const { data: prev } = await supabase
      .from("vehicle_gps_logs" as any)
      .select("ignition")
      .eq("vehicle_id", snap.vehicle_id)
      .neq("recorded_at", snap.recorded_at)
      .order("recorded_at", { ascending: false })
      .limit(1)
      .maybeSingle() as unknown as {
      data: { ignition: boolean } | null;
    };

    const prevIgnition = prev?.ignition ?? null;

    if (snap.ignition === true && prevIgnition === false) {
      const { data: existing } = await tripsApi
        .select("id")
        .eq("vehicle_id", snap.vehicle_id)
        .eq("type", "auto")
        .eq("category", "ignition")
        .eq("status", "active")
        .limit(1);

      if (!existing || existing.length === 0) {
        const { error } = await tripsApi.insert({
          vehicle_id: snap.vehicle_id,
          trip_date: snap.recorded_at.split("T")[0],
          started_at: snap.recorded_at,
          start_lat: snap.lat,
          start_lng: snap.lng,
          type: "auto",
          category: "ignition",
          status: "active",
        });
        if (!error) tripsStarted++;
      }
    }

    if (snap.ignition === false && prevIgnition === true) {
      const { data: active } = await tripsApi
        .select("id, start_lat, start_lng, started_at")
        .eq("vehicle_id", snap.vehicle_id)
        .eq("type", "auto")
        .eq("category", "ignition")
        .eq("status", "active")
        .limit(1);

      const trip = active?.[0] ?? null;
      if (trip) {
        const dist = trip.start_lat != null && trip.start_lng != null && snap.lat != null && snap.lng != null
          ? haversineKm(Number(trip.start_lat), Number(trip.start_lng), snap.lat, snap.lng)
          : null;

        const startedAt = trip.started_at ? new Date(trip.started_at).getTime() : null;
        const endedAt = snap.recorded_at ? new Date(snap.recorded_at).getTime() : null;
        const durationMs = startedAt && endedAt ? endedAt - startedAt : null;
        const avgSpeed = dist && durationMs ? (dist / (durationMs / 3_600_000)) : null;

        await tripsApi
          .update({
            ended_at: snap.recorded_at,
            end_lat: snap.lat,
            end_lng: snap.lng,
            status: "completed",
            distance_km: dist != null ? Math.round(dist * 100) / 100 : null,
            avg_speed: avgSpeed != null ? Math.round(avgSpeed * 100) / 100 : null,
          })
          .eq("id", trip.id);
        tripsEnded++;
      }
    }

    if (warehouses.length === 0) continue;
    if (snap.lat == null || snap.lng == null) continue;

    let isAtWarehouse = false;
    let isAwayFromWarehouse = false;
    for (const wh of warehouses) {
      const dist = haversineKm(snap.lat, snap.lng, wh.lat, wh.lng);
      if (dist <= thresholds.warehouseArrivalKm) isAtWarehouse = true;
      if (dist > thresholds.warehouseDepartureKm) isAwayFromWarehouse = true;
    }

    if (isAwayFromWarehouse) {
      const { data: active } = await tripsApi
        .select("id")
        .eq("vehicle_id", snap.vehicle_id)
        .eq("type", "auto")
        .eq("category", "warehouse")
        .eq("status", "active")
        .limit(1);

      if (!active || active.length === 0) {
        const { error } = await tripsApi.insert({
          vehicle_id: snap.vehicle_id,
          trip_date: snap.recorded_at.split("T")[0],
          started_at: snap.recorded_at,
          start_lat: snap.lat,
          start_lng: snap.lng,
          type: "auto",
          category: "warehouse",
          status: "active",
        });
        if (!error) tripsStarted++;
      }
    }

    if (isAtWarehouse) {
      const { data: active } = await tripsApi
        .select("id, start_lat, start_lng, started_at")
        .eq("vehicle_id", snap.vehicle_id)
        .eq("type", "auto")
        .eq("category", "warehouse")
        .eq("status", "active")
        .limit(1);

      const trip = active?.[0] ?? null;
      if (trip) {
        const dist = trip.start_lat != null && trip.start_lng != null && snap.lat != null && snap.lng != null
          ? haversineKm(Number(trip.start_lat), Number(trip.start_lng), snap.lat, snap.lng)
          : null;

        await tripsApi
          .update({
            ended_at: snap.recorded_at,
            end_lat: snap.lat,
            end_lng: snap.lng,
            status: "completed",
            distance_km: dist != null ? Math.round(dist * 100) / 100 : null,
          })
          .eq("id", trip.id);
        tripsEnded++;
      }
    }
  }

  return { tripsStarted, tripsEnded };
}
