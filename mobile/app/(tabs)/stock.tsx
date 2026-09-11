import { View, Text, StyleSheet } from "react-native";
import { useIsFetching } from "@tanstack/react-query";
import { PackageOpen } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { GradientHeader } from "@/components/GradientHeader";
import { HeaderRight } from "@/components/HeaderRight";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonRows } from "@/components/SkeletonRows";
import { useSession } from "@/lib/session";
import { roleLabel } from "@/lib/claims";
import { friendlyError } from "@/lib/rpc";
import { useStockLevels } from "@/data/production";
import { useTheme } from "@/theme/ThemeContext";
import { tokens } from "@/theme/tokens";

export default function StockScreen() {
  const { claims } = useSession();
  const { palette: t } = useTheme();
  const s = useStyles();
  const stock = useStockLevels();
  const fetching = useIsFetching();

  const rows = stock.data ?? [];
  const fmt = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

  return (
    <Screen refreshing={fetching > 0} onRefresh={() => stock.refetch()}>
      <GradientHeader title="Stock" subtitle={roleLabel(claims)} right={<HeaderRight />} />
      <View style={s.body}>
        {stock.isLoading ? (
          <SkeletonRows rows={6} />
        ) : stock.isError ? (
          <EmptyState title="Could not load stock" message={friendlyError(stock.error)} />
        ) : rows.length === 0 ? (
          <EmptyState icon={PackageOpen} title="No stock" message="Stock levels will appear here." />
        ) : (
          <View style={s.card}>
            {rows.map((r, i) => {
              const low = r.reorderLevel > 0 && r.qtyOnHand <= r.reorderLevel;
              return (
                <View key={`${r.itemId}-${i}`} style={[s.row, i > 0 && s.rowLine]}>
                  <View style={s.main}>
                    <Text style={s.name} numberOfLines={1}>{r.itemName}</Text>
                    <Text style={s.sub} numberOfLines={1}>
                      {[r.itemSku, r.branchName].filter(Boolean).join(" · ")}
                    </Text>
                  </View>
                  <Text
                    style={[
                      s.qty,
                      { color: low ? t.color.red : r.qtyOnHand > 0 ? t.color.ink : t.color.ink4 },
                    ]}
                  >
                    {fmt(r.qtyOnHand)} {r.unit}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </Screen>
  );
}

const useStyles = () => {
  const { palette: t } = useTheme();
  return StyleSheet.create({
    body: {
      paddingHorizontal: tokens.space.lg,
      paddingTop: tokens.space.lg,
      gap: tokens.space.md,
    },
    card: {
      backgroundColor: t.color.surface,
      borderRadius: tokens.radius.lg,
      borderWidth: 1,
      borderColor: t.color.line,
      padding: tokens.space.md,
      ...tokens.shadow.card,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.space.md,
      minHeight: 48,
    },
    rowLine: { borderTopWidth: 1, borderTopColor: t.color.lineSoft },
    main: { flex: 1, minWidth: 0 },
    name: { color: t.color.ink, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
    sub: { color: t.color.ink4, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow, marginTop: 1 },
    qty: {
      fontFamily: tokens.font.monoBold,
      fontSize: tokens.size.xs,
      fontVariant: ["tabular-nums"],
    },
  });
};
