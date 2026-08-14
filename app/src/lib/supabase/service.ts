import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * "Privileged" Supabase client for SERVER-ONLY infratructure (webhook receiver,
 * CRON_SECRET-gated cron routes, the WhatsApp dispatch worker, the intangles
 * poller, and outbound WhatsApp sends). It runs as the **service_role** key.
 *
 * SECURITY: do not add a SUPABASE_SERVICE_ROLE_KEY lookup fallback to the anon
 * key here. These callers drive SECURITY DEFINER RPCs that bypass RLS; keeping
 * them on the public anon key forced those RPCs to be granted to `anon`, which
 * meant ANYONE could call them directly over the REST API (customer PII reads,
 * message forgery, notification spam). Now that this client runs as
 * service_role, the RPCs are restricted to service_role + authenticated, so
 * only this server path (behind Meta-signature / CRON_SECRET guards) and
 * signed-in app users can reach them.
 *
 * The key is ONLY ever read server-side (never NEXT_PUBLIC_*) and fails closed
 * if it is not configured rather than silently downgrading to anon.
 */
export function createServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured. Refusing to run privileged " +
        "DB access as the anon role.",
    );
  }
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}