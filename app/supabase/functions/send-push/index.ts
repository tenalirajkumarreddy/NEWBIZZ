// deno-lint-ignore-file no-explicit-any
// =====================================================================
// send-push: Database Webhook on public.notifications INSERT.
// Sends an FCM v1 message to every registered device of the user.
// Requires secrets:
//   FIREBASE_SERVICE_ACCOUNT_JSON - service-account key JSON (raw or base64)
//   FIREBASE_PROJECT_ID           - Firebase project id
// =====================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const encoder = new TextEncoder();

function b64url(input: Uint8Array | string): string {
  const b = typeof input === "string" ? encoder.encode(input) : input;
  let s = "";
  for (const byte of b) s += String.fromCharCode(byte);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getAccessToken(serviceAccount: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claim))}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(serviceAccount.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, encoder.encode(unsigned));
  const jwt = `${unsigned}.${b64url(new Uint8Array(sig))}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`token fetch failed: ${res.status}`);
  const json = await res.json();
  return json.access_token as string;
}

function pemToArrayBuffer(pem: string): Uint8Array {
  const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== "POST") return new Response("method", { status: 405 });
    const payload = await req.json();
    const row = payload?.record ?? payload?.data ?? null;
    if (!row?.user_id) return new Response("no record", { status: 400 });
    if (row.status && row.status !== "unread") return new Response("skip non-unread", { status: 200 });

    const saRaw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");
    const projectId = Deno.env.get("FIREBASE_PROJECT_ID");
    if (!saRaw || !projectId) return new Response("not configured", { status: 200 });
    // Secret may be stored as raw JSON or base64 (dotenv-safe). Accept both.
    let serviceAccount: any;
    try {
      serviceAccount = JSON.parse(saRaw);
    } catch {
      serviceAccount = JSON.parse(atob(saRaw.replace(/\s+/g, "")));
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: tokens, error } = await supabase
      .from("push_tokens")
      .select("token, platform")
      .eq("user_id", row.user_id);
    if (error || !tokens?.length) return new Response("no tokens", { status: 200 });

    const access = await getAccessToken(serviceAccount);
    let sent = 0;
    const stale: string[] = [];

    await Promise.all(
      tokens.map(async (t: any) => {
        const message = {
          message: {
            token: t.token,
            notification: {
              title: row.title ?? "NEWBIZZ",
              body: row.body ?? "",
            },
            android: {
              priority: "high",
              notification: {
                channel_id: "newbizz_default",
                color: "#0891b2",
              },
            },
            data: {
              action_url: row.action_url ?? "",
              entity_type: row.entity_type ?? "",
              entity_id: row.entity_id ?? "",
              notification_id: String(row.id ?? ""),
              title: row.title ?? "",
              body: row.body ?? "",
            },
          },
        };
        const fcm = await fetch(
          `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${access}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(message),
          },
        );
        if (fcm.ok) sent++;
        else if (fcm.status === 404 || fcm.status === 410) stale.push(t.token);
      }),
    );

    // best-effort cleanup of dead tokens
    if (stale.length) {
      await supabase.from("push_tokens").delete().in("token", stale);
    }

    return new Response(JSON.stringify({ sent, stale: stale.length }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(`error: ${e instanceof Error ? e.message : String(e)}`, { status: 500 });
  }
});
