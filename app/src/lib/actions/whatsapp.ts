"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getWhatsappRuntimeConfig, listMessages } from "@/lib/data/whatsapp";
import { normalizePhone } from "@/lib/whatsapp/phone-utils";
import type { DrainResult } from "@/lib/whatsapp/worker";

// =====================================================================
// WhatsApp server actions (Phase 1).
//
// saveWhatsappConfig  - persist connection settings; the access token is
//                       encrypted by the app with the ENCRYPTION_KEY env
//                       var BEFORE it reaches the DB (definer RPC).
// sendWhatsAppMessage - send a text (24h window) or template message to
//                       a conversation; dry-run by default (no Meta call).
// setWhatsappDryRun   - flip dry-run for testing.
// =====================================================================

export type WhatsappActionResult =
  | { ok: true; messageId?: string }
  | { ok: false; error: string };

async function encryptToken(token: string): Promise<string> {
  const { encrypt } = await import("@/lib/whatsapp/encryption");
  if (!process.env.ENCRYPTION_KEY) {
    throw new Error("ENCRYPTION_KEY is not set");
  }
  return encrypt(token);
}

export async function saveWhatsappConfig(input: {
  wabaId?: string;
  phoneNumberId?: string;
  accessToken?: string;
  metaAppId?: string;
  verifyToken?: string;
  defaultTemplate?: string;
  dryRun?: boolean;
}): Promise<WhatsappActionResult> {
  try {
    const supabase = createClient();
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return { ok: false, error: "Not signed in" };

    const { data: canManage, error: permError } = await supabase.rpc("has_permission", {
      p_code: "admin",
    });
    if (permError || !canManage) {
      return { ok: false, error: "Admin permission required" };
    }

    const accessTokenEncrypted = input.accessToken
      ? await encryptToken(input.accessToken)
      : undefined;

    const { error } = await supabase.rpc("whatsapp_save_config", {
      p_waba_id: input.wabaId ?? undefined,
      p_phone_number_id: input.phoneNumberId ?? undefined,
      p_access_token_encrypted: accessTokenEncrypted,
      p_meta_app_id: input.metaAppId ?? undefined,
      p_verify_token: input.verifyToken ?? undefined,
      p_default_template: input.defaultTemplate ?? undefined,
      p_dry_run: input.dryRun,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Unknown error" };
  }
}

export async function markConversationRead(conversationId: string): Promise<WhatsappActionResult> {
  try {
    const supabase = createClient();
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return { ok: false, error: "Not signed in" };
    const { error } = await supabase.rpc("whatsapp_mark_read", {
      p_conversation_id: conversationId,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Unknown error" };
  }
}

export async function getConversationMessages(
  conversationId: string,
): Promise<{ ok: true; messages: Awaited<ReturnType<typeof listMessages>> } | { ok: false; error: string }> {
  const supabase = createClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return { ok: false, error: "Not signed in" };
  try {
    const messages = await listMessages(conversationId);
    return { ok: true, messages };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Unknown error" };
  }
}

export async function setWhatsappDryRun(dryRun: boolean): Promise<WhatsappActionResult> {
  try {
    const supabase = createClient();
    const { error } = await supabase
      .from("whatsapp_config")
      .update({ dry_run: dryRun })
      .eq("id", 1);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Unknown error" };
  }
}

export async function sendWhatsAppMessage(input: {
  conversationId?: string;
  phone?: string;
  type: "text" | "template";
  text?: string;
  templateName?: string;
  templateParams?: string[];
}): Promise<WhatsappActionResult> {
  try {
    const supabase = createClient();
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return { ok: false, error: "Not signed in" };

    const cfg = await getWhatsappRuntimeConfig();
    if (!cfg) return { ok: false, error: "WhatsApp not configured" };

    let phone = input.phone;
    let conversationId = input.conversationId;
    if (!phone && conversationId) {
      const { data } = await supabase
        .from("whatsapp_conversations")
        .select("phone")
        .eq("id", conversationId)
        .single();
      phone = data?.phone;
    }
    if (!phone) return { ok: false, error: "No recipient phone" };
    const to = normalizePhone(phone);
    if (!to) return { ok: false, error: "Invalid phone" };

    if (!conversationId) {
      const { data: convId, error: convErr } = await supabase.rpc(
        "whatsapp_get_or_create_conversation",
        { p_phone: to, p_customer_store_id: undefined, p_customer_id: undefined },
      );
      if (convErr) return { ok: false, error: convErr.message };
      conversationId = convId;
    }

    if (cfg.dryRun) {
      console.log(
        `[whatsapp] DRY-RUN ${input.type} to ${to}:`,
        input.type === "template" ? input.templateName : input.text,
      );
      const { data: msgId, error: insErr } = await supabase.rpc("whatsapp_insert_message", {
        p_conversation_id: conversationId,
        p_direction: "outbound",
        p_msg_type: input.type,
        p_body: input.text ?? undefined,
        p_template_name: input.type === "template" ? input.templateName : undefined,
        p_template_params: input.templateParams
          ? JSON.parse(JSON.stringify(input.templateParams))
          : null,
        p_sent_by: user.user.id,
        p_status: "sent",
      });
      if (insErr) return { ok: false, error: insErr.message };
      return { ok: true, messageId: msgId };
    }

    const { sendTextMessage, sendTemplateMessage } = await import("@/lib/whatsapp/meta-api");
    let metaResult: { messageId: string };

    if (input.type === "template") {
      if (!input.templateName) return { ok: false, error: "Template name required" };
      metaResult = await sendTemplateMessage({
        phoneNumberId: cfg.phoneNumberId!,
        accessToken: cfg.accessToken,
        to,
        templateName: input.templateName,
        language: "en",
        params: input.templateParams,
      });
    } else {
      if (!input.text) return { ok: false, error: "Text required" };
      metaResult = await sendTextMessage({
        phoneNumberId: cfg.phoneNumberId!,
        accessToken: cfg.accessToken,
        to,
        text: input.text,
      });
    }

    const { data: msgId, error: insErr } = await supabase.rpc("whatsapp_insert_message", {
      p_conversation_id: conversationId,
      p_direction: "outbound",
      p_msg_type: input.type,
      p_body: input.text ?? undefined,
      p_template_name: input.type === "template" ? input.templateName : undefined,
      p_template_params: input.templateParams
        ? JSON.parse(JSON.stringify(input.templateParams))
        : null,
      p_whatsapp_message_id: metaResult.messageId,
      p_sent_by: user.user.id,
      p_status: "sent",
    });
    if (insErr) return { ok: false, error: insErr.message };
    return { ok: true, messageId: msgId };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Unknown error" };
  }
}

// Convenience used by the dispatch worker + any caller with a service client:
// sends and records an outbound message without a user session.
export async function sendWhatsAppMessageService(input: {
  to: string;
  type: "text" | "template";
  text?: string;
  templateName?: string;
  templateParams?: string[];
}): Promise<WhatsappActionResult> {
  try {
    const cfg = await getWhatsappRuntimeConfig();
    if (!cfg) return { ok: false, error: "WhatsApp not configured" };
    const to = normalizePhone(input.to);
    if (!to) return { ok: false, error: "Invalid phone" };

    const supabase = createServiceClient();
    const { data: conversationId, error: convErr } = await supabase.rpc(
      "whatsapp_get_or_create_conversation",
      { p_phone: to, p_customer_store_id: undefined, p_customer_id: undefined },
    );
    if (convErr) return { ok: false, error: convErr.message };

    if (cfg.dryRun) {
      console.log(
        `[whatsapp] DRY-RUN (service) ${input.type} to ${to}:`,
        input.type === "template" ? input.templateName : input.text,
      );
      const { data: msgId, error: insErr } = await supabase.rpc("whatsapp_insert_message", {
        p_conversation_id: conversationId,
        p_direction: "outbound",
        p_msg_type: input.type,
        p_body: input.text ?? undefined,
        p_template_name: input.type === "template" ? input.templateName : undefined,
        p_template_params: input.templateParams
          ? JSON.parse(JSON.stringify(input.templateParams))
          : null,
        p_status: "sent",
      });
      if (insErr) return { ok: false, error: insErr.message };
      return { ok: true, messageId: msgId };
    }

    const { sendTextMessage, sendTemplateMessage } = await import("@/lib/whatsapp/meta-api");
    let metaResult: { messageId: string };
    if (input.type === "template") {
      if (!input.templateName) return { ok: false, error: "Template name required" };
      metaResult = await sendTemplateMessage({
        phoneNumberId: cfg.phoneNumberId!,
        accessToken: cfg.accessToken,
        to,
        templateName: input.templateName,
        language: "en",
        params: input.templateParams,
      });
    } else {
      if (!input.text) return { ok: false, error: "Text required" };
      metaResult = await sendTextMessage({
        phoneNumberId: cfg.phoneNumberId!,
        accessToken: cfg.accessToken,
        to,
        text: input.text,
      });
    }

    const { data: msgId, error: insErr } = await supabase.rpc("whatsapp_insert_message", {
      p_conversation_id: conversationId,
      p_direction: "outbound",
      p_msg_type: input.type,
      p_body: input.text ?? undefined,
      p_template_name: input.type === "template" ? input.templateName : undefined,
      p_template_params: input.templateParams
        ? JSON.parse(JSON.stringify(input.templateParams))
        : null,
      p_whatsapp_message_id: metaResult.messageId,
      p_status: "sent",
    });
    if (insErr) return { ok: false, error: insErr.message };
    return { ok: true, messageId: msgId };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Unknown error" };
  }
}

// =====================================================================
// Local template catalogue + worker operations (Phase 1, admin-gated).
// Testable end-to-end in dry-run while Meta credentials are pending.
// =====================================================================

export type TemplateSaveInput = {
  name: string;
  bodyText: string;
  category?: string;
  language?: string;
  status?: string;
};

export async function saveWhatsappTemplate(input: TemplateSaveInput): Promise<WhatsappActionResult> {
  try {
    const supabase = createClient();
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return { ok: false, error: "Not signed in" };

    const { data: canManage } = await supabase.rpc("has_permission", { p_code: "admin" });
    if (!canManage) return { ok: false, error: "Admin permission required" };

    const { data, error } = await supabase.rpc("whatsapp_template_save", {
      p_name: input.name,
      p_body_text: input.bodyText,
      p_category: input.category ?? "Utility",
      p_language: input.language ?? "en_US",
      p_status: input.status ?? "APPROVED",
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, messageId: (data as any)?.id };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Unknown error" };
  }
}

export async function deleteWhatsappTemplate(id: string): Promise<WhatsappActionResult> {
  try {
    const supabase = createClient();
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return { ok: false, error: "Not signed in" };
    const { data: canManage } = await supabase.rpc("has_permission", { p_code: "admin" });
    if (!canManage) return { ok: false, error: "Admin permission required" };

    const { error } = await supabase.rpc("whatsapp_template_delete", { p_id: id });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Unknown error" };
  }
}

export type EnqueueTestNotifyInput = {
  phone: string;
  title?: string;
  body?: string;
};

// Enqueue a whatsapp-channel test notification addressed to a conversation
// phone (via the definer RPC), then optionally run the worker drain so the
// settings page can show the full pipeline result. Testable in dry-run.
export async function enqueueWhatsappTestNotification(input: EnqueueTestNotifyInput): Promise<
  | { ok: true; conversationId: string; drain?: DrainResult }
  | { ok: false; error: string }
> {
  try {
    const supabase = createClient();
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return { ok: false, error: "Not signed in" };
    const { data: canManage } = await supabase.rpc("has_permission", { p_code: "admin" });
    if (!canManage) return { ok: false, error: "Admin permission required" };

    const phone = normalizePhone(input.phone);
    if (!phone) return { ok: false, error: "Invalid phone" };

    const { data: conversationId, error } = await (supabase as any).rpc(
      "whatsapp_enqueue_test_notify",
      {
        p_phone: phone,
        p_title: input.title ?? "",
        p_body: input.body ?? "",
      },
    );
    if (error) return { ok: false, error: error.message };

    const { drainWhatsappNotifications } = await import("@/lib/whatsapp/worker");
    const drain = await drainWhatsappNotifications(20);

    return { ok: true, conversationId: String(conversationId ?? ""), drain };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Unknown error" };
  }
}
