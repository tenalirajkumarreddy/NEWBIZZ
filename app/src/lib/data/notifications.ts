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
