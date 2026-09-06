import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { RpcError, rpc } from "@/lib/rpc";
import type { Tables } from "@/lib/db-types";
import { qk } from "./keys";

export interface RouteRow {
  id: string;
  name: string;
  isDefault: boolean;
  storeCount: number;
}

export interface RouteStoreRow {
  id: string; name: string; code: string | null; area: string | null;
  phone: string | null; lat: number | null; lng: number | null;
}

export type RouteSession = Tables<"route_sessions">;

export function useRoutes() {
  const { user } = useSession();
  return useQuery({
    queryKey: qk.routes(),
    enabled: !!user?.id,
    queryFn: async (): Promise<RouteRow[]> => {
      const { data, error } = await supabase
        .from("routes")
        .select("id, name, is_default, status, stores:customer_stores(count)")
        .eq("status", "active")
        .order("name");
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        name: r.name,
        isDefault: !!r.is_default,
        storeCount: r.stores?.[0]?.count ?? 0,
      }));
    },
  });
}

export function useRouteStores(routeId: string) {
  const { user } = useSession();
  return useQuery({
    queryKey: qk.routeStores(routeId),
    enabled: !!user?.id && !!routeId,
    queryFn: async (): Promise<RouteStoreRow[]> => {
      const { data, error } = await supabase
        .from("customer_stores")
        .select("id, name, code, area, phone, lat, lng")
        .eq("route_id", routeId)
        .eq("status", "active")
        .order("name");
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id, name: r.name, code: r.code, area: r.area,
        phone: r.phone, lat: r.lat, lng: r.lng,
      }));
    },
  });
}

export function useActiveSession() {
  const { user } = useSession();
  return useQuery({
    queryKey: qk.activeSession(),
    enabled: !!user?.id,
    queryFn: async (): Promise<RouteSession | null> => {
      const { data, error } = await supabase
        .from("route_sessions")
        .select("*")
        .eq("agent_id", user!.id)
        .eq("status", "active")
        .maybeSingle();
      if (error) throw error;
      return (data as RouteSession) ?? null;
    },
  });
}

export function useVisitedToday(sessionId: string) {
  const { user } = useSession();
  return useQuery({
    queryKey: qk.visited(sessionId),
    enabled: !!user?.id && !!sessionId,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("visits")
        .select("customer_store_id")
        .eq("route_session_id", sessionId);
      if (error) throw error;
      return (data ?? []).map((r: any) => r.customer_store_id as string);
    },
  });
}

async function requireUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) throw new RpcError("You must be signed in");
  return uid;
}

export async function startSession(routeId: string, storeCount?: number): Promise<RouteSession> {
  const uid = await requireUserId();
  let planned = storeCount;
  if (planned == null) {
    const { count, error } = await supabase
      .from("customer_stores")
      .select("id", { count: "exact", head: true })
      .eq("route_id", routeId)
      .eq("status", "active");
    if (error) throw new RpcError(error.message, error.code);
    planned = count ?? 0;
  }
  const { data, error } = await supabase
    .from("route_sessions")
    .insert({
      route_id: routeId,
      agent_id: uid,
      status: "active",
      started_at: new Date().toISOString(),
      stores_planned: planned,
      stores_completed: 0,
    })
    .select("*")
    .single();
  if (error) throw new RpcError(error.message, error.code);
  return data as RouteSession;
}

export async function endSession(sessionId: string, storesCompleted: number = 0): Promise<void> {
  const uid = await requireUserId();
  const { error } = await supabase
    .from("route_sessions")
    .update({ status: "completed", ended_at: new Date().toISOString(), stores_completed: storesCompleted })
    .eq("id", sessionId)
    .eq("agent_id", uid);
  if (error) throw new RpcError(error.message, error.code);
}

export async function recordVisit(
  storeId: string,
  lat?: number | null,
  lng?: number | null,
  visitType: string = "mark_visited",
): Promise<string> {
  return rpc<string>("record_visit", {
    p_store_id: storeId,
    p_lat: lat ?? null,
    p_lng: lng ?? null,
    p_visit_type: visitType,
    p_duration_min: 5,
  });
}
