// =====================================================================
// lib/auth/claims.ts — the shape of the custom claims and how to read them.
//
// The Custom Access Token Hook (migration 0032) injects these into every JWT's
// app_metadata on mint/refresh. They are a CACHE for UI-speed gating and cheap
// RLS reads ONLY — never the security boundary. Every money/stock mutation still
// goes through a SECURITY DEFINER RPC that re-checks has_permission() against
// live tables (Invariant 3), so a stale claim can only make the UI briefly
// optimistic; the DB still refuses.
// =====================================================================
import type { User } from "@supabase/supabase-js";

export type UserStatus =
  | "active"
  | "suspended"
  | "pending_review"
  | "pending_activation"
  | "disabled"
  | "unknown";

/** Claims the token hook writes under app_metadata. */
export interface AppClaims {
  roles: string[];
  perms: string[];
  branch_id: string | null;
  user_status: UserStatus;
  token_version: number;
  is_admin: boolean;
  /** UUID of the customer this principal maps to in the portal, else null. */
  portal_customer_id: string | null;
}

const EMPTY_CLAIMS: AppClaims = {
  roles: [],
  perms: [],
  branch_id: null,
  user_status: "unknown",
  token_version: 0,
  is_admin: false,
  portal_customer_id: null,
};

/**
 * Pull the app claims out of a Supabase user's app_metadata, defensively —
 * an unknown/legacy token (hook not yet enabled, or minted before 0032) yields
 * safe empties (no perms, unknown status) rather than throwing.
 */
export function readClaims(user: User | null | undefined): AppClaims {
  if (!user) return { ...EMPTY_CLAIMS };
  return readClaimsFromMetadata(user.app_metadata);
}

/**
 * Parse an app_metadata object into AppClaims. This is the shared parser used by
 * both the (legacy) user-object path and the JWT path.
 *
 * IMPORTANT: the Custom Access Token Hook (0032) writes these claims into the
 * access TOKEN's app_metadata, NOT the persisted user record. So the live values
 * come from the decoded JWT (getClaims / access_token payload) — reading
 * user.app_metadata from getUser() returns only the stored provider metadata and
 * will miss roles/user_status entirely. Always feed this the JWT's app_metadata.
 */
export function readClaimsFromMetadata(meta: unknown): AppClaims {
  const m = (meta ?? {}) as Record<string, unknown>;
  return {
    roles: asStringArray(m.roles),
    perms: asStringArray(m.perms),
    branch_id: typeof m.branch_id === "string" ? m.branch_id : null,
    user_status: asStatus(m.user_status),
    token_version: typeof m.token_version === "number" ? m.token_version : 0,
    is_admin: m.is_admin === true,
    portal_customer_id: typeof m.portal_customer_id === "string" ? m.portal_customer_id : null,
  };
}

/**
 * Decode the app_metadata claims out of a raw JWT access token, WITHOUT
 * verifying the signature. Safe for UI-speed gating only — the DB (RLS + RPC
 * has_permission()) is the real boundary. Runtime-agnostic (Edge + Node): uses
 * atob, never Buffer. Returns EMPTY_CLAIMS on any malformed input.
 */
export function readClaimsFromAccessToken(accessToken: string | null | undefined): AppClaims {
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

/** UI-speed permission check. Admin implies everything (mirrors has_permission()). */
export function can(claims: AppClaims, permission: string): boolean {
  if (claims.user_status !== "active") return false;
  if (claims.is_admin) return true;
  return claims.perms.includes(permission);
}

/** True when the user may actually use the app (as opposed to a holding state). */
export function isActive(claims: AppClaims): boolean {
  return claims.user_status === "active";
}

/** True when the caller is a portal principal (has a portal customer mapping). */
export function isPortalPrincipal(claims: AppClaims): boolean {
  return typeof claims.portal_customer_id === "string" && claims.portal_customer_id.length > 0;
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function asStatus(v: unknown): UserStatus {
  const allowed: UserStatus[] = [
    "active",
    "suspended",
    "pending_review",
    "pending_activation",
    "disabled",
    "unknown",
  ];
  return typeof v === "string" && (allowed as string[]).includes(v)
    ? (v as UserStatus)
    : "unknown";
}
