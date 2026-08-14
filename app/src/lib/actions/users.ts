"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { toE164Digits } from "@/lib/auth/phone";
import { listRoles, type RoleRow } from "@/lib/data/users";

function revalidateUserPaths(userId?: string) {
  revalidatePath("/admin/users");
  if (userId) revalidatePath(`/admin/users/${userId}`);
}

export async function inviteUser(data: {
  phone: string;
  fullName: string;
  roleCodes: string[];
  branchId?: string;
  email?: string;
}) {
  const supabase = createClient();
  // Stage in canonical E.164 WITHOUT '+' (matches auth.users.phone and the
  // handle_new_auth_user exact-equality join). See lib/auth/phone.ts.
  const { error } = await supabase.rpc("admin_create_user", {
    p_phone: toE164Digits(data.phone),
    p_full_name: data.fullName,
    p_role_codes: data.roleCodes,
    p_branch_id: data.branchId,
    p_email: data.email,
  });
  if (error) throw new Error(error.message);
  revalidateUserPaths();
}

export async function revokeInvitation(invitationId: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc("admin_revoke_invitation", {
    p_invitation_id: invitationId,
  });
  if (error) throw new Error(error.message);
  revalidateUserPaths();
}

export async function setUserStatus(userId: string, status: string, reason?: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc("admin_set_user_status", {
    p_user: userId,
    p_status: status,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
  revalidateUserPaths(userId);
}

/** Approve a self-registered user stuck in `pending_review` (activates them). */
export async function approveUser(userId: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc("admin_set_user_status", {
    p_user: userId,
    p_status: "active",
  });
  if (error) throw new Error(error.message);
  revalidateUserPaths(userId);
}

export async function assignRole(userId: string, roleCode: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc("assign_role", {
    p_user: userId,
    p_role_code: roleCode,
  });
  if (error) throw new Error(error.message);
  revalidateUserPaths(userId);
}

export async function unassignRole(userId: string, roleCode: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc("unassign_role", {
    p_user: userId,
    p_role_code: roleCode,
  });
  if (error) throw new Error(error.message);
  revalidateUserPaths(userId);
}

/**
 * Single-role invariant (app layer): drop every role the user currently holds,
 * then assign the new one. The DB still allows multiple roles; this keeps the
 * "one role per user" model the redesign ships.
 */
export async function setUserRole(userId: string, roleCode: string) {
  const roles: RoleRow[] = await listRoles();
  const current = await getUserRoleCodes(userId);
  const supabase = createClient();
  for (const code of current) {
    if (code === roleCode) continue;
    const { error } = await supabase.rpc("unassign_role", {
      p_user: userId,
      p_role_code: code,
    });
    if (error) throw new Error(error.message);
  }
  if (!current.includes(roleCode)) {
    const valid = roles.some((r) => r.code === roleCode);
    if (!valid) throw new Error(`Unknown role code: ${roleCode}`);
    const { error } = await supabase.rpc("assign_role", {
      p_user: userId,
      p_role_code: roleCode,
    });
    if (error) throw new Error(error.message);
  }
  revalidateUserPaths(userId);
}

async function getUserRoleCodes(userId: string): Promise<string[]> {
  const supabase = createClient();
  const res = await supabase
    .from("users")
    .select("user_roles(role:roles(code))")
    .eq("id", userId)
    .maybeSingle();
  const rows = res.data as { user_roles: { role: { code: string } }[] } | null;
  if (!rows) return [];
  return (rows.user_roles ?? []).map((ur) => ur.role.code);
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
  revalidateUserPaths(userId);
}

export async function revokePermission(userId: string, code: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc("revoke_user_permission", {
    p_user: userId,
    p_code: code,
  });
  if (error) throw new Error(error.message);
  revalidateUserPaths(userId);
}

// ---- role management (admin only, via SECURITY DEFINER RPCs) ----

/** Create a role, or upsert (rename) one when the code already exists. */
export async function createRoleAction(code: string, name: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc("admin_create_role", {
    p_code: code,
    p_name: name,
  });
  if (error) throw new Error(error.message);
  revalidateUserPaths();
}

export async function renameRoleAction(code: string, name: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc("admin_create_role", {
    p_code: code,
    p_name: name,
  });
  if (error) throw new Error(error.message);
  revalidateUserPaths();
}

/** Set a role's permission scope: 'all' (granted) or 'none' (revoked). */
export async function setRolePermissionAction(
  roleCode: string,
  code: string,
  scope: "all" | "none",
) {
  const supabase = createClient();
  const { error } = await supabase.rpc("set_role_permission", {
    p_role_code: roleCode,
    p_code: code,
    p_scope: scope,
  });
  if (error) throw new Error(error.message);
  revalidateUserPaths();
}

export async function getUserOverridesAction(userId: string) {
  const { listUserOverrides } = await import("@/lib/data/users");
  return listUserOverrides(userId);
}
