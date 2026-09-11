import { View, Text, StyleSheet } from "react-native";
import { tokens } from "@/theme/tokens";
import type { LucideIcon } from "lucide-react-native";
import { useMemo } from "react";
import { useTheme } from "@/theme/ThemeContext";

export function StatTile({
  label, value, delta, tone = "brand", icon: Icon, valueColor,
}: {
  label: string; value: string; delta?: string;
  tone?: "brand" | "grn" | "amb" | "red"; icon?: LucideIcon;
  /** Overrides the value text color (e.g. debt-direction convention). */
  valueColor?: string;
}) {
  const { palette: t } = useTheme();
  const s = useStyles();
  const wash = { brand: t.color.brandWash, grn: t.color.grnWash, amb: t.color.ambWash, red: t.color.redWash }[tone];
  const fg = { brand: t.color.brand, grn: t.color.grn, amb: t.color.amb, red: t.color.red }[tone];
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
      <Text
        style={[s.value, valueColor ? { color: valueColor } : null]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
      >
        {value}
      </Text>
      {delta ? <Text style={[s.delta, { color: delta.startsWith("▲") ? t.color.grn : delta.startsWith("▼") ? t.color.red : t.color.ink4 }]}>{delta}</Text> : null}
    </View>
  );
}
const useStyles = () => {
  const { palette } = useTheme();
  return useMemo(() => {
    const t = palette;
    return StyleSheet.create({
  card: {
    flex: 1, backgroundColor: t.color.surface, borderRadius: tokens.radius.lg,
    borderWidth: 1, borderColor: t.color.line, padding: tokens.space.md,
    ...t.shadow.card,
  },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  label: { color: t.color.ink4, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.eyebrow, letterSpacing: 0.6 },
  chip: { width: 26, height: 26, borderRadius: tokens.radius.sm, alignItems: "center", justifyContent: "center" },
  value: { color: t.color.ink, fontFamily: tokens.font.monoBold, fontSize: tokens.size.xl, marginTop: 4, fontVariant: ["tabular-nums"] },
  delta: { fontFamily: tokens.font.sansSemi, fontSize: 11, marginTop: 2 },
});
  }, [palette]);
};
