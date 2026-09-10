import { Text, TextInput, View, StyleSheet } from "react-native";
import { tokens } from "@/theme/tokens";
import { useMemo } from "react";
import { useTheme } from "@/theme/ThemeContext";

export function parseMoney(txt: string): number {
  const n = Number(txt.trim().replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 0) return Number.NaN;
  return Math.round(n * 100) / 100;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function FieldInput({
  label, value, onChangeText, placeholder, money, multiline, accessibilityLabel,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  money?: boolean;
  multiline?: boolean;
  accessibilityLabel?: string;
}) {
  const { palette: t } = useTheme();
  const s = useStyles();
  return (
    <View style={s.wrap}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        style={[s.input, money && s.money, multiline && s.multiline]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={t.color.ink4}
        keyboardType={money ? "decimal-pad" : "default"}
        multiline={multiline}
        accessible
        accessibilityLabel={accessibilityLabel ?? label}
      />
    </View>
  );
}

const useStyles = () => {
  const { palette } = useTheme();
  return useMemo(() => {
    const t = palette;
    return StyleSheet.create({
  wrap: { gap: 6 },
  label: {
    color: t.color.ink3,
    fontFamily: tokens.font.sansSemi,
    fontSize: tokens.size.eyebrow,
    letterSpacing: 0.4,
  },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: t.color.line,
    borderRadius: tokens.radius.md,
    backgroundColor: t.color.surface,
    paddingHorizontal: tokens.space.md,
    paddingVertical: 10,
    color: t.color.ink,
    fontFamily: tokens.font.sansMed,
    fontSize: tokens.size.sm,
  },
  money: {
    fontFamily: tokens.font.mono,
    fontVariant: ["tabular-nums"],
  },
  multiline: { minHeight: 72, textAlignVertical: "top" },
});
  }, [palette]);
};
