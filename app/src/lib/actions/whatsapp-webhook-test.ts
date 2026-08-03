"use server";

import crypto from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { normalizePhone } from "@/lib/whatsapp/phone-utils";

// =====================================================================
// WhatsApp webhook self-test (admin tooling).
//
// testWhatsappWebhook   - build a realistic Meta payload for the chosen
//                         scenario, sign it with META_APP_SECRET exactly
//                         as Meta does, POST it to our own
//                         /api/webhooks/whatsapp, and return the raw
//                         HTTP status + response body + DB effects so the
//                         admin can inspect the end-to-end path.
// cleanupWhatsappWebhookTest - remove the conversation (and its messages
//                         + fan-out notifications) that an inbound test
//                         created, via the definer RPC
//                         whatsapp_delete_conversation.
// =====================================================================

export type WebhookTestScenario =
  | "inbound-text"
  | "inbound-media"
  | "status-delivered"
  | "tampered-signature"
  | "missing-signature";

export interface WebhookTestEffects {
  conversationId: string | null;
  messageCount: number;
  notificationCount: number;
}

export interface WebhookTestResult {
  scenario: WebhookTestScenario;
  httpStatus: number;
  ok: boolean;
  responseBody: string;
  signaturePresent: boolean;
  metaAppSecretSet: boolean;
  effects: WebhookTestEffects;
}

export type WebhookTestOutcome =
  | { ok: true; result: WebhookTestResult }
  | { ok: false; error: string };

async function requireAdmin(): Promise<ReturnType<typeof createClient> | null> {
  const supabase = createClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return null;
  const { data: canManage } = await supabase.rpc("has_permission", { p_code: "admin" });
  return canManage ? supabase : null;
}

function signBody(rawBody: string, secret: string | undefined): string | null {
  if (!secret) return null;
  return "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
}

function buildPayload(
  scenario: WebhookTestScenario,
  phone: string,
  body: string,
): unknown {
  const ts = String(Math.floor(Date.now() / 1000));
  const msgId = `wamid.selftest.${Date.now()}`;
  const metadata = {
    display_phone_number: "15551234567",
    phone_number_id: "SELFTEST_PHONE_ID",
  };

  if (scenario === "status-delivered") {
    return {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "SELFTEST_WABA_ID",
          changes: [
            {
              value: {
                messaging_product: "whatsapp",
                metadata,
                statuses: [
                  {
                    id: msgId,
                    status: "delivered",
                    timestamp: ts,
                    recipient_id: phone,
                  },
                ],
              },
              field: "messages",
            },
          ],
        },
      ],
    };
  }

  const message =
    scenario === "inbound-media"
      ? {
          from: phone,
          id: msgId,
          timestamp: ts,
          type: "image",
          image: { id: "SELFTEST_MEDIA_ID", mime_type: "image/jpeg" },
        }
      : {
          from: phone,
          id: msgId,
          timestamp: ts,
          type: "text",
          text: { body },
        };

  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "SELFTEST_WABA_ID",
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata,
              contacts: [{ profile: { name: "Webhook Self Test" }, wa_id: phone }],
              messages: [message],
            },
            field: "messages",
          },
        ],
      },
    ],
  };
}

async function collectEffects(supabase: ReturnType<typeof createClient>, phone: string): Promise<WebhookTestEffects> {
  const empty: WebhookTestEffects = { conversationId: null, messageCount: 0, notificationCount: 0 };
  const { data: conv } = await supabase
    .from("whatsapp_conversations")
    .select("id")
    .eq("phone", phone)
    .maybeSingle();
  if (!conv?.id) return empty;

  const { count: msgCount } = await supabase
    .from("whatsapp_messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conv.id);
  const { count: notifCount } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("entity_type", "whatsapp_conversations")
    .eq("entity_id", conv.id);

  return { conversationId: conv.id, messageCount: msgCount ?? 0, notificationCount: notifCount ?? 0 };
}

export async function testWhatsappWebhook(input: {
  origin: string;
  scenario: WebhookTestScenario;
  phone?: string;
  body?: string;
}): Promise<WebhookTestOutcome> {
  try {
    const supabase = await requireAdmin();
    if (!supabase) return { ok: false, error: "Admin permission required" };

    const phone = normalizePhone(input.phone ?? "919000000000");
    if (!phone) return { ok: false, error: "Invalid test phone" };

    const rawBody = JSON.stringify(
      buildPayload(input.scenario, phone, input.body ?? "Hello from NEWBIZZ webhook self-test"),
    );

    const secret = process.env.META_APP_SECRET;
    let signatureHeader: string | null = signBody(rawBody, secret);

    // Tampered-signature scenario deliberately sends a WRONG signature to
    // prove the receiver fails closed.
    if (input.scenario === "tampered-signature") {
      signatureHeader = signBody(rawBody, "wrong-app-secret-for-test");
    }
    // Missing-signature scenario sends no header at all.
    const sendSignature = input.scenario === "missing-signature" ? undefined : signatureHeader;

    const headers: Record<string, string> = { "content-type": "application/json" };
    if (sendSignature) headers["x-hub-signature-256"] = sendSignature;

    let httpStatus = 0;
    let responseBody = "";
    try {
      const res = await fetch(`${input.origin}/api/webhooks/whatsapp`, {
        method: "POST",
        headers,
        body: rawBody,
        cache: "no-store",
      });
      httpStatus = res.status;
      responseBody = await res.text();
    } catch (err: any) {
      return { ok: false, error: `Webhook POST failed: ${err?.message ?? "network error"}` };
    }

    const effects = await collectEffects(supabase, phone);

    return {
      ok: true,
      result: {
        scenario: input.scenario,
        httpStatus,
        ok: httpStatus >= 200 && httpStatus < 300,
        responseBody,
        signaturePresent: Boolean(sendSignature),
        metaAppSecretSet: Boolean(secret),
        effects,
      },
    };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Unknown error" };
  }
}

export type WebhookCleanupOutcome = { ok: true } | { ok: false; error: string };

export async function cleanupWhatsappWebhookTest(phone: string): Promise<WebhookCleanupOutcome> {
  try {
    const supabase = await requireAdmin();
    if (!supabase) return { ok: false, error: "Admin permission required" };

    const normalized = normalizePhone(phone);
    if (!normalized) return { ok: false, error: "Invalid phone" };

    const { error } = await supabase.rpc("whatsapp_delete_conversation", {
      p_phone: normalized,
    });
    if (error) return { ok: false, error: error.message };

    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Unknown error" };
  }
}
