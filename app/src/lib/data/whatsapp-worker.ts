import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

type TemplateRow = Database["public"]["Tables"]["whatsapp_message_templates"]["Row"];
type NotificationRow = Database["public"]["Tables"]["notifications"]["Row"];

export interface WorkerStats {
  pending: number;
  sent: number;
  openConversations: number;
  templates: number;
}

// ---- local template catalogue ----
export async function listTemplates(status?: string): Promise<TemplateRow[]> {
  const supabase = createClient();
  const { data } = await (supabase as any).rpc("whatsapp_template_list", {
    p_status: status ?? null,
  });
  return (data ?? []) as TemplateRow[];
}

// ---- worker dashboard ----
export async function getWorkerStats(): Promise<WorkerStats> {
  const supabase = createClient();
  const { data } = await (supabase as any).rpc("whatsapp_worker_stats");
  return {
    pending: Number(data?.pending ?? 0),
    sent: Number(data?.sent ?? 0),
    openConversations: Number(data?.open_conversations ?? 0),
    templates: Number(data?.templates ?? 0),
  };
}

export async function listRecentWhatsappNotifications(
  limit = 15,
): Promise<NotificationRow[]> {
  const supabase = createClient();
  const { data } = await (supabase as any).rpc("whatsapp_recent_notifications", {
    p_limit: limit,
  });
  return (data ?? []) as NotificationRow[];
}
