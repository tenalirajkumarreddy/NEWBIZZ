import { View, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Bell } from "@/components/Bell";
import { ConnectivityPill } from "@/components/ConnectivityPill";
import { useUnreadCount } from "@/data/notifications";
import { tokens } from "@/theme/tokens";

export function HeaderRight() {
  const router = useRouter();
  const { data: unread = 0 } = useUnreadCount();

  return (
    <View style={s.row}>
      <ConnectivityPill />
      <Bell unreadCount={unread} onPress={() => router.push("/notifications")} />
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.md,
  },
});
