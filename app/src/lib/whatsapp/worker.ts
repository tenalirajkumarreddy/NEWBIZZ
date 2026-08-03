import { createServiceClient } from "@/lib/supabase/service";
import { getWhatsappRuntimeConfig } from "@/lib/data/whatsapp";
import { normalizePhone } from "@/lib/whatsapp/phone-utils";

// =====================================================================
// WhatsApp dispatch worker (Phase 1, 7.8).
//
// Drains `notifications` rows marked `delivery_channel='whatsapp'` that
// have not yet been sent externally. For each row it:
//   1. resolves the recipient phone from the notification's entity,
//   2. honours whatsapp_pref_allows(user, category) (definer wrapper over
//      pref_allows, which is revoked from clients),
//   3. sends via the Meta API (or dry-run logs), and
//   4. marks sent_external=true + sent_at on success.
//
// DB access goes through SECURITY DEFINER RPCs (whatsapp_pending_notifications,
// whatsapp_resolve_recipient_phone, whatsapp_mark_sent) because the worker
// runs under the anon-key service client and notifications/customer_stores
// RLS is authenticated-only. Every notification is isolated in its own
// try/catch so one bad row can never abort the batch. This worker is
// STRICTLY ADDITIVE - the in-app notification row already exists regardless
// of WhatsApp outcome.
// =====================================================================

interface PendingNotification {
  id: string;
  user_id: string;
  title: string;
  body: string | null;
  category: string | null;
  entity_type: string | null;
  entity_id: string | null;
}

export interface DrainResult {
  scanned: number;
  sent: number;
  skipped: number;
  failed: number;
  dryRun: boolean;
}

export async function drainWhatsappNotifications(limit = 20): Promise<DrainResult> {
  const supabase = createServiceClient();
  const result: DrainResult = { scanned: 0, sent: 0, skipped: 0, failed: 0, dryRun: true };

  const cfg = await getWhatsappRuntimeConfig();
  if (!cfg) return result; // not configured -> nothing to do
  result.dryRun = cfg.dryRun;

  const { data: rows, error } = await supabase.rpc("whatsapp_pending_notifications", {
    p_limit: limit,
  });
  if (error) {
    console.error("[whatsapp.worker] scan failed", error.message);
    return result;
  }
  const notifications = (rows ?? []) as unknown as PendingNotification[];
  result.scanned = notifications.length;

  for (const n of notifications) {
    try {
      // Honour the user's per-category WhatsApp preference.
      const { data: allows } = await supabase.rpc("whatsapp_pref_allows", {
        p_user: n.user_id,
        p_category: n.category as string,
      });
      if (allows === false) {
        // Muted -> consume the notification so it isn't retried forever.
        await supabase.rpc("whatsapp_mark_sent", { p_id: n.id });
        result.skipped++;
        continue;
      }

      const { data: phone } = await supabase.rpc("whatsapp_resolve_recipient_phone", {
        p_entity_type: n.entity_type as string,
        p_entity_id: n.entity_id as string,
      });
      if (!phone) {
        console.warn(`[whatsapp.worker] no recipient phone for notification ${n.id}`);
        await supabase.rpc("whatsapp_mark_sent", { p_id: n.id });
        result.skipped++;
        continue;
      }
      const to = normalizePhone(phone);

      const text = n.body ?? n.title;
      const templateName: string | undefined = cfg.defaultTemplate ?? undefined;
      const { sendWhatsAppMessageService } = await import("@/lib/actions/whatsapp");

      const outcome = await sendWhatsAppMessageService({
        to,
        type: templateName ? "template" : "text",
        text: templateName ? undefined : text,
        templateName,
        templateParams: [text],
      });

      if (outcome.ok) {
        await supabase.rpc("whatsapp_mark_sent", { p_id: n.id });
        result.sent++;
      } else {
        console.error(`[whatsapp.worker] send failed for ${n.id}:`, outcome.error);
        result.failed++;
      }
    } catch (err) {
      console.error(`[whatsapp.worker] notification ${n.id} crashed the batch`, err);
      result.failed++;
    }
  }

  return result;
}
