"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

// =====================================================================
// Notifications — all writes go through the definer RPC so a user can only
// ever touch their own rows.
// =====================================================================

export async function markNotificationsRead(ids: string[]): Promise<ActionResult<{ marked: number }>> {
  const supabase = createClient();
  const res = await (supabase as any).rpc("mark_notifications_read", { p_ids: ids });
  if (res.error) return { ok: false, error: res.error.message };
  revalidatePath("/notifications");
  revalidatePath("/", "layout");
  return { ok: true, marked: Number(res.data ?? 0) };
}

export async function markAllNotificationsRead(): Promise<ActionResult<{ marked: number }>> {
  const supabase = createClient();
  const res = await (supabase as any).rpc("mark_notifications_read", { p_ids: null });
  if (res.error) return { ok: false, error: res.error.message };
  revalidatePath("/notifications");
  revalidatePath("/", "layout");
  return { ok: true, marked: Number(res.data ?? 0) };
}

export async function archiveNotifications(ids: string[]): Promise<ActionResult<{ archived: number }>> {
  const supabase = createClient();
  const res = await (supabase as any).rpc("archive_notifications", { p_ids: ids });
  if (res.error) return { ok: false, error: res.error.message };
  revalidatePath("/notifications");
  revalidatePath("/", "layout");
  return { ok: true, archived: Number(res.data ?? 0) };
}

// =====================================================================
// Notification preferences — self-service channel muting per category.
// Writes go through set_notification_preference (definer RPC that scopes
// to the caller); in_app can never be muted.
// =====================================================================

export type NotifChannel = "whatsapp" | "sms" | "email";

export interface NotificationPrefInput {
  category: string;
  channel: NotifChannel;
  enabled: boolean;
}

export async function setNotificationPreference(
  input: NotificationPrefInput,
): Promise<ActionResult<{ category: string; channel: NotifChannel; enabled: boolean }>> {
  const supabase = createClient();
  const res = await (supabase as any).rpc("set_notification_preference", {
    p_category: input.category,
    p_channel: input.channel,
    p_enabled: input.enabled,
  });
  if (res.error) return { ok: false, error: res.error.message };
  return { ok: true, category: input.category, channel: input.channel, enabled: input.enabled };
}
