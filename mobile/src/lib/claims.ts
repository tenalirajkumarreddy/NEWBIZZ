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
  const status = typeof meta.user_status === "string" ? meta.user_status : "active";
  return { roles, perms, status };
}

export function can(claims: AppClaims, perm: string): boolean {
  if (claims.roles.includes("admin")) return true;
  return claims.perms.includes(perm);
}
