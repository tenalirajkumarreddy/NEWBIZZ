// =====================================================================
// app/api/print-share/route.ts — mint a tokenized print share URL.
//
// GET /api/print-share?kind=invoice&id=<uuid>
//   → { url: "/print/invoice/<uuid>?t=<token>" }
//
// Callers:
//   • Web UI (cookie session) — same getSession() path as pages.
//   • APK (Authorization: Bearer <supabase access token>) — the in-app
//     browser has no cookie jar, so the mobile DocumentCard sends the
//     Supabase JWT directly.
//
// /api/* is self-guarded (middleware skips the session gate here), so this
// handler authenticates both ways itself and then checks the document's view
// permission. The token it mints is bound to one document and expires.
// =====================================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getSession } from "@/lib/auth/session";
import { can, isActive, readClaimsFromAccessToken, type AppClaims } from "@/lib/auth/claims";
import { printShareHref, type TokenKind } from "@/lib/print-token";

const KINDS: Record<string, { perm: string; seg: TokenKind }> = {
  invoice: { perm: "invoice.view", seg: "invoice" },
  challan: { perm: "challan.view", seg: "challan" },
  "credit-note": { perm: "creditnote.view", seg: "credit-note" },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveClaims(req: NextRequest): Promise<AppClaims | null> {
  // 1. Bearer token (APK): revalidate it with the Auth server — never trust
  //    the JWT's own signature claims without the round-trip.
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    const accessToken = auth.slice(7).trim();
    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${accessToken}` } } },
    );
    const { data } = await supabase.auth.getUser(accessToken);
    if (!data.user) return null;
    return readClaimsFromAccessToken(accessToken);
  }
  // 2. Cookie session (web UI).
  const session = await getSession();
  return session?.claims ?? null;
}

export async function GET(req: NextRequest) {
  const claims = await resolveClaims(req);
  if (!claims) {
    return NextResponse.json({ error: "Sign in to share a document." }, { status: 401 });
  }
  if (!isActive(claims)) {
    return NextResponse.json({ error: "Account not active." }, { status: 403 });
  }

  const kind = req.nextUrl.searchParams.get("kind") ?? "";
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const cfg = KINDS[kind];
  if (!cfg) {
    return NextResponse.json({ error: "Unknown document kind." }, { status: 400 });
  }
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Bad document id." }, { status: 400 });
  }
  if (!can(claims, cfg.perm)) {
    return NextResponse.json({ error: "Not allowed to share this document." }, { status: 403 });
  }

  const sign = req.nextUrl.searchParams.get("sign") ?? undefined;
  const url = printShareHref(cfg.seg, id, sign === "0" ? { sign: "0" } : {});
  return NextResponse.json({ url });
}
