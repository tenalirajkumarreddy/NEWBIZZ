// =====================================================================
// lib/auth/phone.ts — phone-number normalization.
//
// CRITICAL (discovered during 0941 smoke): Supabase Auth stores auth.users.phone
// in E.164 WITHOUT the leading '+' (e.g. "919000000001"). The DB signup trigger
// handle_new_auth_user() matches a pending invitation by exact phone equality —
// so any invitation phone we stage, and any number we pass to signInWithOtp,
// MUST be normalized the same way or the invite is missed and the user is sent
// down the unknown-phone (pending_review) path.
//
// Rule of thumb:
//   * signInWithOtp / verifyOtp  -> E.164 WITH '+'  (Supabase client wants '+')
//   * invitation.phone in the DB -> E.164 WITHOUT '+' (matches auth.users.phone)
// Both derive from the same digits; these helpers keep them consistent.
// =====================================================================

const DEFAULT_CC = process.env.NEXT_PUBLIC_DEFAULT_COUNTRY_CODE ?? "91";

/** Strip everything that is not a digit. */
export function digitsOnly(input: string): string {
  return (input ?? "").replace(/\D+/g, "");
}

/**
 * Turn user input (10 national digits, or with country code, or with '+') into
 * canonical E.164 digits WITHOUT the leading '+'. Assumes the default country
 * code when the caller typed only the national number.
 */
export function toE164Digits(input: string, countryCode = DEFAULT_CC): string {
  let d = digitsOnly(input);
  if (!d) return "";
  // Already includes the country code (e.g. 91XXXXXXXXXX).
  if (d.startsWith(countryCode) && d.length > 10) return d;
  // National number only -> prefix the country code.
  return countryCode + d;
}

/** E.164 WITH '+', for the Supabase Auth client (signInWithOtp/verifyOtp). */
export function toE164Plus(input: string, countryCode = DEFAULT_CC): string {
  const d = toE164Digits(input, countryCode);
  return d ? "+" + d : "";
}

/** Validate a 10-digit Indian mobile (national part). */
export function isValidNationalMobile(input: string): boolean {
  const d = digitsOnly(input);
  return /^[6-9]\d{9}$/.test(d);
}

/** Pretty format for display: "+91 90000 00001". */
export function formatDisplay(input: string, countryCode = DEFAULT_CC): string {
  const d = toE164Digits(input, countryCode);
  if (!d) return "";
  const national = d.slice(countryCode.length);
  const grouped = national.replace(/(\d{5})(\d{5})/, "$1 $2");
  return `+${countryCode} ${grouped}`;
}
