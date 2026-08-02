import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { unwrap } from "./types";
import type { Database } from "@/lib/supabase/database.types";

type WhatsAppConfigRow = Database["public"]["Tables"]["whatsapp_config"]["Row"];
type ConversationRow = Database["public"]["Tables"]["whatsapp_conversations"]["Row"];
type MessageRow = Database["public"]["Tables"]["whatsapp_messages"]["Row"];

export interface WhatsAppConfigView {
  wabaId: string | null;
  phoneNumberId: string | null;
  metaAppId: string | null;
  defaultTemplate: string | null;
  dryRun: boolean;
  configured: boolean;
  registeredAt: string | null;
}

export interface ConversationWithCustomer extends ConversationRow {
  store_name: string | null;
  customer_name: string | null;
}

// ---- config ----
export async function getWhatsappConfig(): Promise<WhatsAppConfigView | null> {
  const supabase = createClient();
  const rows = unwrap<WhatsAppConfigRow[]>(
    await supabase
      .from("whatsapp_config")
      .select("*")
      .eq("id", 1)
      .limit(1)
      .returns<WhatsAppConfigRow[]>(),
    [],
    "whatsapp.getConfig",
  );
  const cfg = rows[0];
  if (!cfg) return null;
  return {
    wabaId: cfg.waba_id,
    phoneNumberId: cfg.phone_number_id,
    metaAppId: cfg.meta_app_id,
    defaultTemplate: cfg.default_template,
    dryRun: cfg.dry_run,
    configured: Boolean(cfg.phone_number_id && cfg.access_token_encrypted),
    registeredAt: cfg.registered_at,
  };
}

// ---- conversations ----
export interface ConversationSummary extends ConversationRow {
  store_name: string | null;
  customer_name: string | null;
  last_message_body: string | null;
  last_message_direction: string | null;
  unread_count: number;
}

export async function listConversations(opts?: { status?: string }): Promise<ConversationSummary[]> {
  const supabase = createClient();
  const rows = unwrap<ConversationWithCustomer[]>(
    await supabase
      .from("whatsapp_conversations")
      .select(
        `*,
         customer_stores(name),
         customers(name)`,
      )
      .eq("status", opts?.status ?? "open")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .returns<ConversationWithCustomer[]>(),
    [],
    "whatsapp.listConversations",
  );

  const convIds = rows.map((r) => r.id);
  let lastMessages: Record<string, { body: string | null; direction: string }> = {};
  let unreadCounts: Record<string, number> = {};

  if (convIds.length > 0) {
    const last = unwrap<{ conversation_id: string; body: string | null; direction: string }[]>(
      await supabase
        .from("whatsapp_messages")
        .select("conversation_id, body, direction")
        .in("conversation_id", convIds)
        .order("created_at", { ascending: false })
        .returns<{ conversation_id: string; body: string | null; direction: string }[]>(),
      [],
      "whatsapp.lastMessages",
    );
    for (const m of last) {
      if (!(m.conversation_id in lastMessages)) lastMessages[m.conversation_id] = { body: m.body, direction: m.direction };
    }

    const unread = unwrap<{ conversation_id: string; created_at: string }[]>(
      await supabase
        .from("whatsapp_messages")
        .select("conversation_id, created_at")
        .in("conversation_id", convIds)
        .returns<{ conversation_id: string; created_at: string }[]>(),
      [],
      "whatsapp.unreadMessages",
    );
    for (const m of unread) {
      const conv = rows.find((c) => c.id === m.conversation_id);
      const lastRead = conv?.last_read_at ? new Date(conv.last_read_at) : null;
      if (lastRead && new Date(m.created_at) <= lastRead) continue;
      unreadCounts[m.conversation_id] = (unreadCounts[m.conversation_id] ?? 0) + 1;
    }
  }

  return rows.map((r) => ({
    ...r,
    store_name: (r as any).customer_stores?.name ?? null,
    customer_name: (r as any).customers?.name ?? null,
    last_message_body: lastMessages[r.id]?.body ?? null,
    last_message_direction: lastMessages[r.id]?.direction ?? null,
    unread_count: unreadCounts[r.id] ?? 0,
  }));
}

export async function listMessages(conversationId: string): Promise<MessageRow[]> {
  const supabase = createClient();
  return unwrap<MessageRow[]>(
    await supabase
      .from("whatsapp_messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(200)
      .returns<MessageRow[]>(),
    [],
    "whatsapp.listMessages",
  );
}

// Total unread inbound messages across all open conversations (sidebar badge).
export async function getWhatsappUnreadCount(): Promise<number> {
  const supabase = createClient();
  const convs = unwrap<ConversationRow[]>(
    await supabase
      .from("whatsapp_conversations")
      .select("id, last_read_at")
      .eq("status", "open")
      .returns<ConversationRow[]>(),
    [],
    "whatsapp.unreadConvs",
  );
  if (convs.length === 0) return 0;
  const msgs = unwrap<{ conversation_id: string; created_at: string }[]>(
    await supabase
      .from("whatsapp_messages")
      .select("conversation_id, created_at")
      .in(
        "conversation_id",
        convs.map((c) => c.id),
      )
      .returns<{ conversation_id: string; created_at: string }[]>(),
    [],
    "whatsapp.unreadMsgs",
  );
  let total = 0;
  for (const m of msgs) {
    const conv = convs.find((c) => c.id === m.conversation_id);
    const lastRead = conv?.last_read_at ? new Date(conv.last_read_at) : null;
    if (lastRead && new Date(m.created_at) <= lastRead) continue;
    total += 1;
  }
  return total;
}

export async function getConversation(id: string): Promise<ConversationRow | null> {  const supabase = createClient();
  const rows = unwrap<ConversationRow[]>(
    await supabase
      .from("whatsapp_conversations")
      .select("*")
      .eq("id", id)
      .limit(1)
      .returns<ConversationRow[]>(),
    [],
    "whatsapp.getConversation",
  );
  return rows[0] ?? null;
}

export interface WhatsAppRuntimeConfig {
  wabaId: string | null;
  phoneNumberId: string | null;
  accessToken: string;
  metaAppId: string | null;
  defaultTemplate: string | null;
  dryRun: boolean;
}

// Server-only: full config INCLUDING the decrypted token for outbound sends.
// Runs under the anon-key service client, so reads go through the definer
// RPC whatsapp_get_config (whatsapp_config RLS is authenticated-only).
// Returns null if not configured.
export async function getWhatsappRuntimeConfig(): Promise<WhatsAppRuntimeConfig | null> {
  const supabase = createServiceClient();
  const { data } = await (supabase as any)
    .rpc("whatsapp_get_config")
    .single() as { data: WhatsAppConfigRow | null; error: { message: string } | null };
  if (!data?.access_token_encrypted || !data.phone_number_id) return null;
  const { decrypt } = await import("@/lib/whatsapp/encryption");
  let accessToken: string;
  try {
    accessToken = decrypt(data.access_token_encrypted);
  } catch (err) {
    console.error("[whatsapp] token decrypt failed", err);
    return null;
  }
  return {
    wabaId: data.waba_id,
    phoneNumberId: data.phone_number_id,
    accessToken,
    metaAppId: data.meta_app_id,
    defaultTemplate: data.default_template,
    dryRun: data.dry_run,
  };
}
