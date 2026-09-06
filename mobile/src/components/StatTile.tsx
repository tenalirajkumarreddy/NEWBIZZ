import { View, Text, StyleSheet } from "react-native";
import { tokens } from "@/theme/tokens";
import type { LucideIcon } from "lucide-react-native";

export function StatTile({
  label, value, delta, tone = "brand", icon: Icon,
}: {
  label: string; value: string; delta?: string;
  tone?: "brand" | "grn" | "amb" | "red"; icon?: LucideIcon;
}) {
  const wash = { brand: tokens.color.brandWash, grn: tokens.color.grnWash, amb: tokens.color.ambWash, red: tokens.color.redWash }[tone];
  const fg = { brand: tokens.color.brand, grn: tokens.color.grn, amb: tokens.color.amb, red: tokens.color.red }[tone];
  return (
    <View style={s.card}>
      <View style={s.head}>
        <Text style={s.label}>{label.toUpperCase()}</Text>
        {Icon ? (
          <View style={[s.chip, { backgroundColor: wash }]}>
            <Icon size={13} color={fg} />
          </View>
        ) : null}
      </View>
      <Text style={s.value}>{value}</Text>
      {delta ? <Text style={[s.delta, { color: delta.startsWith("▲") ? tokens.color.grn : delta.startsWith("▼") ? tokens.color.red : tokens.color.ink4 }]}>{delta}</Text> : null}
    </View>
  );
}
const s = StyleSheet.create({
  card: {
    flex: 1, backgroundColor: tokens.color.surface, borderRadius: tokens.radius.lg,
    borderWidth: 1, borderColor: "rgba(226,232,240,0.6)", padding: tokens.space.md,
    ...tokens.shadow.card,
  },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  label: { color: tokens.color.ink4, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.eyebrow, letterSpacing: 0.6 },
  chip: { width: 26, height: 26, borderRadius: tokens.radius.sm, alignItems: "center", justifyContent: "center" },
  value: { color: tokens.color.ink, fontFamily: tokens.font.monoBold, fontSize: tokens.size.xl, marginTop: 4, fontVariant: ["tabular-nums"] },
  delta: { fontFamily: tokens.font.sansSemi, fontSize: 11, marginTop: 2 },
});
