import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { supabase } from "../lib/supabase";

/**
 * Android 13+ requires POST_NOTIFICATIONS granted at runtime; the manifest
 * permission alone is not enough.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== "android") return true;
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted) return true;
  if (!cur.canAskAgain) return false;
  const req = await Notifications.requestPermissionsAsync();
  return req.granted;
}

/**
 * Register the device for push and upsert the FCM token against the signed-in
 * user. Safe to call repeatedly; the push_tokens row is keyed by token.
 * Requires mobile/google-services.json (Firebase) in the native build.
 */
export async function registerPushToken(): Promise<"registered" | "skipped" | "failed"> {
  try {
    if (!Device.isDevice) return "skipped";
    const granted = await requestNotificationPermission();
    if (!granted) return "skipped";

    const tokenRes = await Notifications.getDevicePushTokenAsync();
    const token = tokenRes.type === "ios" ? tokenRes.data : tokenRes.data;
    if (!token) return "failed";

    const { data: uidRow } = await supabase.auth.getUser();
    const uid = uidRow?.user?.id;
    if (!uid) return "failed";

    await supabase.from("push_tokens").upsert(
      {
        user_id: uid,
        token: String(token),
        platform: Platform.OS,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "token" },
    );
    return "registered";
  } catch {
    return "failed";
  }
}

/** Push handler config: show alerts in foreground with app icon/color. */
export function configureForegroundNotifications(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

export interface TapDestination {
  actionUrl: string | null;
}

/** Extract a deep-link target from an FCM data payload. */
export function tapDestination(res: Notifications.NotificationResponse): TapDestination {
  const data = (res.notification.request.content.data ?? {}) as Record<string, unknown>;
  const url = typeof data.action_url === "string" ? data.action_url : null;
  return { actionUrl: url };
}
