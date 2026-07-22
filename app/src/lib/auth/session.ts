// =====================================================================
// lib/auth/session.ts — server-side session + claims accessors for pages.
// =====================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { readClaimsFromAccessToken, type AppClaims } from "@/lib/auth/claims";
import type { User } from "@supabase/supabase-js";

export interface Session {
  user: User;
  claims: AppClaims;
}

/** The current signed-in user + decoded claims, or null. Revalidates the token. */
export async function getSession(): Promise<Session | null> {
  const supabase = createClient();
  // getUser() revalidates the token with the Auth server (secure).
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  // Claims live in the JWT (injected by the Custom Access Token Hook), not the
  // stored user.app_metadata — so decode them from the session access token.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return { user, claims: readClaimsFromAccessToken(session?.access_token) };
}

/**
 * The live token_version from the DB (source of truth). A client compares this
 * to its cached claim; on mismatch it calls refreshSession() to pull fresh
 * claims. Returns null if not signed in or the RPC is unavailable.
 */
export async function getLiveTokenVersion(): Promise<number | null> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_my_token_version");
  if (error || typeof data !== "number") return null;
  return data;
}
