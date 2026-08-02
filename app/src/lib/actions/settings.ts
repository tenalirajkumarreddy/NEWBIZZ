"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

// =====================================================================
// Fleet thresholds
// =====================================================================

export async function updateFleetThresholds(thresholds: Record<string, number>): Promise<ActionResult> {
  const supabase = createClient();
  const { data: existing } = await (supabase as any)
    .from("company_settings")
    .select("id, feature_flags")
    .limit(1)
    .maybeSingle();

  if (!existing) return { ok: false, error: "Company settings not found." };
  const merged = { ...(existing.feature_flags ?? {}), ...thresholds };
  const { error } = await (supabase as any)
    .from("company_settings")
    .update({ feature_flags: merged })
    .eq("id", existing.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/settings");
  return { ok: true };
}

// =====================================================================
// Company profile
// =====================================================================

export async function updateCompany(data: {
  legalName: string;
  tradeName?: string;
  primaryGstin?: string;
  pan?: string;
  stateCode?: string;
  address?: string;
  fssaiNo?: string;
  bisNo?: string;
  invoiceFooter?: string;
  baseCurrency?: string;
}): Promise<ActionResult> {
  const supabase = createClient();
  const patch: Record<string, any> = {
    legal_name: data.legalName,
    trade_name: data.tradeName ?? null,
    primary_gstin: data.primaryGstin ?? null,
    pan: data.pan ?? null,
    state_code: data.stateCode ?? "33",
    address: data.address ?? null,
    fssai_no: data.fssaiNo ?? null,
    bis_no: data.bisNo ?? null,
    invoice_footer: data.invoiceFooter ?? null,
    base_currency: data.baseCurrency ?? "INR",
  };
  const { data: existing } = await (supabase as any)
    .from("company_settings")
    .select("id")
    .limit(1)
    .maybeSingle();

  let error: any;
  if (existing) {
    ({ error } = await (supabase as any).from("company_settings").update(patch).eq("id", existing.id));
  } else {
    ({ error } = await (supabase as any).from("company_settings").insert(patch));
  }
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/settings");
  return { ok: true };
}

// =====================================================================
// Financial Years
// =====================================================================

export async function createFinancialYear(data: {
  code: string;
  startDate: string;
  endDate: string;
}): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await (supabase as any)
    .from("financial_years")
 .insert({ code: data.code, start_date: data.startDate, end_date: data.endDate, status: "open" });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/settings");
  return { ok: true };
}

export async function closeFinancialYear(id: string): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await (supabase as any)
    .from("financial_years")
    .update({ status: "closed" })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/settings");
  return { ok: true };
}

// =====================================================================
// Number Series
// =====================================================================

export async function updateNumberSeries(id: string, data: {
  prefix?: string;
  nextVal?: number;
  padWidth?: number;
}): Promise<ActionResult> {
  const supabase = createClient();
  const patch: Record<string, any> = {};
  if (data.prefix !== undefined) patch.prefix = data.prefix;
  if (data.nextVal !== undefined) patch.next_val = data.nextVal;
  if (data.padWidth !== undefined) patch.pad_width = data.padWidth;
  const { error } = await (supabase as any).from("number_series").update(patch).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/settings");
  return { ok: true };
}

// =====================================================================
// Branches
// =====================================================================

export async function createBranch(data: {
  code: string;
  name: string;
  gstin?: string;
  stateCode?: string;
  isPlant?: boolean;
  isWarehouse?: boolean;
  address?: string;
}): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await (supabase as any).from("branches").insert({
    code: data.code,
    name: data.name,
    gstin: data.gstin ?? null,
    state_code: data.stateCode ?? "33",
    is_plant: data.isPlant ?? false,
    is_warehouse: data.isWarehouse ?? true,
    address: data.address ?? null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/settings");
  return { ok: true };
}

export async function updateBranch(id: string, data: {
  name?: string;
  gstin?: string;
  stateCode?: string;
  isPlant?: boolean;
  isWarehouse?: boolean;
  address?: string;
  status?: string;
}): Promise<ActionResult> {
  const supabase = createClient();
  const patch: Record<string, any> = {};
  if (data.name !== undefined) patch.name = data.name;
  if (data.gstin !== undefined) patch.gstin = data.gstin;
  if (data.stateCode !== undefined) patch.state_code = data.stateCode;
  if (data.isPlant !== undefined) patch.is_plant = data.isPlant;
  if (data.isWarehouse !== undefined) patch.is_warehouse = data.isWarehouse;
  if (data.address !== undefined) patch.address = data.address;
  if (data.status !== undefined) patch.status = data.status;
  const { error } = await (supabase as any).from("branches").update(patch).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/settings");
  return { ok: true };
}

// =====================================================================
// Payment Methods
// =====================================================================

export async function createPaymentMethod(data: {
  code: string;
  name: string;
  destination: string;
  sortOrder?: number;
}): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await (supabase as any).from("payment_methods").insert({
    code: data.code,
    name: data.name,
    destination: data.destination,
    sort_order: data.sortOrder ?? 0,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/settings");
  return { ok: true };
}

export async function updatePaymentMethod(id: string, data: {
  name?: string;
  destination?: string;
  isActive?: boolean;
}): Promise<ActionResult> {
  const supabase = createClient();
  const patch: Record<string, any> = {};
  if (data.name !== undefined) patch.name = data.name;
  if (data.destination !== undefined) patch.destination = data.destination;
  if (data.isActive !== undefined) patch.is_active = data.isActive;
  const { error } = await (supabase as any).from("payment_methods").update(patch).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/settings");
  return { ok: true };
}
