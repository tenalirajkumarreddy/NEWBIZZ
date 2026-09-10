import { View, Text, StyleSheet } from "react-native";
import { tokens } from "@/theme/tokens";
import { useMemo } from "react";
import { useTheme } from "@/theme/ThemeContext";

export function StatusBadge({
  label, tone = "neutral", dot = false,
}: {
  label: string; tone?: "neutral" | "brand" | "grn" | "amb" | "red"; dot?: boolean;
}) {
  const { palette: t } = useTheme();
  const s = useStyles();
  const bg = {
    neutral: t.color.fill,
    brand: t.color.brandWash,
    grn: t.color.grnWash,
    amb: t.color.ambWash,
    red: t.color.redWash,
  }[tone];
  const fg = {
    neutral: t.color.ink3,
    brand: t.color.brand,
    grn: t.color.grn,
    amb: t.color.amb,
    red: t.color.red,
  }[tone];
  return (
    <View style={[s.pill, { backgroundColor: bg }]}>
      {dot ? <View style={[s.dot, { backgroundColor: fg }]} /> : null}
      <Text style={[s.txt, { color: fg }]}>{label}</Text>
    </View>
  );
}

const useStyles = () => {
  const { palette } = useTheme();
  return useMemo(() => {
    const t = palette;
    return StyleSheet.create({
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
  }, [palette]);
};
