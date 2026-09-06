// mobile/src/components/GradientHeader.tsx
import { View, Text, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { tokens } from "@/theme/tokens";

export function GradientHeader({
  title, subtitle, children, right,
}: {
  title: string; subtitle?: string; children?: React.ReactNode; right?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <LinearGradient
      colors={["#0891b2", "#0e7490", "#155e75"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={[s.wrap, { paddingTop: insets.top + 8 }]}
    >
      <View style={s.row}>
        <View style={s.logo}><Text style={s.logoTxt}>N</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>{title}</Text>
          {subtitle ? <Text style={s.sub}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
      {children}
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  wrap: {
    paddingHorizontal: tokens.space.lg,
    paddingBottom: tokens.space.lg,
    borderBottomLeftRadius: tokens.radius.lg,
    borderBottomRightRadius: tokens.radius.lg,
  },
  row: { flexDirection: "row", alignItems: "center", gap: tokens.space.md },
  logo: {
    width: 34, height: 34, borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.white15, alignItems: "center", justifyContent: "center",
  },
  logoTxt: { color: "#fff", fontFamily: tokens.font.sansBold, fontSize: 15 },
  title: { color: "#fff", fontFamily: tokens.font.sansBold, fontSize: tokens.size.lg, letterSpacing: -0.2 },
  sub: { color: tokens.color.white30, fontFamily: tokens.font.sansMed, fontSize: tokens.size.xs },
});
