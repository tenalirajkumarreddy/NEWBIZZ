import { View, Text, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Wallet } from "lucide-react-native";
import { SkeletonRows } from "@/components/SkeletonRows";
import { useTodayKpis, useTodaySplit } from "@/data/sales";
import { moneyCompact } from "@/lib/format";
import { tokens } from "@/theme/tokens";

export function RevenueCard() {
  const kpis = useTodayKpis();
  const split = useTodaySplit();

  if (kpis.isLoading || split.isLoading) {
    return (
      <View style={s.skeletonWrap}>
        <SkeletonRows rows={2} />
      </View>
    );
  }

  const sales = kpis.data?.salesTotal ?? 0;
  const collected = kpis.data?.collectedTotal ?? 0;
  const cash = split.data?.cash ?? 0;
  const upi = split.data?.upi ?? 0;
  const errored = kpis.isError || split.isError;

  return (
    <LinearGradient
      colors={["#0891b2", "#0e7490"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={s.card}
    >
      <View style={s.head}>
        <View style={s.chip}>
          <Wallet size={13} color="#ffffff" />
        </View>
        <Text style={s.eyebrow}>TODAY&apos;S REVENUE</Text>
      </View>

      <View style={s.cols}>
        <View style={s.col}>
          <Text style={s.colLabel}>Sales</Text>
          <Text style={s.colValue}>{moneyCompact(sales)}</Text>
        </View>
        <View style={s.divider} />
        <View style={s.col}>
          <Text style={s.colLabel}>Collected</Text>
          <Text style={s.colValue}>{moneyCompact(collected)}</Text>
        </View>
      </View>

      <View style={s.legend}>
        <View style={s.legendItem}>
          <View style={[s.dot, { backgroundColor: "#6ee7b7" }]} />
          <Text style={s.legendTxt}>Cash {moneyCompact(cash)}</Text>
        </View>
        <View style={s.legendItem}>
          <View style={[s.dot, { backgroundColor: "#ffffff" }]} />
          <Text style={s.legendTxt}>UPI {moneyCompact(upi)}</Text>
        </View>
      </View>

      {errored ? <Text style={s.err}>Could not load — pull down to retry</Text> : null}
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  card: {
    borderRadius: tokens.radius.lg,
    padding: tokens.space.lg,
    ...tokens.shadow.pop,
  },
  skeletonWrap: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: "rgba(226,232,240,0.6)",
    padding: tokens.space.lg,
    ...tokens.shadow.card,
  },
  head: { flexDirection: "row", alignItems: "center", gap: tokens.space.sm },
  chip: {
    width: 24, height: 24, borderRadius: tokens.radius.sm,
    backgroundColor: tokens.color.white15, alignItems: "center", justifyContent: "center",
  },
  eyebrow: {
    color: tokens.color.white30, fontFamily: tokens.font.sansSemi,
    fontSize: tokens.size.eyebrow, letterSpacing: 0.8,
  },
  cols: { flexDirection: "row", alignItems: "center", marginTop: tokens.space.lg },
  col: { flex: 1 },
  colLabel: {
    color: tokens.color.white30, fontFamily: tokens.font.sansSemi,
    fontSize: tokens.size.xs,
  },
  colValue: {
    color: "#ffffff", fontFamily: tokens.font.monoBold, fontSize: tokens.size.xxl,
    marginTop: 2, fontVariant: ["tabular-nums"],
  },
  divider: { width: 1, height: 34, backgroundColor: tokens.color.white15, marginHorizontal: tokens.space.lg },
  legend: { flexDirection: "row", gap: tokens.space.lg, marginTop: tokens.space.lg },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  legendTxt: {
    color: tokens.color.white30, fontFamily: tokens.font.sansMed,
    fontSize: tokens.size.xs, fontVariant: ["tabular-nums"],
  },
  err: {
    color: tokens.color.white30, fontFamily: tokens.font.sans,
    fontSize: tokens.size.eyebrow, marginTop: tokens.space.sm,
  },
});
