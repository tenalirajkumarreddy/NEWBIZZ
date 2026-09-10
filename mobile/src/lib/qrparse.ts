// QR payload parser - derives a stable, scanner-safe store code from any
// scanned QR payload.
//
// Convention: shops paste THEIR payment QR (PhonePe / GPay / Paytm / Bharat
// QR) at the counter; the app links such codes to stores. So the parser must
// accept:
//   1. NEWBIZZ codes: "newbizz://s/{code}", "https://host/s/{code}", bare codes
//   2. UPI payment QRs: "upi://pay?pa=vpa@bank&pn=Name&..." -> code = VPA
//   3. Bharat-QR JSON: {"v":"1","pa":"vpa@bank","pn":"Name",...} -> code = VPA
//   4. Any other URL / arbitrary text (spaced legacy codes included) ->
//      whitespace folded to '-' when the result is code-shaped, else a
//      deterministic QR-<hash> of the raw payload (stable across scans).
//
// The returned code must be stable for the same physical QR (so re-scanning
// a linked QR resolves to the same store) and free of whitespace.

export interface ParsedQr {
  code: string;
  kind: "newbizz" | "upi" | "json" | "url" | "text";
  /** Human hint for the UI (payee name / VPA / host), when available. */
  payee?: string;
}

const SCHEME_RE = /^newbizz:\/\/s\/([^/?#\s]+)$/i;
const HTTPS_RE = /^https:\/\/[^/]+\/s\/([^/?#\s]+)(?:[?#].*)?$/i;
const ANY_URL_RE = /^[a-z][a-z0-9+.-]*:\/\//i;
const UPI_VPA_RE = /[?&]pa=([^&\s]+)/i;
const MIN_CODE_LEN = 3;
const MAX_CODE_LEN = 120;
const CODE_SHAPE_RE = /^[A-Za-z0-9._@-]+$/;

export function parseQrPayload(raw: string): ParsedQr | null {
  const input = raw.trim();
  if (!input) return null;

  // 1. NEWBIZZ-native formats
  const scheme = SCHEME_RE.exec(input);
  if (scheme) return { code: scheme[1], kind: "newbizz" };
  const https = HTTPS_RE.exec(input);
  if (https) return { code: https[1], kind: "newbizz" };

  // 2. UPI payment QRs (upi://pay?pa=...) - the VPA identifies the merchant.
  const vpaMatch = UPI_VPA_RE.exec(input);
  if (vpaMatch) {
    const vpa = safeDecode(vpaMatch[1]).replace(/\s+/g, "");
    if (isCodeShaped(vpa)) {
      const pn = /[?&]pn=([^&\s]+)/i.exec(input);
      return {
        code: vpa,
        kind: "upi",
        payee: pn ? safeDecode(pn[1]) : vpa,
      };
    }
  }

  // 3. Bharat-QR style JSON payloads
  if (input.startsWith("{")) {
    try {
      const j = JSON.parse(input) as Record<string, unknown>;
      const pa = typeof j.pa === "string" ? j.pa.replace(/\s+/g, "") : "";
      if (isCodeShaped(pa)) {
        return {
          code: pa,
          kind: "json",
          payee: typeof j.pn === "string" ? j.pn : pa,
        };
      }
    } catch {
      // fall through to generic handling
    }
  }

  // 4. Generic URL without a VPA -> deterministic hash of the payload.
  if (ANY_URL_RE.test(input)) {
    const host = /^https?:\/\/([^/?#\s]+)/i.exec(input)?.[1] ?? null;
    return { code: hashToCode(input), kind: "url", payee: host ?? undefined };
  }

  // 5. Bare text: whitespace folded to '-' when code-shaped ("NB-STORE 2"),
  //    otherwise hashed (multi-line payloads, vCards, ...).
  const folded = input.replace(/\s+/g, "-");
  if (isCodeShaped(folded)) return { code: folded, kind: "text" };
  return { code: hashToCode(input), kind: "text" };
}

function isCodeShaped(code: string): boolean {
  return code.length >= MIN_CODE_LEN && code.length <= MAX_CODE_LEN && CODE_SHAPE_RE.test(code);
}

function hashToCode(raw: string): string {
  // FNV-1a 64-bit-ish (two 32-bit lanes) -> 12 stable hex chars.
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    h1 = (h1 ^ c) >>> 0;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 = (h2 + c) >>> 0;
    h2 = Math.imul(h2 ^ (h2 >>> 13), 0x85ebca6b) >>> 0;
  }
  return `QR-${(h1 >>> 0).toString(16).padStart(8, "0")}${(h2 >>> 0).toString(16).padStart(4, "0").slice(0, 4)}`;
}

function safeDecode(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}
