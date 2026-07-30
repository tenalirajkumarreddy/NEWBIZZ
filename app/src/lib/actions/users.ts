"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function inviteUser(data: {
  phone: string;
  fullName: string;
  roleCodes: string[];
  branchId?: string;
  email?: string;
}) {
  const supabase = createClient();
  const { error } = await supabase.rpc("admin_create_user", {
    p_phone: data.phone,
    p_full_name: data.fullName,
    p_role_codes: data.roleCodes,
    p_branch_id: data.branchId,
    p_email: data.email,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/users");
}

export async function setUserStatus(userId: string, status: string, reason?: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc("admin_set_user_status", {
    p_user: userId,
    p_status: status,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/users");
}

export async function assignRole(userId: string, roleCode: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc("assign_role", {
    p_user: userId,
    p_role_code: roleCode,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/users");
}

export async function unassignRole(userId: string, roleCode: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc("unassign_role", {
    p_user: userId,
    p_role_code: roleCode,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/users");
}

export async function grantPermission(
  userId: string,
  code: string,
  effect: "grant" | "deny",
  expiresAt?: string,
  reason?: string
) {
  const supabase = createClient();
  const { error } = await supabase.rpc("grant_user_permission", {
    p_user: userId,
    p_code: code,
    p_effect: effect,
    p_expires_at: expiresAt,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/users");
}

export async function revokePermission(userId: string, code: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc("revoke_user_permission", {
    p_user: userId,
    p_code: code,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/users");
}

export async function getUserOverridesAction(userId: string) {
  const { listUserOverrides } = await import("@/lib/data/users");
  return listUserOverrides(userId);
}
