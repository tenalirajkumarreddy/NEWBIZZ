import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyMetaWebhookSignature } from "@/lib/whatsapp/webhook-signature";
import { normalizePhone } from "@/lib/whatsapp/phone-utils";

export const maxDuration = 60;

interface WhatsAppMessagePayload {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: { id: string; mime_type: string; caption?: string };
  video?: { id: string; mime_type: string; caption?: string };
  document?: { id: string; mime_type: string; filename?: string };
  audio?: { id: string; mime_type: string };
  location?: { latitude: number; longitude: number };
}

interface WhatsAppStatusPayload {
  id: string;
  status: string;
  timestamp: string;
  recipient_id: string;
  errors?: Array<{ title?: string; message?: string }>;
}

// GET - Meta webhook verification handshake.
// Meta calls this when the webhook is registered; we echo hub.challenge only
// when hub.verify_token matches the configured token. Fail-closed otherwise.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const challenge = searchParams.get("hub.challenge");
  const verifyToken = searchParams.get("hub.verify_token");

  if (mode !== "subscribe" || !challenge || !verifyToken) {
    return NextResponse.json({ error: "missing parameters" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: cfg } = await (supabase as any).rpc("whatsapp_get_config").single();

  if (!cfg?.verify_token || verifyToken !== cfg.verify_token) {
    return NextResponse.json({ error: "invalid verify token" }, { status: 403 });
  }

  return new Response(challenge, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

// POST - Meta webhook delivery.
// Verifies the X-Hub-Signature-256 (fail-closed), then processes inbound
// messages and delivery statuses. Each inbound message lands in
// whatsapp_messages (via definer RPC), touches its conversation, and fans
// out a `customer.manage` notification so agents see it in the bell.
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  if (!verifyMetaWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: cfg } = await (supabase as any).rpc("whatsapp_get_config").single();

  const entries = payload?.entry ?? [];
  for (const entry of entries) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value;
      if (!value) continue;

      if (Array.isArray(value.statuses)) {
        for (const status of value.statuses) {
          await handleStatusUpdate(supabase, status as WhatsAppStatusPayload);
        }
      }

      if (Array.isArray(value.messages)) {
        for (const msg of value.messages) {
          await handleInboundMessage(
            supabase,
            msg as WhatsAppMessagePayload,
            cfg?.dry_run ?? true,
          );
        }
      }
    }
  }

  return NextResponse.json({ ok: true });
}

async function handleStatusUpdate(supabase: ReturnType<typeof createServiceClient>, status: WhatsAppStatusPayload) {
  const errorMessage =
    status.errors?.map((e) => e.message ?? e.title).filter(Boolean).join("; ") ?? undefined;
  const { error } = await supabase.rpc("whatsapp_update_message_status", {
    p_whatsapp_message_id: status.id,
    p_status: status.status,
    p_error_message: errorMessage,
  });
  if (error) {
    console.error("[whatsapp.webhook] status update failed", error.message);
  }
}

async function handleInboundMessage(
  supabase: ReturnType<typeof createServiceClient>,
  msg: WhatsAppMessagePayload,
  dryRun: boolean,
) {
  const phone = normalizePhone(msg.from);
  if (!phone) return;

  // Find the conversation (or create it) for this phone.
  const { data: conversationId, error: convError } = await supabase.rpc(
    "whatsapp_get_or_create_conversation",
    { p_phone: phone, p_customer_store_id: undefined, p_customer_id: undefined },
  );
  if (convError || !conversationId) {
    console.error("[whatsapp.webhook] conversation resolve failed", convError?.message);
    return;
  }

  const body = extractBody(msg);
  const media = extractMedia(msg);

  if (dryRun) {
    console.log(
      `[whatsapp.webhook] DRY-RUN inbound ${msg.type} from ${phone}:`,
      body ?? media?.url ?? "(no content)",
    );
  }

  const { error } = await supabase.rpc("whatsapp_insert_message", {
    p_conversation_id: conversationId,
    p_direction: "inbound",
    p_msg_type: msg.type,
    p_body: body ?? undefined,
    p_media_url: media?.url ?? undefined,
    p_media_mime: media?.mime ?? undefined,
    p_media_filename: media?.filename ?? undefined,
    p_whatsapp_message_id: msg.id,
  });
  if (error) {
    console.error("[whatsapp.webhook] inbound persist failed", error.message);
    return;
  }

  // Fan out to customer-facing agents.
  const { error: notifError } = await supabase.rpc("notify_perm", {
    p_code: "customer.manage",
    p_title: `New WhatsApp message from ${phone}`,
    p_opts: {
      body: body ?? `New ${msg.type} message`,
      severity: "info",
      category: "whatsapp",
      entity_type: "whatsapp_conversations",
      entity_id: conversationId,
    },
  });
  if (notifError) {
    console.error("[whatsapp.webhook] notify failed", notifError.message);
  }
}

function extractBody(msg: WhatsAppMessagePayload): string | null {
  if (msg.type === "text" && msg.text?.body) return msg.text.body;
  if (msg.type === "location") {
    return "Location";
  }
  return null;
}

function extractMedia(msg: WhatsAppMessagePayload): { url: string | null; mime: string | null; filename: string | null } {
  const media = msg.image ?? msg.video ?? msg.document ?? msg.audio;
  if (!media) return { url: null, mime: null, filename: null };
  return {
    url: (media as any).id ? `media:${(media as any).id}` : null,
    mime: (media as any).mime_type ?? null,
    filename: (media as any).filename ?? null,
  };
}
