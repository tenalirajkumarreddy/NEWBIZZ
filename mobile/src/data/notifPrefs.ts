import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { qk } from "./keys";

export type NotifChannel = "in_app" | "whatsapp" | "sms" | "email";

export interface NotifPrefRow {
  user_id: string;
  category: string;
  channel: NotifChannel;
  enabled: boolean;
}

/** The signer's notification preferences across all categories/channels. */
export function useNotifPrefs() {
  const { user } = useSession();
  return useQuery({
    queryKey: qk.notifPrefs(),
    enabled: !!user?.id,
    queryFn: async (): Promise<NotifPrefRow[]> => {
      const { data, error } = await supabase
        .from("notification_preferences")
        .select("user_id, category, channel, enabled")
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data ?? []) as NotifPrefRow[];
    },
  });
}

/**
 * Upsert one preference. Missing rows mean "enabled" (server default), so
 * toggling OFF inserts enabled=false; toggling ON removes the override row
 * (simplest correct upsert: enabled=true writes true too - harmless).
 */
export async function setNotifPref(input: {
  userId: string;
  category: string;
  channel: NotifChannel;
  enabled: boolean;
}): Promise<void> {
  const { error } = await supabase.from("notification_preferences").upsert(
    {
      user_id: input.userId,
      category: input.category,
      channel: input.channel,
      enabled: input.enabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,category,channel" },
  );
  if (error) throw error;
}

export function useNotifPrefsInvalidator() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: qk.notifPrefs() });
}
