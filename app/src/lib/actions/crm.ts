"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";



export type CrmResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

function fail(label: string, msg: string | undefined): { ok: false; error: string } {
  const m = (msg ?? "").trim() || "Something went wrong. Please try again.";
  console.error(`[action:${label}]`, msg);
  return { ok: false, error: m };
}

// ── Leads ──

export interface CreateLeadInput {
  name: string;
  company?: string;
  phone?: string;
  email?: string;
  source?: string;
  assignedTo?: string;
  notes?: string;
  followUpDate?: string;
}

export async function createLead(
  input: CreateLeadInput,
): Promise<CrmResult<{ leadId: string }>> {
  if (!input.name?.trim()) return { ok: false, error: "Lead name is required." };

  const supabase = createClient();
  const { data, error } = await supabase
    .from("leads")
    .insert({
      name: input.name.trim(),
      company: input.company?.trim() || null,
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      source: input.source?.trim() || null,
      assigned_to: input.assignedTo || null,
      notes: input.notes?.trim() || null,
      follow_up_date: input.followUpDate || null,
    })
    .select("id")
    .single();

  if (error || !data) return fail("createLead", error?.message);
  revalidatePath("/crm");
  return { ok: true, leadId: data.id };
}

export interface UpdateLeadInput {
  name?: string;
  company?: string;
  phone?: string;
  email?: string;
  source?: string;
  assignedTo?: string | null;
  status?: Database["public"]["Enums"]["lead_status"];
  notes?: string;
  followUpDate?: string | null;
}

export async function updateLead(
  id: string,
  input: UpdateLeadInput,
): Promise<CrmResult> {
  if (!id) return { ok: false, error: "Missing lead id." };

  const supabase = createClient();
  const patch: Database["public"]["Tables"]["leads"]["Update"] = {};
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.company !== undefined) patch.company = input.company?.trim() || null;
  if (input.phone !== undefined) patch.phone = input.phone?.trim() || null;
  if (input.email !== undefined) patch.email = input.email?.trim() || null;
  if (input.source !== undefined) patch.source = input.source?.trim() || null;
  if (input.assignedTo !== undefined) patch.assigned_to = input.assignedTo;
  if (input.status !== undefined) patch.status = input.status;
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null;
  if (input.followUpDate !== undefined) patch.follow_up_date = input.followUpDate;

  const { error } = await supabase.from("leads").update(patch).eq("id", id);
  if (error) return fail("updateLead", error.message);
  revalidatePath("/crm");
  return { ok: true };
}

export interface ConvertLeadInput {
  leadId: string;
  customerName?: string;
  gstin?: string;
  pan?: string;
  phone?: string;
  email?: string;
  stateCode?: string;
  creditLimit?: number;
  creditDays?: number;
  storeName?: string;
  storeKind?: Database["public"]["Enums"]["customer_kind"];
  storeContactName?: string;
  storePhone?: string;
  storeAddressLine?: string;
  storeArea?: string;
  storeCity?: string;
  storePincode?: string;
  storeStateCode?: string;
  storeRouteId?: string;
}

export async function convertLead(
  input: ConvertLeadInput,
): Promise<CrmResult<{ customerId: string }>> {
  if (!input.leadId) return { ok: false, error: "Missing lead id." };

  const supabase = createClient();

  const p_customer: Record<string, unknown> = {};
  if (input.customerName) p_customer.name = input.customerName;
  if (input.gstin) p_customer.gstin = input.gstin;
  if (input.pan) p_customer.pan = input.pan;
  if (input.phone) p_customer.phone = input.phone;
  if (input.email) p_customer.email = input.email;
  if (input.stateCode) p_customer.state_code = input.stateCode;
  if (input.creditLimit !== undefined) p_customer.credit_limit = input.creditLimit;
  if (input.creditDays !== undefined) p_customer.credit_days = input.creditDays;

  const p_store: Record<string, unknown> = {};
  if (input.storeName) p_store.name = input.storeName;
  if (input.storeKind) p_store.kind = input.storeKind;
  if (input.storeContactName) p_store.contact_name = input.storeContactName;
  if (input.storePhone) p_store.phone = input.storePhone;
  if (input.storeAddressLine) p_store.address_line = input.storeAddressLine;
  if (input.storeArea) p_store.area = input.storeArea;
  if (input.storeCity) p_store.city = input.storeCity;
  if (input.storePincode) p_store.pincode = input.storePincode;
  if (input.storeStateCode) p_store.state_code = input.storeStateCode;
  if (input.storeRouteId) p_store.route_id = input.storeRouteId;

  const { data, error } = await supabase.rpc("convert_lead", {
    p_lead: input.leadId,
    p_customer: Object.keys(p_customer).length > 0 ? p_customer as never : undefined,
    p_store: Object.keys(p_store).length > 0 ? p_store as never : undefined,
  });

  if (error) return fail("convertLead", error.message);
  revalidatePath("/crm");
  revalidatePath("/customers");
  return { ok: true, customerId: data as string };
}

// ── Interactions ──

export interface LogInteractionInput {
  customerStoreId?: string;
  leadId?: string;
  type: Database["public"]["Enums"]["interaction_type"];
  note?: string;
}

export async function logInteraction(
  input: LogInteractionInput,
): Promise<CrmResult<{ interactionId: string }>> {
  if (!input.customerStoreId && !input.leadId) {
    return { ok: false, error: "Must link to a store or a lead." };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("interactions")
    .insert({
      customer_store_id: input.customerStoreId || null,
      lead_id: input.leadId || null,
      type: input.type,
      note: input.note?.trim() || null,
    })
    .select("id")
    .single();

  if (error || !data) return fail("logInteraction", error?.message);
  revalidatePath("/crm");
  if (input.customerStoreId) revalidatePath(`/crm/stores/${input.customerStoreId}`);
  return { ok: true, interactionId: data.id };
}

// ── Complaints ──

export interface CreateComplaintInput {
  customerStoreId: string;
  note?: string;
}

export async function createComplaint(
  input: CreateComplaintInput,
): Promise<CrmResult<{ complaintId: string }>> {
  if (!input.customerStoreId) return { ok: false, error: "Missing store." };

  const supabase = createClient();
  const { data, error } = await supabase
    .from("complaints")
    .insert({
      customer_store_id: input.customerStoreId,
      note: input.note?.trim() || null,
    })
    .select("id")
    .single();

  if (error || !data) return fail("createComplaint", error?.message);
  revalidatePath("/crm");
  return { ok: true, complaintId: data.id };
}

export interface UpdateComplaintInput {
  status?: Database["public"]["Enums"]["complaint_status"];
  resolution?: Database["public"]["Enums"]["complaint_resolution"];
  note?: string;
}

export async function updateComplaint(
  id: string,
  input: UpdateComplaintInput,
): Promise<CrmResult> {
  if (!id) return { ok: false, error: "Missing complaint id." };

  const supabase = createClient();
  const patch: Database["public"]["Tables"]["complaints"]["Update"] = {};
  if (input.status !== undefined) patch.status = input.status;
  if (input.resolution !== undefined) patch.resolution = input.resolution;
  if (input.note !== undefined) patch.note = input.note?.trim() || null;
  if (input.status === "resolved" || input.status === "rejected") {
    patch.resolved_at = new Date().toISOString();
  }

  const { error } = await supabase.from("complaints").update(patch).eq("id", id);
  if (error) return fail("updateComplaint", error.message);
  revalidatePath("/crm");
  return { ok: true };
}

// ── Campaigns ──

export interface CreateCampaignInput {
  name: string;
  message?: string;
  channel: Database["public"]["Enums"]["campaign_channel"];
  audienceJson?: Record<string, string>;
  scheduleAt?: string;
}

export async function createCampaign(
  input: CreateCampaignInput,
): Promise<CrmResult<{ campaignId: string }>> {
  if (!input.name?.trim()) return { ok: false, error: "Campaign name is required." };

  const supabase = createClient();
  const { data, error } = await supabase
    .from("campaigns")
    .insert({
      name: input.name.trim(),
      message: input.message?.trim() || null,
      channel: input.channel,
      audience_json: input.audienceJson ?? {},
      schedule_at: input.scheduleAt || null,
    })
    .select("id")
    .single();

  if (error || !data) return fail("createCampaign", error?.message);
  revalidatePath("/crm/campaigns");
  return { ok: true, campaignId: data.id };
}

export interface UpdateCampaignInput {
  name?: string;
  message?: string;
  channel?: Database["public"]["Enums"]["campaign_channel"];
  audienceJson?: Record<string, string>;
  scheduleAt?: string | null;
  status?: Database["public"]["Enums"]["campaign_status"];
}

export async function updateCampaign(
  id: string,
  input: UpdateCampaignInput,
): Promise<CrmResult> {
  if (!id) return { ok: false, error: "Missing campaign id." };

  const supabase = createClient();
  const patch: Database["public"]["Tables"]["campaigns"]["Update"] = {};
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.message !== undefined) patch.message = input.message?.trim() || null;
  if (input.channel !== undefined) patch.channel = input.channel;
  if (input.audienceJson !== undefined) patch.audience_json = input.audienceJson;
  if (input.scheduleAt !== undefined) patch.schedule_at = input.scheduleAt;
  if (input.status !== undefined) patch.status = input.status;

  const { error } = await supabase.from("campaigns").update(patch).eq("id", id);
  if (error) return fail("updateCampaign", error.message);
  revalidatePath("/crm/campaigns");
  return { ok: true };
}
