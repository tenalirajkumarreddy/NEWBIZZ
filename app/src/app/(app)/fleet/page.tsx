import { listVehicles } from "@/lib/data/fleet";
import { listWarehouses } from "@/lib/data/branches";
import { getIntanglesLiveData } from "@/lib/actions/fleet";
import { createClient } from "@/lib/supabase/server";
import FleetDashboard from "./FleetDashboard";

export const metadata = { title: "Vehicles & Fleet — NEWBIZZ" };

export const dynamic = "force-dynamic";

interface TripSummary {
  id: string;
  category: string | null;
  type: string;
  status: string;
  startedAt: string | null;
  endedAt: string | null;
  distanceKm: number | null;
}

interface FuelLogSummary {
  id: string;
  logDate: string;
  litres: number;
  amount: number;
}

interface PendingRefill {
  id: string;
  eventType: string;
  detectedAt: string;
  deltaLitres: number;
}

export default async function FleetListPage() {
  const supabase = createClient();

  const [vehicles, liveResult, warehouses] = await Promise.all([
    listVehicles(),
    getIntanglesLiveData(),
    listWarehouses(),
  ]);

  const liveData = liveResult.ok ? liveResult.vehicles : [];

  const [activeTripsResult, tripsRaw, fuelLogsRaw, refillsRaw] = await Promise.all([
    (supabase as any)
      .from("trips")
      .select("*", { count: "exact", head: true })
      .eq("type", "auto")
      .eq("status", "active"),
    (supabase as any)
      .from("trips")
      .select("id, vehicle_id, category, type, status, started_at, ended_at, distance_km")
      .eq("type", "auto")
      .order("started_at", { ascending: false })
      .limit(100),
    (supabase as any)
      .from("fuel_logs")
      .select("id, vehicle_id, log_date, litres, amount")
      .order("log_date", { ascending: false })
      .limit(100),
    (supabase as any)
      .from("fuel_refill_events")
      .select("id, vehicle_id, event_type, detected_at, delta_litres, status")
      .eq("status", "pending")
      .order("detected_at", { ascending: false }),
  ]);

  const tripsMap: Record<string, TripSummary[]> = {};
  for (const t of (tripsRaw.data ?? []) as any[]) {
    if (!tripsMap[t.vehicle_id]) tripsMap[t.vehicle_id] = [];
    tripsMap[t.vehicle_id].push({
      id: t.id,
      category: t.category,
      type: t.type,
      status: t.status,
      startedAt: t.started_at,
      endedAt: t.ended_at,
      distanceKm: t.distance_km != null ? Number(t.distance_km) : null,
    });
  }

  const fuelLogsMap: Record<string, FuelLogSummary[]> = {};
  for (const f of (fuelLogsRaw.data ?? []) as any[]) {
    if (!fuelLogsMap[f.vehicle_id]) fuelLogsMap[f.vehicle_id] = [];
    fuelLogsMap[f.vehicle_id].push({
      id: f.id,
      logDate: f.log_date,
      litres: Number(f.litres),
      amount: Number(f.amount),
    });
  }

  const pendingRefillsMap: Record<string, PendingRefill[]> = {};
  for (const r of (refillsRaw.data ?? []) as any[]) {
    if (!pendingRefillsMap[r.vehicle_id]) pendingRefillsMap[r.vehicle_id] = [];
    pendingRefillsMap[r.vehicle_id].push({
      id: r.id,
      eventType: r.event_type,
      detectedAt: r.detected_at,
      deltaLitres: Number(r.delta_litres),
    });
  }

  const warehouseMarkers = warehouses
    .filter((w): w is typeof w & { lat: number; lng: number } => w.lat != null && w.lng != null)
    .map((w) => ({ lat: w.lat, lng: w.lng, name: w.name }));

  return (
    <FleetDashboard
      vehicles={vehicles}
      liveData={liveData}
      warehouses={warehouseMarkers}
      activeTrips={activeTripsResult.count ?? 0}
      tripsMap={tripsMap}
      fuelLogsMap={fuelLogsMap}
      pendingRefillsMap={pendingRefillsMap}
    />
  );
}
