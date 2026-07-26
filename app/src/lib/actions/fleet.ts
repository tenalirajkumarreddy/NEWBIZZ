"use server";

// =====================================================================
// lib/actions/fleet.ts — Server Actions for Vehicles & Fleet (§7.2).
// =====================================================================

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getFleetThresholds } from "@/lib/data/settings";

export type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export type PollResult =
  | { ok: true; inserted: number; tripsStarted: number; tripsEnded: number; refillsDetected: number; leaksDetected: number }
  | { ok: false; error: string };

// ------------------------------------------------------- Vehicle CRUD

export interface UpsertVehicleInput {
  id?: string;
  regNo: string;
  type?: string;
  capacity?: string;
  ownedOrHired?: string;
  status?: string;
}

export async function upsertVehicle(
  input: UpsertVehicleInput,
): Promise<ActionResult<{ vehicleId: string }>> {
  if (!input.regNo?.trim()) return { ok: false, error: "Registration number is required." };
  const supabase = createClient();
  const q = supabase.from("vehicles") as any;
  const data: Record<string, unknown> = { reg_no: input.regNo.trim().toUpperCase() };
  if (input.type) data.type = input.type;
  if (input.capacity) data.capacity = input.capacity;
  if (input.ownedOrHired) data.owned_or_hired = input.ownedOrHired;
  if (input.status) data.status = input.status;

  const { data: row, error } = input.id
    ? await q.update(data).eq("id", input.id).select("id").single()
    : await q.insert(data).select("id").single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/fleet");
  return { ok: true, vehicleId: row.id };
}

export async function deleteVehicle(id: string): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await (supabase.from("vehicles") as any).delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/fleet");
  return { ok: true };
}

// ------------------------------------------------------------- Trips

export interface CreateTripInput {
  vehicleId: string;
  driverUserId?: string;
  routeSessionId?: string;
  tripDate: string;
  startKm?: number;
  notes?: string;
}

export async function createTrip(
  input: CreateTripInput,
): Promise<ActionResult<{ tripId: string }>> {
  if (!input.vehicleId) return { ok: false, error: "Vehicle is required." };
  if (!input.tripDate) return { ok: false, error: "Trip date is required." };
  const supabase = createClient();
  const { data, error } = await (supabase.from("trips") as any)
    .insert({
      vehicle_id: input.vehicleId,
      driver_user_id: input.driverUserId ?? null,
      route_session_id: input.routeSessionId ?? null,
      trip_date: input.tripDate,
      start_km: input.startKm ?? null,
      notes: input.notes ?? null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/fleet/${input.vehicleId}`);
  revalidatePath("/fleet");
  return { ok: true, tripId: data.id };
}

export async function updateTripEndKm(
  tripId: string,
  endKm: number,
): Promise<ActionResult> {
  if (endKm == null) return { ok: false, error: "End KM is required." };
  const supabase = createClient();
  const { error } = await (supabase.from("trips") as any)
    .update({ end_km: endKm })
    .eq("id", tripId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/fleet");
  return { ok: true };
}

export async function deleteTrip(id: string): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await (supabase.from("trips") as any).delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/fleet");
  return { ok: true };
}

// ----------------------------------------------------------- Fuel logs

export interface PostFuelInput {
  vehicleId: string;
  litres: number;
  amount: number;
  logDate?: string;
  tripId?: string;
  odometer?: number;
  payFrom?: "cash" | "bank";
}

export async function postFuelLog(
  input: PostFuelInput,
): Promise<ActionResult<{ fuelLogId: string }>> {
  if (!input.vehicleId) return { ok: false, error: "Vehicle is required." };
  if (!input.litres || input.litres <= 0) return { ok: false, error: "Litres must be > 0." };
  if (!input.amount || input.amount <= 0) return { ok: false, error: "Amount must be > 0." };

  const supabase = createClient();
  const { data, error } = await supabase.rpc("post_fuel_log", {
    p_header: {
      vehicle_id: input.vehicleId,
      litres: input.litres,
      amount: input.amount,
      log_date: input.logDate,
      trip_id: input.tripId,
      odometer: input.odometer,
      pay_from: input.payFrom ?? "cash",
    } as never,
  });
  if (error) {
    console.error("[action:postFuelLog]", error.message);
    return { ok: false, error: error.message || "Fuel log could not be posted." };
  }
  revalidatePath(`/fleet/${input.vehicleId}`);
  revalidatePath("/fleet");
  return { ok: true, fuelLogId: data as string };
}

// ---------------------------------------------------- Intangles Sync

export type SyncResult = ActionResult<{ created: number }>;

export async function syncVehiclesFromIntangles(): Promise<SyncResult> {
  const token = process.env.INTANGLES_USER_TOKEN;
  const accountId = process.env.INTANGLES_ACCOUNT_ID;
  if (!token || !accountId) {
    return { ok: false, error: "Intangles not configured (INTANGLES_USER_TOKEN / INTANGLES_ACCOUNT_ID)." };
  }

  const res = await fetch(
    `https://apis.intangles.com/vehicle/getlist?psize=200&lastloc=false&acc_id=${accountId}&lang=en`,
    { headers: { "intangles-user-token": token } },
  );
  if (!res.ok) return { ok: false, error: `Intangles API ${res.status}` };
  const body = await res.json();
  if (body.status?.code !== 200) {
    return { ok: false, error: `Intangles API error: ${JSON.stringify(body.status)}` };
  }
  const vehicles: { plate?: string; tag?: string }[] = body.v ?? [];

  const supabase = createClient();
  const errors: string[] = [];
  let created = 0;
  for (const v of vehicles) {
    const regNo = v.plate ?? v.tag;
    if (!regNo) continue;

    const { data: existing } = await (supabase.from("vehicles") as any)
      .select("id")
      .eq("reg_no", regNo)
      .maybeSingle();
    if (existing) continue;

    const { error } = await (supabase.from("vehicles") as any)
      .insert({ reg_no: regNo.toUpperCase(), type: null, capacity: null, owned_or_hired: "owned", status: "active" });
    if (error) {
      console.error("[syncVehiclesFromIntangles] insert failed for %s: %s", regNo, error.message);
      errors.push(`${regNo}: ${error.message}`);
    } else {
      created++;
    }
  }

  revalidatePath("/fleet");
  if (errors.length > 0) {
    return { ok: false, error: `Created ${created}, errors: ${errors.join("; ")}` };
  }
  return { ok: true, created };
}

// -------------------------------------------------------- Intangles Poll

// ---------------------------------------------------- Live Intangles Data

export interface IntanglesVehicleLive {
  plate: string;
  tag?: string;
  status: string;
  last_state: {
    loc: { lat: number; lng: number };
    sp: number;
    hd: number;
    exb: number;
    timestamp: number;
  };
  fuel: { amount: number; percentage: number; last_update: number };
  odom: { vehicle_odo_km: number; vehicle_odo_km_timestamp: number };
  ad_blue: { lvl: number; per: number; t: number };
  connection_status: { status: boolean; info_string: string };
  is_fuel_level_low: boolean;
  is_ad_blue_level_low: boolean;
}

export async function getIntanglesLiveData(): Promise<
  ActionResult<{ vehicles: IntanglesVehicleLive[] }>
> {
  const token = process.env.INTANGLES_USER_TOKEN;
  const accountId = process.env.INTANGLES_ACCOUNT_ID;
  if (!token || !accountId) {
    return { ok: false, error: "Intangles not configured." };
  }

  try {
    const res = await fetch(
      `https://apis.intangles.com/vehicle/getlist?psize=200&lastloc=true&acc_id=${accountId}&lang=en`,
      { headers: { "intangles-user-token": token }, next: { revalidate: 30 } },
    );
    if (!res.ok) return { ok: false, error: `Intangles API ${res.status}` };
    const body = await res.json();
    if (body.status?.code !== 200) {
      return { ok: false, error: `Intangles API error: ${JSON.stringify(body.status)}` };
    }
    return { ok: true, vehicles: body.v as IntanglesVehicleLive[] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    return { ok: false, error: msg };
  }
}

export async function triggerIntanglesPoll(): Promise<PollResult> {
  const { runIntanglesPoll } = await import("@/lib/intangles/poller");
  const result = await runIntanglesPoll();
  if (result.ok) revalidatePath("/fleet");
  return result;
}

// ---------------------------------------------------- Fuel Refill Events

export async function confirmFuelRefill(
  eventId: string,
  vehicleId: string,
  adminAmount: number,
  adminLitres: number,
): Promise<ActionResult<{ fuelLogId: string }>> {
  const supabase = createClient();

  const evtApi = (supabase as any).from("fuel_refill_events");

  const { data: event } = await evtApi
    .select("*")
    .eq("id", eventId)
    .single();

  if (!event) return { ok: false, error: "Event not found." };

  const thresholds = await getFleetThresholds();
  const fraudTolerance = thresholds.fraudTolerancePct / 100;
  const estimatedLitres = Math.abs(Number((event as any).delta_litres));

  if (estimatedLitres === 0) {
    return { ok: false, error: "Estimated litres is 0; cannot confirm this event." };
  }

  const deviation = adminLitres > 0 ? Math.abs(adminLitres - estimatedLitres) / estimatedLitres : 0;
  const fraudAlert = deviation > fraudTolerance;

  if (!adminAmount || adminAmount <= 0) {
    return { ok: false, error: "Paid amount (₹) is required and must be greater than 0." };
  }

  const fuelResult = await postFuelLog({
    vehicleId,
    litres: adminLitres,
    amount: adminAmount,
    logDate: new Date((event as any).detected_at).toISOString().split("T")[0],
  });

  if (!fuelResult.ok) return fuelResult;

  await evtApi.update({
      status: "confirmed",
      fuel_log_id: fuelResult.fuelLogId,
      admin_amount: adminAmount,
      admin_litres: adminLitres,
      fraud_alert: fraudAlert,
    })
    .eq("id", eventId);

  revalidatePath(`/fleet/${vehicleId}`);
  revalidatePath("/fleet");
  return { ok: true, fuelLogId: fuelResult.fuelLogId };
}

export async function dismissFuelRefill(eventId: string): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await supabase
    .from("fuel_refill_events" as any)
    .update({ status: "dismissed" })
    .eq("id", eventId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/fleet");
  return { ok: true };
}
