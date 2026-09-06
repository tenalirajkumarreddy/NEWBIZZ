import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { rpc } from "@/lib/rpc";
import { qk } from "./keys";

export interface NotificationRow {
  id: string;
  user_id: string;
  title: string;
  body: string | null;
  severity: string;
  category: string | null;
  entity_type: string | null;
  entity_id: string | null;
  action_url: string | null;
  status: string;
  created_at: string;
  read_at: string | null;
}

export function useNotifications() {
  const { user } = useSession();
  return useQuery({
    queryKey: qk.notifications(),
    enabled: !!user?.id,
    queryFn: async (): Promise<NotificationRow[]> => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as NotificationRow[];
    },
  });
}

export function useUnreadCount() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const uid = user?.id;

  useEffect(() => {
    if (!uid) return;
    const channel = supabase
      .channel("notifications")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        () => {
          void queryClient.invalidateQueries({ queryKey: qk.unread() });
          void queryClient.invalidateQueries({ queryKey: qk.notifications() });
        },
      )
      .subscribe();
    channelRef.current = channel;
    return () => {
      void supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [uid, queryClient]);

  return useQuery({
    queryKey: qk.unread(),
    enabled: !!uid,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid!)
        .eq("status", "unread");
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export async function markRead(ids?: string[]): Promise<number> {
  return rpc<number>("mark_notifications_read", { p_ids: ids ?? null });
}
