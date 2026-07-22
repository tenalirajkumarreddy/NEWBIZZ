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
import { readClaimsFromAccessToken, isActive } from "@/lib/auth/claims";
import type { Database } from "./database.types";

// Shape of a single cookie the ssr client asks us to persist.
type CookieToSet = { name: string; value: string; options: CookieOptions };

// Routes reachable without an active session.
const PUBLIC_PREFIXES = ["/login", "/auth"];
const HOLDING_ROUTE = "/pending";

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
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

  // Signed out: force to /login for anything non-public.
  if (!user) {
    if (isPublic(pathname)) return response;
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Signed in but already on an auth page: bounce to the right home.
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
