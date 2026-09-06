import { View, Text, StyleSheet, Pressable } from "react-native";
import { tokens } from "@/theme/tokens";
import { PackageOpen } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";

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
  return (
    <View style={s.card}>
      <View style={s.circle}>
        <Icon size={24} color={tokens.color.ink4} />
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

const s = StyleSheet.create({
  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: tokens.color.line,
    padding: tokens.space.xl,
    alignItems: "center",
  },
  circle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: tokens.color.fill,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: tokens.color.ink,
    fontFamily: tokens.font.sansSemi,
    fontSize: tokens.size.sm,
    marginTop: tokens.space.md,
    textAlign: "center",
  },
  msg: {
    color: tokens.color.ink3,
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
    backgroundColor: tokens.color.brand,
    alignItems: "center",
    justifyContent: "center",
    marginTop: tokens.space.lg,
  },
  btnTxt: {
    color: tokens.color.surface,
    fontFamily: tokens.font.sansSemi,
    fontSize: tokens.size.xs,
  },
});
