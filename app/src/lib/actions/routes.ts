"use server";

// =====================================================================
// lib/actions/routes.ts — Server Actions for Routes & Visits (§7.1).
// =====================================================================

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

// --------------------------------------------------------- Route CRUD

export interface UpsertRouteInput {
  id?: string;
  name: string;
  isDefault?: boolean;
  status?: string;
}

export async function upsertRoute(
  input: UpsertRouteInput,
): Promise<ActionResult<{ routeId: string }>> {
  if (!input.name?.trim()) return { ok: false, error: "Route name is required." };
  const supabase = createClient();
  const q = supabase.from("routes") as any;
  const data: Record<string, unknown> = { name: input.name.trim() };
  if (input.isDefault) data.is_default = true;
  if (input.status) data.status = input.status;

  const { data: row, error } = input.id
    ? await q.update(data).eq("id", input.id).select("id").single()
    : await q.insert(data).select("id").single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/routes");
  return { ok: true, routeId: row.id };
}

export async function deleteRoute(id: string): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await (supabase.from("routes") as any).delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/routes");
  return { ok: true };
}

// ----------------------------------------------------- Session management

export interface CreateSessionInput {
  routeId: string;
  agentId: string;
}

export async function createSession(
  input: CreateSessionInput,
): Promise<ActionResult<{ sessionId: string }>> {
  if (!input.routeId) return { ok: false, error: "Route is required." };
  if (!input.agentId) return { ok: false, error: "Agent is required." };
  const supabase = createClient();
  const { data, error } = await (supabase.from("route_sessions") as any)
    .insert({ route_id: input.routeId, agent_id: input.agentId })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/routes/${input.routeId}`);
  revalidatePath("/routes");
  return { ok: true, sessionId: data.id };
}

export async function updateSessionStatus(
  sessionId: string,
  status: string,
): Promise<ActionResult> {
  const supabase = createClient();
  const now = new Date().toISOString();
  const update: Record<string, string> = { status };
  if (status === "active") update.started_at = now;
  if (status === "paused") update.paused_at = now;
  if (status === "completed") update.ended_at = now;
  const { error } = await (supabase.from("route_sessions") as any).update(update).eq("id", sessionId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/routes");
  return { ok: true };
}

export async function deleteSession(id: string): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await (supabase.from("route_sessions") as any).delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/routes");
  return { ok: true };
}

// -------------------------------------------------------- Visit logging

export interface LogVisitInput {
  routeSessionId: string;
  customerStoreId: string;
  visitType?: string;
  lat?: number | null;
  lng?: number | null;
  durationMin?: number;
  noBusinessReason?: string | null;
  noBusinessNote?: string | null;
}

export async function logVisit(
  input: LogVisitInput,
): Promise<ActionResult<{ visitId: string }>> {
  if (!input.routeSessionId) return { ok: false, error: "Session is required." };
  if (!input.customerStoreId) return { ok: false, error: "Store is required." };

  const supabase = createClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return { ok: false, error: "Not authenticated." };

  const { data, error } = await (supabase.from("visits") as any)
    .insert({
      route_session_id: input.routeSessionId,
      customer_store_id: input.customerStoreId,
      agent_id: user.user.id,
      visit_type: input.visitType ?? "mark_visited",
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      duration_min: input.durationMin ?? 0,
      no_business_reason: input.noBusinessReason ?? null,
      no_business_note: input.noBusinessNote ?? null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/routes/sessions/${input.routeSessionId}`);
  return { ok: true, visitId: data.id };
}

// ---------------------------------------------------- Store assignment

export interface AssignStoreInput {
  routeId: string;
  customerStoreId: string;
}

export async function assignStoreToRoute(input: AssignStoreInput): Promise<ActionResult> {
  if (!input.routeId) return { ok: false, error: "Route is required." };
  if (!input.customerStoreId) return { ok: false, error: "Store is required." };

  const supabase = createClient();
  await (supabase.from("customer_store_routes") as any)
    .update({ unassigned_at: new Date().toISOString() })
    .eq("customer_store_id", input.customerStoreId)
    .is("unassigned_at", null);

  const { error } = await (supabase.from("customer_store_routes") as any)
    .insert({ route_id: input.routeId, customer_store_id: input.customerStoreId })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  await (supabase.from("customer_stores") as any)
    .update({ route_id: input.routeId })
    .eq("id", input.customerStoreId);

  revalidatePath(`/routes/${input.routeId}`);
  revalidatePath("/routes");
  return { ok: true };
}

export async function unassignStoreFromRoute(
  storeRouteId: string,
  storeId: string,
): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await (supabase.from("customer_store_routes") as any)
    .update({ unassigned_at: new Date().toISOString() })
    .eq("id", storeRouteId);
  if (error) return { ok: false, error: error.message };

  await (supabase.from("customer_stores") as any)
    .update({ route_id: null })
    .eq("id", storeId);

  revalidatePath("/routes");
  return { ok: true };
}
