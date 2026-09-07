// QR payload parser — extracts a store code from scanned QR content.
// Accepts: "newbizz://s/{code}" scheme URLs, "https://…/s/{code}" links
// (any host, optional query), or bare codes (no whitespace, >= 3 chars).

const SCHEME_RE = /^newbizz:\/\/s\/([^/?#\s]+)$/i;
const HTTPS_RE = /^https:\/\/[^/]+\/s\/([^/?#\s]+)(?:[?#].*)?$/i;
const ANY_URL_RE = /^[a-z][a-z0-9+.-]*:\/\//i;
const MIN_CODE_LEN = 3;

export function parseQrPayload(raw: string): string | null {
  const input = raw.trim();
  if (!input) return null;
  if (/\s/.test(input)) return null;

  const scheme = SCHEME_RE.exec(input);
  if (scheme) return scheme[1];

  const https = HTTPS_RE.exec(input);
  if (https) return https[1];

  if (ANY_URL_RE.test(input)) return null;

  if (input.length >= MIN_CODE_LEN) return input;
  return null;
}
