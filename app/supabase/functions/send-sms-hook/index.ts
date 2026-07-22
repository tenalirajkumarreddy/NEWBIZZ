// =====================================================================
// send-sms-hook  —  Supabase "Send SMS" Auth Hook (Deno Edge Function).
//
// Supabase Auth invokes this INSTEAD of its built-in SMS sender whenever a
// phone OTP must go out (login, phone-change, MFA). Flow (platform plan §1.1a):
//
//   Supabase Auth --(Standard Webhooks signed POST { user, sms:{otp} })-->
//   send-sms-hook --(verify hook secret)--> provider.send(user.phone, text)
//   --> httpSMS --> paired Android phone --> user
//
// Security: the request is signed with SEND_SMS_HOOK_SECRET using the
// Standard Webhooks scheme (webhook-id / webhook-timestamp / webhook-signature
// headers). We verify it BEFORE doing anything, so only Supabase Auth can make
// us send an SMS — no open relay.
//
// Success contract: Supabase treats an empty body + HTTP 200 as "sent". On
// failure we return the vendor's http_code + message so Auth can surface/retry.
//
// The vendor lives entirely behind provider.ts — see the swappability note there.
// =====================================================================
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import { getSmsProvider, SmsSendError } from "./provider.ts";

// OTP validity mirrors the Auth setting (default 5 min). Text only — no PII,
// no links. Kept short so P2P carriers are less likely to spam-flag it.
function otpMessage(otp: string): string {
  return `Your NEWBIZZ code is ${otp}. Valid 5 min. Do not share it.`;
}

function jsonError(httpCode: number, message: string): Response {
  // Shape Supabase Auth understands for hook errors.
  return new Response(
    JSON.stringify({ error: { http_code: httpCode, message } }),
    { status: httpCode, headers: { "Content-Type": "application/json" } },
  );
}

Deno.serve(async (req) => {
  // The hook is POST-only.
  if (req.method !== "POST") {
    return jsonError(405, "Method not allowed");
  }

  // 1) Verify the Standard Webhooks signature. The raw body text MUST be
  //    passed to verify() unchanged (signature is over the exact bytes).
  const rawSecret = Deno.env.get("SEND_SMS_HOOK_SECRET");
  if (!rawSecret) {
    return jsonError(500, "SEND_SMS_HOOK_SECRET is not configured");
  }
  // Supabase stores the secret as "v1,whsec_<base64>"; standardwebhooks wants
  // just the base64 portion.
  const base64Secret = rawSecret.replace("v1,whsec_", "");

  const payload = await req.text();
  const headers = Object.fromEntries(req.headers);

  let user: { phone?: string; id?: string };
  let sms: { otp?: string };
  try {
    const verified = new Webhook(base64Secret).verify(payload, headers) as {
      user: { phone?: string; id?: string };
      sms: { otp?: string };
    };
    user = verified.user;
    sms = verified.sms;
  } catch (_e) {
    // Bad/absent signature => not from Supabase Auth. Reject, do not send.
    return jsonError(401, "Invalid webhook signature");
  }

  // 2) Basic payload sanity.
  const phone = user?.phone;
  const otp = sms?.otp;
  if (!phone || !otp) {
    return jsonError(400, "Payload missing user.phone or sms.otp");
  }

  // 3) Hand off to the active provider. user.phone is E.164 with '+', which is
  //    exactly what httpSMS expects; use the OTP as the idempotency key so a
  //    Supabase retry of the same OTP does not double-send.
  try {
    const provider = getSmsProvider();
    await provider.send(phone, otpMessage(otp), `${user.id ?? "otp"}:${otp}`);
  } catch (e) {
    const status = e instanceof SmsSendError ? e.httpStatus : 500;
    const message = e instanceof Error ? e.message : String(e);
    // Log for the Edge Function logs (does NOT include the OTP).
    console.error(`send-sms-hook failed for ${phone}: ${message}`);
    return jsonError(status, `Failed to send SMS: ${message}`);
  }

  // 4) Empty 200 = success (Supabase contract).
  return new Response(JSON.stringify({}), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
