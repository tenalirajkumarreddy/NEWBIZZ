// =====================================================================
// lib/data/routes.ts — server-only readers for Routes, Sessions & Visits (§7.1).
// =====================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrap } from "./types";

// ------------------------------------------------------------ Routes

export interface RouteRow {
  id: string;
  name: string;
  isDefault: boolean;
  status: string;
  storeCount: number;
  createdBy: string | null;
  createdAt: string;
}

type RawRoute = {
  id: string;
  name: string;
  is_default: boolean;
  status: string;
  store_count: number;
  created_by: string | null;
  created_at: string;
  creator: { full_name: string } | null;
};

const ROUTE_SELECT = `
  id, name, is_default, status,
  created_by, created_at,
  creator:users!routes_created_by_fkey(full_name),
  store_count:customer_stores(count)
`;

export async function listRoutes(): Promise<RouteRow[]> {
  const supabase = createClient();
  const rows = unwrap(
    await supabase
      .from("routes")
      .select(ROUTE_SELECT)
      .order("name")
      .returns<RawRoute[]>(),
    [] as RawRoute[],
    "listRoutes",
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    isDefault: r.is_default,
    status: r.status,
    storeCount: Number(r.store_count),
    createdBy: r.creator?.full_name ?? null,
    createdAt: r.created_at,
  }));
}

export async function getRoute(id: string): Promise<RouteRow | null> {
  const supabase = createClient();
  const row = unwrap(
    await supabase
      .from("routes")
      .select(ROUTE_SELECT)
      .eq("id", id)
      .single()
      .returns<RawRoute | null>(),
    null,
    "getRoute",
  );
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    isDefault: row.is_default,
    status: row.status,
    storeCount: Number(row.store_count),
    createdBy: row.creator?.full_name ?? null,
    createdAt: row.created_at,
  };
}

// ------------------------------------------------------ Route Sessions

export interface RouteSessionRow {
  id: string;
  routeId: string;
  routeName: string;
  agentId: string;
  agentName: string;
  status: string;
  startedAt: string | null;
  pausedAt: string | null;
  resumedAt: string | null;
  endedAt: string | null;
  storesPlanned: number;
  storesCompleted: number;
  totalDistanceKm: number;
  totalDurationMin: number;
  createdAt: string;
}

type RawSession = {
  id: string;
  route_id: string;
  agent_id: string;
  status: string;
  started_at: string | null;
  paused_at: string | null;
  resumed_at: string | null;
  ended_at: string | null;
  stores_planned: number;
  stores_completed: number;
  total_distance_km: number;
  total_duration_min: number;
  created_at: string;
  route: { name: string } | null;
  agent: { full_name: string } | null;
};

const SESSION_SELECT = `
  id, route_id, agent_id, status,
  started_at, paused_at, resumed_at, ended_at,
  stores_planned, stores_completed, total_distance_km, total_duration_min,
  created_at,
  route:routes!route_sessions_route_id_fkey(name),
  agent:users!route_sessions_agent_id_fkey(full_name)
`;

export async function listSessions(routeId?: string): Promise<RouteSessionRow[]> {
  const supabase = createClient();
  let q = supabase
    .from("route_sessions")
    .select(SESSION_SELECT)
    .order("created_at", { ascending: false });
  if (routeId) q = q.eq("route_id", routeId);
  const rows = unwrap(
    await q.returns<RawSession[]>(),
    [] as RawSession[],
    "listSessions",
  );
  return rows.map((r) => ({
    id: r.id,
    routeId: r.route_id,
    routeName: r.route?.name ?? "—",
    agentId: r.agent_id,
    agentName: r.agent?.full_name ?? "—",
    status: r.status,
    startedAt: r.started_at,
    pausedAt: r.paused_at,
    resumedAt: r.resumed_at,
    endedAt: r.ended_at,
    storesPlanned: r.stores_planned,
    storesCompleted: r.stores_completed,
    totalDistanceKm: Number(r.total_distance_km),
    totalDurationMin: r.total_duration_min,
    createdAt: r.created_at,
  }));
}

export async function getSession(id: string): Promise<RouteSessionRow | null> {
  const supabase = createClient();
  const row = unwrap(
    await supabase
      .from("route_sessions")
      .select(SESSION_SELECT)
      .eq("id", id)
      .single()
      .returns<RawSession | null>(),
    null,
    "getSession",
  );
  if (!row) return null;
  return {
    id: row.id,
    routeId: row.route_id,
    routeName: row.route?.name ?? "—",
    agentId: row.agent_id,
    agentName: row.agent?.full_name ?? "—",
    status: row.status,
    startedAt: row.started_at,
    pausedAt: row.paused_at,
    resumedAt: row.resumed_at,
    endedAt: row.ended_at,
    storesPlanned: row.stores_planned,
    storesCompleted: row.stores_completed,
    totalDistanceKm: Number(row.total_distance_km),
    totalDurationMin: row.total_duration_min,
    createdAt: row.created_at,
  };
}

// ------------------------------------------------------------ Visits

export interface VisitRow {
  id: string;
  sessionId: string;
  storeId: string;
  storeName: string;
  agentId: string;
  agentName: string;
  visitedAt: string;
  visitType: string;
  noBusinessReason: string | null;
  noBusinessNote: string | null;
  lat: number | null;
  lng: number | null;
  durationMin: number;
}

type RawVisit = {
  id: string;
  route_session_id: string;
  customer_store_id: string;
  agent_id: string;
  visited_at: string;
  visit_type: string;
  no_business_reason: string | null;
  no_business_note: string | null;
  lat: number | null;
  lng: number | null;
  duration_min: number;
  store: { name: string } | null;
  agent: { full_name: string } | null;
};

const VISIT_SELECT = `
  id, route_session_id, customer_store_id, agent_id,
  visited_at, visit_type, no_business_reason, no_business_note,
  lat, lng, duration_min,
  store:customer_stores!visits_customer_store_id_fkey(name),
  agent:users!visits_agent_id_fkey(full_name)
`;

export async function listVisits(sessionId: string): Promise<VisitRow[]> {
  const supabase = createClient();
  const rows = unwrap(
    await supabase
      .from("visits")
      .select(VISIT_SELECT)
      .eq("route_session_id", sessionId)
      .order("visited_at")
      .returns<RawVisit[]>(),
    [] as RawVisit[],
    "listVisits",
  );
  return rows.map((r) => ({
    id: r.id,
    sessionId: r.route_session_id,
    storeId: r.customer_store_id,
    storeName: r.store?.name ?? "—",
    agentId: r.agent_id,
    agentName: r.agent?.full_name ?? "—",
    visitedAt: r.visited_at,
    visitType: r.visit_type,
    noBusinessReason: r.no_business_reason,
    noBusinessNote: r.no_business_note,
    lat: r.lat ? Number(r.lat) : null,
    lng: r.lng ? Number(r.lng) : null,
    durationMin: r.duration_min,
  }));
}

// --------------------------------------------------- Store assignments

export interface RouteStoreRow {
  id: string;
  storeId: string;
  storeName: string;
  storeCode: string | null;
  customerName: string;
  assignedAt: string;
}

type RawRouteStore = {
  id: string;
  customer_store_id: string;
  assigned_at: string;
  unassigned_at?: string | null;
  store: {
    name: string;
    code: string | null;
    customer: { display_name: string } | null;
  } | null;
};

export async function listRouteStores(routeId: string): Promise<RouteStoreRow[]> {
  const supabase = createClient();
  const rows = unwrap(
    await supabase
      .from("customer_store_routes")
      .select(`
        id, customer_store_id, assigned_at,
        store:customer_stores!customer_store_routes_customer_store_id_fkey(
          name, code,
          customer:customers!customer_stores_customer_id_fkey(display_name)
        )
      `)
      .eq("route_id", routeId)
      .is("unassigned_at", null)
      .order("assigned_at")
      .returns<RawRouteStore[]>(),
    [] as RawRouteStore[],
    "listRouteStores",
  );
  return rows.map((r) => ({
    id: r.id,
    storeId: r.customer_store_id,
    storeName: r.store?.name ?? "—",
    storeCode: r.store?.code ?? null,
    customerName: r.store?.customer?.display_name ?? "—",
    assignedAt: r.assigned_at,
  }));
}

// --------------------------------------------------- Assignment history

export interface RouteStoreHistoryRow {
  id: string;
  storeId: string;
  storeName: string;
  assignedAt: string;
  unassignedAt: string | null;
}

export async function listRouteStoreHistory(
  routeId: string,
): Promise<RouteStoreHistoryRow[]> {
  const supabase = createClient();
  const rows = unwrap(
    await supabase
      .from("customer_store_routes")
      .select(`
        id, customer_store_id, assigned_at, unassigned_at,
        store:customer_stores!customer_store_routes_customer_store_id_fkey(name)
      `)
      .eq("route_id", routeId)
      .order("assigned_at", { ascending: false })
      .returns<RawRouteStore[]>(),
    [] as RawRouteStore[],
    "listRouteStoreHistory",
  );
  return rows.map((r) => ({
    id: r.id,
    storeId: r.customer_store_id,
    storeName: r.store?.name ?? "—",
    assignedAt: r.assigned_at,
    unassignedAt: r.unassigned_at ?? null,
  }));
}

// --------------------------------------------------- Lookup helpers

export async function listFieldUsers() {
  const supabase = createClient();
  const rows = unwrap(
    await supabase
      .from("users")
      .select("id, full_name")
      .order("full_name"),
    [] as { id: string; full_name: string }[],
    "listFieldUsers",
  );
  return rows;
}

export async function listStoresForRoute(routeId?: string) {
  const supabase = createClient();
  let q = supabase
    .from("customer_stores")
    .select("id, name, code, route_id");
  if (routeId) q = q.eq("route_id", routeId);
  else q = q.is("route_id", null);
  const rows = unwrap(
    await q.order("name").returns<{ id: string; name: string; code: string | null; route_id: string | null }[]>(),
    [],
    "listStoresForRoute",
  );
  return rows;
}
