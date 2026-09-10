import { View, Pressable, StyleSheet } from "react-native";
import { usePathname, useRouter } from "expo-router";
import * as Network from "expo-network";
import { Wifi, WifiOff, UserRound } from "lucide-react-native";
import { Bell } from "@/components/Bell";
import { useUnreadCount } from "@/data/notifications";
import { tokens } from "@/theme/tokens";
import { useMemo } from "react";
import { useTheme } from "@/theme/ThemeContext";

/**
 * Gradient-header actions: sync state, notifications, profile.
 * Ghost buttons - no background, white icons that sit on the gradient.
 */
export function HeaderRight() {
  const { palette: t } = useTheme();
  const s = useStyles();
  const router = useRouter();
  const pathname = usePathname();
  const { data: unread = 0 } = useUnreadCount();
  const state = Network.useNetworkState();
  const online = state.isConnected !== false && state.isInternetReachable !== false;

  return (
    <View style={s.row}>
      {pathname !== "/sync" ? (
        <Pressable
          onPress={() => router.push("/sync")}
          accessibilityLabel={online ? "Online - sync and data" : "Offline - sync and data"}
          accessibilityRole="button"
          hitSlop={8}
          style={({ pressed }) => [s.ghost, pressed && { opacity: 0.7 }]}
        >
          {online ? <Wifi size={19} color="#ffffff" /> : <WifiOff size={19} color="#fecaca" />}
          {!online ? <View style={[s.dot, { backgroundColor: t.color.red }]} /> : null}
        </Pressable>
      ) : null}
      {pathname !== "/notifications" ? (
        <Bell unreadCount={unread} onPress={() => router.push("/notifications")} />
      ) : null}
      {pathname !== "/profile" ? (
        <Pressable
          onPress={() => router.push("/profile")}
          accessibilityLabel="Profile"
          accessibilityRole="button"
          hitSlop={8}
          style={({ pressed }) => [s.ghost, pressed && { opacity: 0.7 }]}
        >
          <UserRound size={20} color="#ffffff" />
        </Pressable>
      ) : null}
    </View>
  );
}

const useStyles = () => {
  const { palette } = useTheme();
  return useMemo(() => {
    const t = palette;
    return StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.sm,
  },
  ghost: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    position: "absolute",
    top: 7,
    right: 7,
    width: 7,
    height: 7,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: "#0e7490",
  },
});
  }, [palette]);
};
