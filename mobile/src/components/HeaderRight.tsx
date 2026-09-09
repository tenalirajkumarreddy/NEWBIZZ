import { View, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import * as Network from "expo-network";
import { Wifi, WifiOff, UserRound } from "lucide-react-native";
import { Bell } from "@/components/Bell";
import { useUnreadCount } from "@/data/notifications";
import { tokens } from "@/theme/tokens";

/**
 * Gradient-header actions: internet state, notifications, profile.
 * Ghost buttons - no background, white icons that sit on the gradient.
 */
export function HeaderRight() {
  const router = useRouter();
  const { data: unread = 0 } = useUnreadCount();
  const state = Network.useNetworkState();
  const online = state.isConnected !== false && state.isInternetReachable !== false;

  return (
    <View style={s.row}>
      <Pressable
        onPress={() => router.push("/profile")}
        accessibilityLabel={online ? "Online" : "Offline"}
        accessibilityRole="button"
        hitSlop={8}
        style={({ pressed }) => [s.ghost, pressed && { opacity: 0.7 }]}
      >
        {online ? <Wifi size={19} color="#ffffff" /> : <WifiOff size={19} color="#fecaca" />}
        {!online ? <View style={[s.dot, { backgroundColor: tokens.color.red }]} /> : null}
      </Pressable>
      <Bell unreadCount={unread} onPress={() => router.push("/notifications")} />
      <Pressable
        onPress={() => router.push("/profile")}
        accessibilityLabel="Profile"
        accessibilityRole="button"
        hitSlop={8}
        style={({ pressed }) => [s.ghost, pressed && { opacity: 0.7 }]}
      >
        <UserRound size={20} color="#ffffff" />
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
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
