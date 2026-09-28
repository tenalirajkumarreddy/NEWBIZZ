// =====================================================================
// lib/print-token.ts — signed short-lived tokens for print share URLs.
//
// WHY: the APK's "Open full document" opens the web print route in a browser
// that has NO web session — the route redirects to /login and nobody can
// print from the phone. The recorded follow-up (challan-lifecycle spec §3/§4)
// is a tokenized URL: /print/{kind}/{id}?t=<token> authorizes exactly one
// document view for a short window, no login required.
//
// FORMAT: base64url(payload) + "." + base64url(hmacSha256(payload, secret))
//   payload = { k: kind, d: docId, e: expiryEpochSeconds, s: signParam }
//   - `s` carries the ?sign=0 wish so the share URL round-trips the
//     without-signature choice without extra query parsing.
//   - Kind/id/secret never touch the URL in plaintext beyond the encoded
//     payload (they're already in the path anyway).
//
// SECRET: PRINT_SHARE_SECRET env. Falls back to hashing the Supabase URL +
// anon key so local/dev works with zero setup; production should set a real
// high-entropy secret (rotating it revokes all outstanding share links).
//
// No DB table — stateless verification, revocation = secret rotation or
// expiry. Tokens grant READ of one print sheet only; they never authenticate
// any other route or API (the print routes check the token, everything else
// keeps session auth).
// =====================================================================

import { createHmac, timingSafeEqual } from "crypto";

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days — long enough to share on WhatsApp, short enough to rotate away leaks

export type TokenKind = "invoice" | "challan" | "credit-note";

interface TokenPayload {
  k: TokenKind;
  d: string; // document uuid
  e: number; // expiry, epoch seconds
  s?: string; // forwarded print params ("0" = without signature)
}

function secret(): string {
  const explicit = process.env.PRINT_SHARE_SECRET;
  if (explicit) return explicit;
  // Dev fallback: deterministic per-deployment secret from values already in
  // the env. Not high-entropy — production should set PRINT_SHARE_SECRET.
  const su = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "local";
  const sk = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "local";
  return createHmac("sha256", "nb-print-share-v1").update(`${su}|${sk}`).digest("hex");
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function sign(payloadStr: string): string {
  return b64url(createHmac("sha256", secret()).update(payloadStr).digest());
}

/** Mint a share token for one document. `expiresInSeconds` overrides the TTL
 * (shorter links for one-off shares; rotation invalidates everything). */
export function mintPrintToken(
  kind: TokenKind,
  docId: string,
  opts: { sign?: string; expiresInSeconds?: number } = {},
): string {
  const payload: TokenPayload = {
    k: kind,
    d: docId,
    e: Math.floor(Date.now() / 1000) + (opts.expiresInSeconds ?? TOKEN_TTL_SECONDS),
    ...(opts.sign != null && opts.sign !== "" ? { s: opts.sign } : {}),
  };
  const payloadStr = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  return `${payloadStr}.${sign(payloadStr)}`;
}

export interface VerifiedPrintToken {
  kind: TokenKind;
  docId: string;
  /** Forwarded print param (e.g. "0" for the without-signature sheet). */
  sign?: string;
}

/** Verify a token against a route's kind+id. Returns null on ANY mismatch —
 * tampered payload, wrong document, wrong kind, expired, bad signature. */
export function verifyPrintToken(
  token: string | undefined | null,
  kind: TokenKind,
  docId: string,
): VerifiedPrintToken | null {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const payloadStr = token.slice(0, dot);
  const mac = token.slice(dot + 1);

  let expected: Buffer;
  let actual: Buffer;
  try {
    expected = Buffer.from(sign(payloadStr), "base64url");
    actual = Buffer.from(mac, "base64url");
  } catch {
    return null;
  }
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  let payload: TokenPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadStr, "base64url").toString("utf8")) as TokenPayload;
  } catch {
    return null;
  }
  if (payload.k !== kind || payload.d !== docId) return null; // bound to THIS document
  if (typeof payload.e !== "number" || payload.e * 1000 <= Date.now()) return null;

  return { kind: payload.k, docId: payload.d, sign: payload.s };
}

/** Full share URL for a tokenized print sheet (relative; prefix the origin when sharing off-device). */
export function printShareHref(kind: TokenKind, docId: string, opts: { sign?: string; expiresInSeconds?: number } = {}): string {
  const t = mintPrintToken(kind, docId, opts);
  const params = new URLSearchParams({ t });
  if (opts.sign != null && opts.sign !== "") params.set("sign", opts.sign);
  return `/print/${kind}/${docId}?${params.toString()}`;
}
