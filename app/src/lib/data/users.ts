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
  branchName: string | null;
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

export interface InvitationRow {
  id: string;
  phone: string;
  fullName: string;
  email: string | null;
  roleCodes: string[];
  createdAt: string;
  expiresAt: string;
}

type RawUser = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  status: string;
  created_at: string;
  branch: { name: string } | null;
  user_roles: { role: { code: string; name: string } }[];
};

function mapUser(r: RawUser): UserRow {
  return {
    id: r.id,
    fullName: r.full_name,
    phone: r.phone,
    email: r.email,
    status: r.status,
    roles: r.user_roles.map((ur) => ({ code: ur.role.code, name: ur.role.name })),
    branchName: r.branch?.name ?? null,
    createdAt: r.created_at,
  };
}

const USER_SELECT =
  "id, full_name, phone, email, status, created_at, branch:branches(name), " +
  "user_roles(role:roles(code, name))";

export async function listUsers(): Promise<UserRow[]> {
  const supabase = createClient();
  const res = await supabase
    .from("users")
    .select(USER_SELECT)
    .order("created_at", { ascending: false })
    .returns<RawUser[]>();

  const rows = unwrap(res, [] as RawUser[], "users:listUsers");
  return rows.map(mapUser);
}

/** A single user for the profile page, or null when the id doesn't resolve. */
export async function getUser(id: string): Promise<UserRow | null> {
  const supabase = createClient();
  const res = await supabase
    .from("users")
    .select(USER_SELECT)
    .eq("id", id)
    .maybeSingle()
    .returns<RawUser | null>();

  const row = unwrap(res, null as RawUser | null, "users:getUser");
  return row ? mapUser(row) : null;
}

/** The signed-in user's own profile row, or null. Thin wrapper over getUser. */
export async function getMyProfile(userId: string): Promise<UserRow | null> {
  return getUser(userId);
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

type RawInvitation = {
  id: string;
  phone: string;
  full_name: string;
  email: string | null;
  role_codes: string[];
  created_at: string;
  expires_at: string;
};

// Invites that are still awaiting their first login (status='pending').
export async function listInvitations(): Promise<InvitationRow[]> {
  const supabase = createClient();
  const res = await supabase
    .from("user_invitations")
    .select("id, phone, full_name, email, role_codes, created_at, expires_at")
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  const rows = unwrap(res, [] as RawInvitation[], "users:listInvitations");
  return rows.map((r) => ({
    id: r.id,
    phone: r.phone,
    fullName: r.full_name,
    email: r.email,
    roleCodes: r.role_codes ?? [],
    createdAt: r.created_at,
    expiresAt: r.expires_at,
  }));
}
