// =====================================================================
// lib/format.ts — INR money, quantity, date/time formatting.
//
// House rules (match the DB + Nine Invariants):
//   * Money is numeric(14,2); quantity is numeric(14,3).
//   * Amounts are INR, shown in the Indian grouping system (1,84,200.00).
//   * Timestamps are stored UTC; business display is Asia/Kolkata (IST, Inv 9).
// All numeric output is meant to render in JetBrains Mono (`.tnum`).
// =====================================================================

const INR = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const INR_WHOLE = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** "1,84,200.00" — Indian digit grouping, always 2 decimals. No symbol. */
export function money(value: number | string | null | undefined): string {
  const n = toNum(value);
  if (n === null) return "—";
  return INR.format(n);
}

/** "₹1,84,200.00" — money with the rupee sign. Prefer the <Money> component in
 *  JSX; this string form is for places that can't render an element (titles,
 *  aria labels, plain-text exports). */
export function rupees(value: number | string | null | undefined): string {
  const n = toNum(value);
  if (n === null) return "—";
  return "₹" + INR.format(n);
}

/** Digits only for the <Money> component: "1,84,200.00", or null for no value. */
export function moneyDigits(value: number | string | null | undefined): string | null {
  const n = toNum(value);
  if (n === null) return null;
  return INR.format(n);
}

/** Compact digits only (no symbol) for <Money compact>: "1.84L", "6.43Cr", "9,900". */
export function moneyCompactDigits(value: number | string | null | undefined): string | null {
  const n = toNum(value);
  if (n === null) return null;
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e7) return `${sign}${trim(abs / 1e7)}Cr`;
  if (abs >= 1e5) return `${sign}${trim(abs / 1e5)}L`;
  return `${sign}${INR_WHOLE.format(abs)}`;
}

/**
 * Compact rupee display for dense metric cards: ₹1.84L, ₹6.43Cr, ₹9,900.
 * Uses the Indian lakh/crore scale, not K/M/B.
 */
export function rupeesCompact(value: number | string | null | undefined): string {
  const n = toNum(value);
  if (n === null) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e7) return `${sign}₹${trim(abs / 1e7)}Cr`;
  if (abs >= 1e5) return `${sign}₹${trim(abs / 1e5)}L`;
  if (abs >= 1e3) return `${sign}₹${INR_WHOLE.format(abs)}`;
  return `${sign}₹${INR_WHOLE.format(abs)}`;
}

/** Quantity with up to 3 decimals, trailing zeros trimmed: "12", "12.5", "12.125". */
export function qty(value: number | string | null | undefined): string {
  const n = toNum(value);
  if (n === null) return "—";
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(n);
}

/** Whole-number count with grouping: "1,284". */
export function count(value: number | string | null | undefined): string {
  const n = toNum(value);
  if (n === null) return "—";
  return INR_WHOLE.format(n);
}

/** Percentage from a ratio or already-scaled number. `alreadyPct` when the value is 12 (not 0.12). */
export function percent(
  value: number | string | null | undefined,
  { alreadyPct = false, decimals = 1 }: { alreadyPct?: boolean; decimals?: number } = {},
): string {
  const n = toNum(value);
  if (n === null) return "—";
  const p = alreadyPct ? n : n * 100;
  return `${p.toFixed(decimals)}%`;
}

const IST = "Asia/Kolkata";

/** "19 Jul 2026" in IST. Accepts a Date or an ISO/date string. */
export function dateIST(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

/** "19 Jul 2026, 2:30 PM" in IST. */
export function dateTimeIST(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

/** Turn a snake_case / kebab enum value into Title Case: "part_paid" -> "Part Paid". */
export function titleCase(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---- internals ----

function toNum(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function trim(n: number): string {
  // One decimal, but drop a trailing ".0".
  return n.toFixed(1).replace(/\.0$/, "");
}
