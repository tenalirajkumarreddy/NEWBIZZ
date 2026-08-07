// =====================================================================
// lib/auth/signOut.ts — shared sign-out that knows principal type.
// Redirects internal users to /login, portal principals to /portal/login.
// =====================================================================

import { createClient } from "@/lib/supabase/server";
import { readClaimsFromAccessToken, isPortalPrincipal } from "@/lib/auth/claims";

/** Sign the user out and return the redirect path for the caller (303). */
export async function signOutAndGetDest(): Promise<string> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const claims = readClaimsFromAccessToken(session?.access_token);
  await supabase.auth.signOut();
  return isPortalPrincipal(claims) ? "/portal/login" : "/login";
}