import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrap } from "@/lib/data/types";

export interface UserRow {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  status: string;
  roles: { code: string; name: string }[];
  createdAt: string;
}

export interface PermissionRow {
  code: string;
  description: string | null;
}

export interface RoleRow {
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: { permission: string; scope: string }[];
}

export interface UserOverride {
  permission: string;
  effect: "grant" | "deny";
  reason: string | null;
  grantedBy: string | null;
  expiresAt: string | null;
  createdAt: string;
}

type RawUser = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  status: string;
  created_at: string;
  user_roles: { role: { code: string; name: string } }[];
};

export async function listUsers(): Promise<UserRow[]> {
  const supabase = createClient();
  const res = await supabase
    .from("users")
    .select("id, full_name, phone, email, status, created_at, user_roles!inner(role:roles(code, name))")
    .order("created_at", { ascending: false });

  const rows = unwrap(res, [] as RawUser[], "users:listUsers");
  return rows.map((r) => ({
    id: r.id,
    fullName: r.full_name,
    phone: r.phone,
    email: r.email,
    status: r.status,
    roles: r.user_roles.map((ur) => ({ code: ur.role.code, name: ur.role.name })),
    createdAt: r.created_at,
  }));
}

export async function listPermissions(): Promise<PermissionRow[]> {
  const supabase = createClient();
  const res = await supabase.from("permissions").select("code, description").order("code");
  return unwrap(res, [] as PermissionRow[], "users:listPermissions");
}

type RawRole = {
  code: string;
  name: string;
  description: string | null;
  is_system: boolean;
  role_permissions: { permission: string; scope: string }[];
};

export async function listRoles(): Promise<RoleRow[]> {
  const supabase = createClient();
  const res = await supabase
    .from("roles")
    .select("code, name, description, is_system, role_permissions(permission, scope)")
    .order("name");

  const rows = unwrap(res, [] as RawRole[], "users:listRoles");
  return rows.map((r) => ({
    code: r.code,
    name: r.name,
    description: r.description,
    isSystem: r.is_system,
    permissions: r.role_permissions,
  }));
}

type RawOverride = {
  permission: string;
  effect: string;
  reason: string | null;
  granted_by: string | null;
  expires_at: string | null;
  created_at: string;
};

export async function listUserOverrides(userId: string): Promise<UserOverride[]> {
  const supabase = createClient();
  const res = await supabase
    .from("user_permission_overrides")
    .select("permission, effect, reason, granted_by, expires_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  const rows = unwrap(res, [] as RawOverride[], "users:listUserOverrides");
  return rows.map((r) => ({
    permission: r.permission,
    effect: r.effect as "grant" | "deny",
    reason: r.reason,
    grantedBy: r.granted_by,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
  }));
}
