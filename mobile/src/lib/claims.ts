export interface AppClaims {
  roles: string[];
  perms: string[];
  status: string;
  /** customer_portal.id when the account is a CUSTOMER PORTAL principal
   * (zero internal roles; phone matches an active portal contact — 0091). */
  portalCustomerId: string | null;
}

const EMPTY_CLAIMS: AppClaims = { roles: [], perms: [], status: "", portalCustomerId: null };

/**
 * Parse the custom claims the Custom Access Token Hook (migration 0032)
 * writes into the access TOKEN's app_metadata — NOT the persisted user
 * record. `session.user.app_metadata` only carries stored provider metadata
 * and will miss roles/user_status entirely; always feed this the decoded
 * JWT payload's app_metadata (see parseAccessToken).
 */
export function readClaimsFromMetadata(meta: unknown): AppClaims {
  const m = (meta ?? {}) as Record<string, unknown>;
  return {
    roles: asStringArray(m.roles),
    perms: asStringArray(m.perms),
    status: typeof m.user_status === "string" ? m.user_status : "",
    portalCustomerId:
      typeof m.portal_customer_id === "string" && m.portal_customer_id.length > 0
        ? m.portal_customer_id
        : null,
  };
}

/** A portal principal is an auth account with NO internal roles whose phone
 * matches an active customer_portal contact (the JWT hook stamps
 * portal_customer_id — 0091). Internal staff never get the portal UI. */
export function isPortal(claims: AppClaims): boolean {
  return claims.roles.length === 0 && claims.portalCustomerId != null;
}

/**
 * Decode the app_metadata claims out of a raw JWT access token, WITHOUT
 * verifying the signature — safe for UI-speed gating only; every money/
 * stock mutation is re-checked by SECURITY DEFINER RPCs server-side.
 * Returns EMPTY_CLAIMS on any malformed input.
 */
export function parseAccessToken(accessToken: string | null | undefined): AppClaims {
  if (!accessToken) return { ...EMPTY_CLAIMS };
  const parts = accessToken.split(".");
  if (parts.length < 2) return { ...EMPTY_CLAIMS };
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
    const json = decodeUtf8(atob(b64 + pad));
    const payload = JSON.parse(json) as Record<string, unknown>;
    return readClaimsFromMetadata(payload.app_metadata);
  } catch {
    return { ...EMPTY_CLAIMS };
  }
}

export const GATED_STATUSES = [
  "pending_review",
  "pending_activation",
  "pending",
  "suspended",
  "disabled",
] as const;

export function isGatedStatus(status: string): boolean {
  return (GATED_STATUSES as readonly string[]).includes(status);
}

export function can(claims: AppClaims, perm: string): boolean {
  if (claims.status !== "active") return false;
  if (claims.roles.includes("admin")) return true;
  return claims.perms.includes(perm);
}

export function roleLabel(claims: AppClaims): string {
  if (claims.roles.includes("agent")) return "Field agent";
  if (claims.roles.includes("operator")) return "Plant operator";
  if (claims.roles.includes("admin") || claims.roles.includes("manager")) return "Manager";
  if (isPortal(claims)) return "Customer";
  return "Staff";
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function decodeUtf8(binary: string): string {
  try {
    return decodeURIComponent(
      binary
        .split("")
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join(""),
    );
  } catch {
    return binary;
  }
}
