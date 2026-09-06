import { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { tokens } from "@/theme/tokens";

export function SkeletonRows({ rows = 3 }: { rows?: number }) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.4, { duration: 700 }), -1, true);
    return () => {
      cancelAnimation(opacity);
    };
  }, [opacity]);

  const pulse = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <View style={s.wrap}>
      {Array.from({ length: rows }).map((_, i) => (
        <Animated.View key={i} style={[s.row, pulse]} />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: tokens.space.sm },
  row: {
    height: 12,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.color.lineSoft,
    width: "100%",
  },
});
