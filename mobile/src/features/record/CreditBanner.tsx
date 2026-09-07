import { View, Text, StyleSheet } from "react-native";
import { AlertTriangle, ShieldAlert } from "lucide-react-native";
import { moneyINR } from "@/lib/format";
import { tokens } from "@/theme/tokens";

export type CreditState =
  | { level: "none" }
  | { level: "loading" }
  | { level: "ok"; outstanding: number; limit: number }
  | { level: "warn"; outstanding: number; limit: number; after: number; pct: number }
  | { level: "exceeded"; outstanding: number; limit: number; after: number };

export function computeCreditState(
  limit: number,
  outstanding: number,
  cartTotal: number,
  collected: number,
): CreditState {
  if (!(limit > 0)) return { level: "none" };
  const after = outstanding + cartTotal - collected;
  if (after > limit) return { level: "exceeded", outstanding, limit, after };
  const pct = outstanding / limit;
  if (pct > 0.8) return { level: "warn", outstanding, limit, after, pct };
  return { level: "ok", outstanding, limit };
}

export function CreditBanner({ state }: { state: CreditState }) {
  if (state.level === "none" || state.level === "loading" || state.level === "ok") return null;

  if (state.level === "exceeded") {
    return (
      <View style={[s.banner, s.red]}>
        <ShieldAlert size={16} color={tokens.color.red} />
        <View style={s.txtWrap}>
          <Text style={[s.title, { color: tokens.color.red }]}>Credit limit exceeded</Text>
          <Text style={[s.msg, { color: tokens.color.red }]}>
            Outstanding {moneyINR(state.outstanding)} + this sale&apos;s credit portion would reach{" "}
            {moneyINR(state.after)} against a limit of {moneyINR(state.limit)}.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[s.banner, s.amber]}>
      <AlertTriangle size={16} color={tokens.color.amb} />
      <View style={s.txtWrap}>
        <Text style={[s.title, { color: tokens.color.amb }]}>Credit limit warning</Text>
        <Text style={[s.msg, { color: tokens.color.amb }]}>
          Outstanding is {Math.round(state.pct * 100)}% of the {moneyINR(state.limit)} limit.
        </Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  banner: {
    flexDirection: "row",
    gap: tokens.space.md,
    alignItems: "flex-start",
    borderRadius: tokens.radius.md,
    padding: tokens.space.md,
  },
  red: { backgroundColor: tokens.color.redWash },
  amber: { backgroundColor: tokens.color.ambWash },
  txtWrap: { flex: 1, gap: 2 },
  title: { fontFamily: tokens.font.sansSemi, fontSize: tokens.size.sm },
  msg: { fontFamily: tokens.font.sans, fontSize: tokens.size.xs, lineHeight: 17 },
});
