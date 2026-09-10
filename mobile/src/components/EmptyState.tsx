import { View, Text, StyleSheet, Pressable } from "react-native";
import { tokens } from "@/theme/tokens";
import { PackageOpen } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { useMemo } from "react";
import { useTheme } from "@/theme/ThemeContext";

/**
 * Empty state card for lists/screens with no content.
 *
 * Prop contract (per Task 4 spec, downstream consumers):
 * - `actionLabel?: string` — label of the optional action button.
 * - `onAction?: () => void` — callback fired when the action button is pressed.
 * The action button renders only when both `actionLabel` and `onAction` are provided.
 */
export function EmptyState({
  icon: Icon = PackageOpen,
  title,
  message,
  actionLabel,
  onAction,
}: {
  icon?: LucideIcon;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { palette: t } = useTheme();
  const s = useStyles();
  return (
    <View style={s.card}>
      <View style={s.circle}>
        <Icon size={24} color={t.color.ink4} />
      </View>
      <Text style={s.title}>{title}</Text>
      {message ? <Text style={s.msg}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          style={({ pressed }) => [s.btn, pressed && { opacity: 0.85 }]}
        >
          <Text style={s.btnTxt}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const useStyles = () => {
  const { palette } = useTheme();
  return useMemo(() => {
    const t = palette;
    return StyleSheet.create({
  card: {
    backgroundColor: t.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: t.color.line,
    padding: tokens.space.xl,
    alignItems: "center",
  },
  circle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: t.color.fill,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: t.color.ink,
    fontFamily: tokens.font.sansSemi,
    fontSize: tokens.size.sm,
    marginTop: tokens.space.md,
    textAlign: "center",
  },
  msg: {
    color: t.color.ink3,
    fontFamily: tokens.font.sans,
    fontSize: tokens.size.xs,
    marginTop: tokens.space.xs,
    textAlign: "center",
    lineHeight: 17,
  },
  btn: {
    minHeight: 44,
    paddingHorizontal: tokens.space.lg,
    borderRadius: tokens.radius.md,
    backgroundColor: t.color.brand,
    alignItems: "center",
    justifyContent: "center",
    marginTop: tokens.space.lg,
  },
  btnTxt: {
    color: t.color.surface,
    fontFamily: tokens.font.sansSemi,
    fontSize: tokens.size.xs,
  },
});
  }, [palette]);
};
