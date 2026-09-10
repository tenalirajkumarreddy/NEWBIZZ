import * as WebBrowser from "expo-web-browser";
import { supabase } from "../lib/supabase";
import { rpc } from "../lib/rpc";

/**
 * Google OAuth for the APK, matching the web app's conventions:
 * - Sign-in only works for Google emails LINKED to a phone account; a
 *   google-only signup is an orphan (no phone) - we clean it up exactly like
 *   the web auth callback does and tell the user to link from their profile.
 * - Link/Unlink live in the profile screen.
 *
 * Flow: supabase authorize URL -> system browser (Custom Tabs) ->
 * deep link newbizz://auth/callback with tokens in the URL fragment ->
 * setSession (implicit) or exchangeCodeForSession (pkce).
 */
const REDIRECT = "newbizz://auth/callback";

export interface GoogleFlowResult {
  ok: boolean;
  orphan?: boolean;
  error?: string;
}

function paramsFromReturnUrl(url: string): URLSearchParams {
  const hashIndex = url.indexOf("#");
  if (hashIndex >= 0) return new URLSearchParams(url.slice(hashIndex + 1));
  const qIndex = url.indexOf("?");
  if (qIndex >= 0) return new URLSearchParams(url.slice(qIndex + 1));
  return new URLSearchParams();
}

async function consumeOAuthUrl(url: string): Promise<boolean> {
  const params = paramsFromReturnUrl(url);
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  const code = params.get("code");
  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    return !error;
  }
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return !error;
  }
  return false;
}

async function runOAuthFlow(authUrl: string): Promise<boolean> {
  const res = await WebBrowser.openAuthSessionAsync(authUrl, REDIRECT);
  if (res.type !== "success" || !res.url) return false;
  return consumeOAuthUrl(res.url);
}

async function orphanCheckAndCleanup(): Promise<boolean> {
  const { data } = await supabase.auth.getUser();
  if (data?.user && !data.user.phone) {
    await supabase.auth.signOut();
    await rpc("cleanup_orphan_google_user").catch(() => {});
    return true;
  }
  return false;
}

export async function googleSignIn(): Promise<GoogleFlowResult> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: REDIRECT, skipBrowserRedirect: true },
  });
  if (error || !data?.url) return { ok: false, error: error?.message ?? "Could not start Google sign-in" };
  const ok = await runOAuthFlow(data.url);
  if (!ok) return { ok: false, error: "Google sign-in cancelled or failed" };
  if (await orphanCheckAndCleanup()) {
    return { ok: false, orphan: true };
  }
  return { ok: true };
}

export async function googleLink(): Promise<GoogleFlowResult> {
  const { data, error } = await supabase.auth.linkIdentity({
    provider: "google",
    options: { redirectTo: REDIRECT, skipBrowserRedirect: true },
  });
  if (error || !data?.url) return { ok: false, error: error?.message ?? "Could not start Google linking" };
  const ok = await runOAuthFlow(data.url);
  if (!ok) return { ok: false, error: "Google linking cancelled or failed" };
  return { ok: true };
}

export interface GoogleIdentityInfo {
  linked: boolean;
  email: string | null;
  identity: { provider: string; id: string; user_id: string; identity_id: string } | null;
}

export async function googleIdentity(): Promise<GoogleIdentityInfo> {
  const { data, error } = await supabase.auth.getUserIdentities();
  if (error) return { linked: false, email: null, identity: null };
  const g = (data?.identities ?? []).find((i) => i.provider === "google");
  return g
    ? {
        linked: true,
        email: (g.identity_data as any)?.email ?? g.id,
        identity: { provider: g.provider, id: g.id, user_id: g.user_id, identity_id: g.identity_id },
      }
    : { linked: false, email: null, identity: null };
}

export async function googleUnlink(identity: NonNullable<GoogleIdentityInfo["identity"]>): Promise<void> {
  const { error } = await supabase.auth.unlinkIdentity(identity as never);
  if (error) throw error;
}
