// =====================================================================
// lib/data/notifications.ts — typed readers for the current user's inbox.
//
// RLS restricts notifications to the signed-in user, so these need no user
// filter. Reads only; marking-read is a separate RPC (mark_notifications_read)
// exposed as a Server Action elsewhere, not here.
// =====================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrap, type NotificationRow } from "./types";

export interface RecentNotifications {
  items: NotificationRow[];
  unreadCount: number;
}

/**
 * The most recent notifications plus a live unread count. `limit` caps the list
 * for a dropdown/panel; the unread count is computed independently so a long
 * backlog still reports accurately.
 */
export async function getRecentNotifications(limit = 8): Promise<RecentNotifications> {
  const supabase = createClient();

  const listRes = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  const countRes = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("status", "unread");

  const items = unwrap(listRes, [] as NotificationRow[], "getRecentNotifications");
  const unreadCount = countRes.error ? 0 : countRes.count ?? 0;

  return { items, unreadCount };
}

/** Just the unread badge count (cheap head query). */
export async function getUnreadCount(): Promise<number> {
  const supabase = createClient();
  const res = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("status", "unread");
  return res.error ? 0 : res.count ?? 0;
}

export const NOTIFICATION_PAGE_SIZE = 30;

/**
 * A full page of the user's notifications, newest first, with optional status
 * filter. Keyset pagination on created_at is not practical (timestamps can tie),
 * so we paginate with offset via a head count — this inbox is per-user and small.
 */
export async function listNotifications(
  opts: { status?: "unread" | "read" | "archived"; offset?: number; limit?: number } = {},
): Promise<{ rows: NotificationRow[]; total: number }> {
  const supabase = createClient();
  const { status, offset = 0, limit = NOTIFICATION_PAGE_SIZE } = opts;

  let q = supabase.from("notifications").select("*", { count: "exact" }).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  if (status) q = q.eq("status", status);

  const res = await q;
  return {
    rows: unwrap(res, [] as NotificationRow[], "listNotifications"),
    total: res.error ? 0 : res.count ?? 0,
  };
}

// =====================================================================
// Notification preferences — RLS restricts notification_preferences to the
// signed-in user, so a plain select returns exactly the caller's rows.
// =====================================================================

export interface NotificationPrefRow {
  category: string;
  channel: "whatsapp" | "sms" | "email";
  enabled: boolean;
}

export async function getNotificationPrefs(): Promise<NotificationPrefRow[]> {
  const supabase = createClient();
  const res = await supabase.from("notification_preferences").select("category, channel, enabled");
  if (res.error) return [];
  return (res.data ?? []) as NotificationPrefRow[];
}
