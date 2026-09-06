export interface AppClaims {
  roles: string[];
  perms: string[];
  status: string;
}

type ClaimsUser = { app_metadata?: Record<string, unknown> } | null | undefined;

export function parseClaims(user: ClaimsUser): AppClaims {
  const meta = (user?.app_metadata ?? {}) as Record<string, unknown>;
  const roles = Array.isArray(meta.roles) ? (meta.roles as string[]) : [];
  const perms = Array.isArray(meta.perms) ? (meta.perms as string[]) : [];
  const status = typeof meta.user_status === "string" ? meta.user_status : "";
  return { roles, perms, status };
}

export const GATED_STATUSES = ["pending", "suspended", "disabled"] as const;

export function isGatedStatus(status: string): boolean {
  return (GATED_STATUSES as readonly string[]).includes(status);
}

export function can(claims: AppClaims, perm: string): boolean {
  if (claims.roles.includes("admin")) return true;
  return claims.perms.includes(perm);
}
