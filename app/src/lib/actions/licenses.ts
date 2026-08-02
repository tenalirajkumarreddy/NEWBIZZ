"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { LicenseType, LicenseStatus } from "@/lib/data/licenses";

export type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

// =====================================================================
// Licences
// =====================================================================

export async function createLicense(data: {
  type: LicenseType;
  licenseNo: string;
  expiryDate: string;
  issuedDate?: string | null;
  issuingAuthority?: string | null;
  renewalReminderDays?: number;
  notes?: string | null;
  documentUrl?: string | null;
  status?: LicenseStatus;
}): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await (supabase as any).from("licenses").insert({
    type: data.type,
    license_no: data.licenseNo,
    expiry_date: data.expiryDate,
    issued_date: data.issuedDate ?? null,
    issuing_authority: data.issuingAuthority ?? null,
    renewal_reminder_days: data.renewalReminderDays ?? 60,
    notes: data.notes ?? null,
    document_url: data.documentUrl ?? null,
    status: data.status ?? "active",
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/licenses");
  return { ok: true };
}

export async function updateLicense(
  id: string,
  data: {
    type?: LicenseType;
    licenseNo?: string;
    expiryDate?: string;
    issuedDate?: string | null;
    issuingAuthority?: string | null;
    renewalReminderDays?: number;
    notes?: string | null;
    documentUrl?: string | null;
    status?: LicenseStatus;
  },
): Promise<ActionResult> {
  const supabase = createClient();
  const patch: Record<string, any> = {};
  if (data.type !== undefined) patch.type = data.type;
  if (data.licenseNo !== undefined) patch.license_no = data.licenseNo;
  if (data.expiryDate !== undefined) patch.expiry_date = data.expiryDate;
  if (data.issuedDate !== undefined) patch.issued_date = data.issuedDate;
  if (data.issuingAuthority !== undefined) patch.issuing_authority = data.issuingAuthority;
  if (data.renewalReminderDays !== undefined) patch.renewal_reminder_days = data.renewalReminderDays;
  if (data.notes !== undefined) patch.notes = data.notes;
  if (data.documentUrl !== undefined) patch.document_url = data.documentUrl;
  if (data.status !== undefined) patch.status = data.status;
  const { error } = await (supabase as any).from("licenses").update(patch).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/licenses");
  return { ok: true };
}

export async function deleteLicense(id: string): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await (supabase as any).from("licenses").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/licenses");
  return { ok: true };
}
