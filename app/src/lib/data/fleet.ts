// =====================================================================
// lib/data/fleet.ts — server-only readers for Vehicles, Trips, Fuel & GPS (§7.2).
// =====================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrap } from "./types";

// ------------------------------------------------------------ Vehicles

export interface VehicleRow {
  id: string;
  regNo: string;
  type: string | null;
  capacity: string | null;
  ownedOrHired: string;
  status: string;
  createdAt: string;
}

type RawVehicle = {
  id: string;
  reg_no: string;
  type: string | null;
  capacity: string | null;
  owned_or_hired: string;
  status: string;
  created_at: string;
};

const VEHICLE_SELECT = "id, reg_no, type, capacity, owned_or_hired, status, created_at";

export async function listVehicles(): Promise<VehicleRow[]> {
  const supabase = createClient();
  const rows = unwrap(
    await supabase
      .from("vehicles")
      .select(VEHICLE_SELECT)
      .order("reg_no")
      .returns<RawVehicle[]>(),
    [] as RawVehicle[],
    "listVehicles",
  );
  return rows.map((r) => ({
    id: r.id,
    regNo: r.reg_no,
    type: r.type,
    capacity: r.capacity,
    ownedOrHired: r.owned_or_hired,
    status: r.status,
    createdAt: r.created_at,
  }));
}

export async function getVehicle(id: string): Promise<VehicleRow | null> {
  const supabase = createClient();
  const row = unwrap(
    await supabase
      .from("vehicles")
      .select(VEHICLE_SELECT)
      .eq("id", id)
      .single()
      .returns<RawVehicle | null>(),
    null,
    "getVehicle",
  );
  if (!row) return null;
  return {
    id: row.id,
    regNo: row.reg_no,
    type: row.type,
    capacity: row.capacity,
    ownedOrHired: row.owned_or_hired,
    status: row.status,
    createdAt: row.created_at,
  };
}

// ------------------------------------------------------- Vehicle GPS Live

export interface VehicleGpsRow {
  id: number;
  vehicleId: string;
  lat: number | null;
  lng: number | null;
  speed: number | null;
  heading: number | null;
  ignition: boolean | null;
  recordedAt: string;
}

type RawGps = {
  id: number;
  vehicle_id: string;
  lat: number | null;
  lng: number | null;
  speed: number | null;
  heading: number | null;
  ignition: boolean | null;
  recorded_at: string;
};

export async function getLatestGps(vehicleId: string): Promise<VehicleGpsRow | null> {
  const supabase = createClient();
  const row = unwrap(
    await supabase
      .from("vehicle_gps_logs" as any)
      .select("id, vehicle_id, lat, lng, speed, heading, ignition, recorded_at")
      .eq("vehicle_id", vehicleId)
      .order("recorded_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .returns<RawGps | null>(),
    null,
    "getLatestGps",
  );
  if (!row) return null;
  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    lat: row.lat ? Number(row.lat) : null,
    lng: row.lng ? Number(row.lng) : null,
    speed: row.speed ? Number(row.speed) : null,
    heading: row.heading ? Number(row.heading) : null,
    ignition: row.ignition,
    recordedAt: row.recorded_at,
  };
}

export async function listLatestGpsForAll(): Promise<Map<string, VehicleGpsRow>> {
  const supabase = createClient();
  const rows = unwrap(
    await supabase
      .from("vehicle_gps_logs" as any)
      .select("id, vehicle_id, lat, lng, speed, heading, ignition, recorded_at")
      .order("recorded_at", { ascending: false })
      .limit(1000)
      .returns<RawGps[]>(),
    [] as RawGps[],
    "listLatestGpsForAll",
  );
  const map = new Map<string, VehicleGpsRow>();
  for (const r of rows) {
    if (!map.has(r.vehicle_id)) {
      map.set(r.vehicle_id, {
        id: r.id,
        vehicleId: r.vehicle_id,
        lat: r.lat ? Number(r.lat) : null,
        lng: r.lng ? Number(r.lng) : null,
        speed: r.speed ? Number(r.speed) : null,
        heading: r.heading ? Number(r.heading) : null,
        ignition: r.ignition,
        recordedAt: r.recorded_at,
      });
    }
  }
  return map;
}

export async function listGpsHistory(
  vehicleId: string,
  from?: string,
  to?: string,
  limit = 500,
): Promise<VehicleGpsRow[]> {
  const supabase = createClient();
  let q = supabase
    .from("vehicle_gps_logs" as any)
    .select("id, vehicle_id, lat, lng, speed, heading, ignition, recorded_at")
    .eq("vehicle_id", vehicleId)
    .order("recorded_at", { ascending: false })
    .limit(limit);
  if (from) q = q.gte("recorded_at", from);
  if (to) q = q.lte("recorded_at", to);
  const rows = unwrap(
    await q.returns<RawGps[]>(),
    [] as RawGps[],
    "listGpsHistory",
  );
  return rows.map((r) => ({
    id: r.id,
    vehicleId: r.vehicle_id,
    lat: r.lat != null ? Number(r.lat) : null,
    lng: r.lng != null ? Number(r.lng) : null,
    speed: r.speed != null ? Number(r.speed) : null,
    heading: r.heading != null ? Number(r.heading) : null,
    ignition: r.ignition,
    recordedAt: r.recorded_at,
  }));
}

// --------------------------------------------------------------- Trips

export interface TripRow {
  id: string;
  vehicleId: string;
  driverUserId: string | null;
  driverName: string | null;
  routeSessionId: string | null;
  tripDate: string;
  startKm: number | null;
  endKm: number | null;
  notes: string | null;
  startedAt: string | null;
  endedAt: string | null;
  startLat: number | null;
  startLng: number | null;
  endLat: number | null;
  endLng: number | null;
  type: string;
  category: string | null;
  status: string;
  distanceKm: number | null;
  maxSpeed: number | null;
  avgSpeed: number | null;
}

type RawTrip = {
  id: string;
  vehicle_id: string;
  driver_user_id: string | null;
  route_session_id: string | null;
  trip_date: string;
  start_km: number | null;
  end_km: number | null;
  notes: string | null;
  started_at: string | null;
  ended_at: string | null;
  start_lat: number | null;
  start_lng: number | null;
  end_lat: number | null;
  end_lng: number | null;
  type: string;
  category: string | null;
  status: string;
  distance_km: number | null;
  max_speed: number | null;
  avg_speed: number | null;
  driver: { full_name: string } | null;
};

const TRIP_SELECT = `
  id, vehicle_id, driver_user_id, route_session_id,
  trip_date, start_km, end_km, notes,
  started_at, ended_at, start_lat, start_lng, end_lat, end_lng,
  type, category, status, distance_km, max_speed, avg_speed,
  driver:users!trips_driver_user_id_fkey(full_name)
`;

export async function listTrips(vehicleId: string): Promise<TripRow[]> {
  const supabase = createClient();
  const rows = unwrap(
    await supabase
      .from("trips")
      .select(TRIP_SELECT)
      .eq("vehicle_id", vehicleId)
      .order("trip_date", { ascending: false })
      .returns<RawTrip[]>(),
    [] as RawTrip[],
    "listTrips",
  );
  return rows.map((r) => ({
    id: r.id,
    vehicleId: r.vehicle_id,
    driverUserId: r.driver_user_id,
    driverName: r.driver?.full_name ?? null,
    routeSessionId: r.route_session_id,
    tripDate: r.trip_date,
    startKm: r.start_km ? Number(r.start_km) : null,
    endKm: r.end_km ? Number(r.end_km) : null,
    notes: r.notes,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    startLat: r.start_lat ? Number(r.start_lat) : null,
    startLng: r.start_lng ? Number(r.start_lng) : null,
    endLat: r.end_lat ? Number(r.end_lat) : null,
    endLng: r.end_lng ? Number(r.end_lng) : null,
    type: r.type,
    category: r.category,
    status: r.status,
    distanceKm: r.distance_km != null ? Number(r.distance_km) : null,
    maxSpeed: r.max_speed != null ? Number(r.max_speed) : null,
    avgSpeed: r.avg_speed != null ? Number(r.avg_speed) : null,
  }));
}

export async function getTrip(id: string): Promise<TripRow | null> {
  const supabase = createClient();
  const row = unwrap(
    await supabase
      .from("trips")
      .select(TRIP_SELECT)
      .eq("id", id)
      .single()
      .returns<RawTrip | null>(),
    null,
    "getTrip",
  );
  if (!row) return null;
  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    driverUserId: row.driver_user_id,
    driverName: row.driver?.full_name ?? null,
    routeSessionId: row.route_session_id,
    tripDate: row.trip_date,
    startKm: row.start_km ? Number(row.start_km) : null,
    endKm: row.end_km ? Number(row.end_km) : null,
    notes: row.notes,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    startLat: row.start_lat ? Number(row.start_lat) : null,
    startLng: row.start_lng ? Number(row.start_lng) : null,
    endLat: row.end_lat ? Number(row.end_lat) : null,
    endLng: row.end_lng ? Number(row.end_lng) : null,
    type: row.type,
    category: row.category,
    status: row.status,
    distanceKm: row.distance_km != null ? Number(row.distance_km) : null,
    maxSpeed: row.max_speed != null ? Number(row.max_speed) : null,
    avgSpeed: row.avg_speed != null ? Number(row.avg_speed) : null,
  };
}

// ------------------------------------------------------------ Fuel logs

export interface FuelLogRow {
  id: string;
  vehicleId: string;
  tripId: string | null;
  logDate: string;
  litres: number;
  amount: number;
  odometer: number | null;
  createdAt: string;
}

type RawFuelLog = {
  id: string;
  vehicle_id: string;
  trip_id: string | null;
  log_date: string;
  litres: number;
  amount: number;
  odometer: number | null;
  created_at: string;
};

const FUEL_SELECT = "id, vehicle_id, trip_id, log_date, litres, amount, odometer, created_at";

export async function listFuelLogs(vehicleId: string): Promise<FuelLogRow[]> {
  const supabase = createClient();
  const rows = unwrap(
    await supabase
      .from("fuel_logs")
      .select(FUEL_SELECT)
      .eq("vehicle_id", vehicleId)
      .order("log_date", { ascending: false })
      .returns<RawFuelLog[]>(),
    [] as RawFuelLog[],
    "listFuelLogs",
  );
  return rows.map((r) => ({
    id: r.id,
    vehicleId: r.vehicle_id,
    tripId: r.trip_id,
    logDate: r.log_date,
    litres: Number(r.litres),
    amount: Number(r.amount),
    odometer: r.odometer ? Number(r.odometer) : null,
    createdAt: r.created_at,
  }));
}

// ------------------------------------------------------ Running cost

export async function getVehicleRunningCost(
  vehicleId: string,
): Promise<number> {
  const supabase = createClient();
  const { data } = await supabase
    .rpc("vehicle_running_cost", { p_vehicle: vehicleId });
  return Number(data ?? 0);
}
