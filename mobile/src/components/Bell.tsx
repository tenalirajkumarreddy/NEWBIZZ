import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { tokens } from "@/theme/tokens";
import { Bell as BellIcon } from "lucide-react-native";

export function Bell({
  unreadCount, onPress,
}: {
  unreadCount: number;
  onPress: () => void;
}) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (unreadCount > 0) {
      opacity.value = withRepeat(withTiming(0.6, { duration: 700 }), -1, true);
    } else {
      opacity.value = 1;
    }
  }, [unreadCount, opacity]);

  const pulse = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Pressable onPress={onPress} hitSlop={11} style={s.hit}>
      <BellIcon size={22} color={tokens.color.ink2} />
      {unreadCount > 0 ? (
        <View style={s.badgeWrap}>
          <Animated.View style={[s.badge, pulse]}>
            <Text style={s.badgeTxt}>{unreadCount > 99 ? "99+" : unreadCount}</Text>
          </Animated.View>
        </View>
      ) : null}
    </Pressable>
  );
}

const s = StyleSheet.create({
  hit: {
    alignItems: "center",
    justifyContent: "center",
  },
  badgeWrap: {
    position: "absolute",
    top: -4,
    right: -6,
  },
  badge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: tokens.color.red,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeTxt: {
    color: "#ffffff",
    fontFamily: tokens.font.monoBold,
    fontSize: 9,
    lineHeight: 10,
    fontVariant: ["tabular-nums"],
  },
});
