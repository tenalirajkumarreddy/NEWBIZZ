import { View, Text, StyleSheet } from "react-native";
import { tokens } from "@/theme/tokens";

export function StatusBadge({
  label, tone = "neutral", dot = false,
}: {
  label: string; tone?: "neutral" | "brand" | "grn" | "amb" | "red"; dot?: boolean;
}) {
  const bg = {
    neutral: tokens.color.fill,
    brand: tokens.color.brandWash,
    grn: tokens.color.grnWash,
    amb: tokens.color.ambWash,
    red: tokens.color.redWash,
  }[tone];
  const fg = {
    neutral: tokens.color.ink3,
    brand: tokens.color.brand,
    grn: tokens.color.grn,
    amb: tokens.color.amb,
    red: tokens.color.red,
  }[tone];
  return (
    <View style={[s.pill, { backgroundColor: bg }]}>
      {dot ? <View style={[s.dot, { backgroundColor: fg }]} /> : null}
      <Text style={[s.txt, { color: fg }]}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  dot: { width: 5, height: 5, borderRadius: 999 },
  txt: { fontFamily: tokens.font.sansSemi, fontSize: 11 },
});
