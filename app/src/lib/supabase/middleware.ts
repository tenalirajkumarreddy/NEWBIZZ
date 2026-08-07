// =====================================================================
// lib/supabase/middleware.ts — session refresh + route gate for middleware.
//
// Runs on every matched request. It (1) refreshes the Supabase session so the
// access token (and its claims) stay fresh, and (2) applies coarse route
// protection based on the cached claims:
//
//   - not signed in            -> /login (except public routes)
//   - signed in, not 'active'  -> /pending  (holding screen; can log in, do nothing)
//   - signed in + active       -> allowed through
//
// This is UX-level gating only. The authoritative checks live in the DB (RLS +
// has_permission() inside every RPC). A user who forges past this still cannot
// mutate anything — the DB refuses.
// =====================================================================
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  readClaimsFromAccessToken,
  isActive,
  isPortalPrincipal,
  type AppClaims,
} from "@/lib/auth/claims";
import type { Database } from "./database.types";

// Shape of a single cookie the ssr client asks us to persist.
type CookieToSet = { name: string; value: string; options: CookieOptions };

// Routes reachable without an active session.
const PUBLIC_PREFIXES = ["/login", "/auth"];
const HOLDING_ROUTE = "/pending";

// Portal surface. Reachable signed-out (login) and by signed-in portal principals
// only; internal users are bounced away. `/portal` itself and `/portal/login` are
// the entry points shown before auth.
const PORTAL_PREFIX = "/portal";

// API routes are self-guarded at the handler (CRON_SECRET for the cron/poller
// routes, Meta signature for the WhatsApp webhook) and are invoked WITHOUT a
// browser session cookie (external schedulers, Meta's servers). The session
// gate below would otherwise redirect them to /login and they'd never run.
const API_PREFIX = "/api";

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function isPortal(pathname: string): boolean {
  return pathname === PORTAL_PREFIX || pathname.startsWith(PORTAL_PREFIX + "/");
}

function isSelfGuardedApi(pathname: string): boolean {
  return pathname === API_PREFIX || pathname.startsWith(API_PREFIX + "/");
}

// Pick where a signed-in principal lands. Internal (active) users go to the main
// app; portal principals go to the portal.
function homeFor(claims: AppClaims): string {
  return isPortalPrincipal(claims) ? PORTAL_PREFIX : "/";
}

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: getUser() (not getSession()) — it revalidates the token with the
  // Auth server and triggers a refresh, keeping claims current.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Claims come from the JWT (where the Custom Access Token Hook injects them),
  // NOT user.app_metadata (which getUser() returns from the stored record and
  // does not carry the hook's roles/user_status). Read the verified session's
  // access token after getUser() has refreshed it.
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const { pathname } = request.nextUrl;
  const claims = readClaimsFromAccessToken(session?.access_token);

  // Self-guarded API routes (CRON_SECRET / Meta webhook signature) always pass
  // through to their handler — they are invoked without a browser session and
  // authenticate in-handler. Skip the whole session gate for them.
  if (isSelfGuardedApi(pathname)) return response;

  // Signed out: force to /login for anything non-public. Portal surface is
  // public (renders its own login), so a signed-out visitor may see it.
  if (!user) {
    if (isPublic(pathname) || isPortal(pathname)) return response;
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // A portal principal must never enter the internal app, and an internal user
  // must never open the portal. Both get redirected to their own home.
  if (isPortalPrincipal(claims)) {
    if (!isPortal(pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = PORTAL_PREFIX;
      url.search = "";
      return NextResponse.redirect(url);
    }
    return response;
  }

  // Not a portal principal.
  if (isPortal(pathname)) {
    // Signed-in internal user on the portal surface: send to the main app.
    const url = request.nextUrl.clone();
    url.pathname = isActive(claims) ? "/" : HOLDING_ROUTE;
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Signed in but already on an internal auth page: bounce to the right home.
  if (isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = isActive(claims) ? "/" : HOLDING_ROUTE;
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Signed in but not active (suspended / pending_review / disabled): holding screen.
  if (!isActive(claims) && pathname !== HOLDING_ROUTE) {
    const url = request.nextUrl.clone();
    url.pathname = HOLDING_ROUTE;
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Active user who somehow lands on the holding screen: send home.
  if (isActive(claims) && pathname === HOLDING_ROUTE) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return response;
}
