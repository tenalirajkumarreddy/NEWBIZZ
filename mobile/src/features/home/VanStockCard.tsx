import { View, Text, StyleSheet } from "react-native";
import { Package } from "lucide-react-native";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonRows } from "@/components/SkeletonRows";
import { useStockHoldings } from "@/data/holdings";
import { moneyCompact } from "@/lib/format";
import { tokens } from "@/theme/tokens";
import { useMemo } from "react";
import { useTheme } from "@/theme/ThemeContext";

export function VanStockCard() {
  const { palette: t } = useTheme();
  const s = useStyles();
  const { data, isLoading, isError } = useStockHoldings();
  const rows = data ?? [];
  const units = rows.reduce((sum, h) => sum + h.qty, 0);
  const value = rows.reduce((sum, h) => sum + h.qty * h.avgCost, 0);

  return (
    <View style={s.card}>
      <View style={s.head}>
        <View style={s.chip}>
          <Package size={13} color={t.color.brand} />
        </View>
        <Text style={s.title}>Van stock</Text>
      </View>

      {isLoading ? (
        <View style={s.body}>
          <SkeletonRows rows={3} />
        </View>
      ) : isError ? (
        <Text style={s.err}>Could not load van stock — pull down to retry</Text>
      ) : (data?.length ?? 0) === 0 ? (
        <View style={s.body}>
          <EmptyState
            icon={Package}
            title="Van is empty"
            message="No stock assigned to you yet. Check back after the next handover."
          />
        </View>
      ) : (
        <>
          <View style={s.tiles}>
            <View style={s.tile}>
              <Text style={s.tileLabel}>PRODUCTS</Text>
              <Text style={s.tileVal}>{rows.length}</Text>
            </View>
            <View style={s.tile}>
              <Text style={s.tileLabel}>UNITS</Text>
              <Text style={s.tileVal}>{units}</Text>
            </View>
            <View style={s.tile}>
              <Text style={s.tileLabel}>VALUE</Text>
              <Text style={s.tileVal}>{moneyCompact(value)}</Text>
            </View>
          </View>
          <View style={s.list}>
            {rows.slice(0, 4).map((h) => (
              <View key={h.itemId} style={s.row}>
                <View style={s.rowTxt}>
                  <Text style={s.name} numberOfLines={1}>{h.itemName ?? "Item"}</Text>
                  {h.sku ? <Text style={s.sku}>{h.sku}</Text> : null}
                </View>
                <View style={s.rowRight}>
                  <Text style={s.val}>{moneyCompact(h.qty * h.avgCost)}</Text>
                  <Text style={s.qty}>{h.qty}</Text>
                </View>
              </View>
            ))}
            {rows.length > 4 ? (
              <Text style={s.more}>+{rows.length - 4} more</Text>
            ) : null}
          </View>
        </>
      )}
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
    borderColor: t.color.line,
    padding: tokens.space.lg,
    ...t.shadow.card,
  },
  head: { flexDirection: "row", alignItems: "center", gap: tokens.space.sm },
  chip: {
    width: 26, height: 26, borderRadius: tokens.radius.sm,
    backgroundColor: t.color.brandWash, alignItems: "center", justifyContent: "center",
  },
  title: { color: t.color.ink, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.sm, flex: 1 },
  tiles: { flexDirection: "row", gap: tokens.space.sm, marginTop: tokens.space.lg },
  tile: {
    flex: 1, backgroundColor: t.color.fill,
    borderRadius: tokens.radius.md, padding: tokens.space.sm,
  },
  tileLabel: {
    color: t.color.ink4, fontFamily: tokens.font.sansSemi,
    fontSize: 9, letterSpacing: 0.6,
  },
  tileVal: {
    color: t.color.ink, fontFamily: tokens.font.monoBold,
    fontSize: tokens.size.sm, marginTop: 2, fontVariant: ["tabular-nums"],
  },
  body: { marginTop: tokens.space.lg },
  list: { marginTop: tokens.space.md, gap: tokens.space.sm },
  row: { flexDirection: "row", alignItems: "center" },
  rowRight: { flexDirection: "row", alignItems: "center", gap: tokens.space.sm },
  val: {
    color: t.color.ink2, fontFamily: tokens.font.mono,
    fontSize: tokens.size.xs, fontVariant: ["tabular-nums"],
  },
  rowTxt: { flex: 1, marginRight: tokens.space.md },
  name: { color: t.color.ink, fontFamily: tokens.font.sansMed, fontSize: tokens.size.xs },
  sku: {
    color: t.color.ink4, fontFamily: tokens.font.mono,
    fontSize: 10, marginTop: 1,
  },
  qty: {
    color: t.color.ink, fontFamily: tokens.font.monoBold, fontSize: tokens.size.sm,
    backgroundColor: t.color.fill, borderRadius: tokens.radius.sm,
    paddingHorizontal: tokens.space.sm, paddingVertical: 3,
    overflow: "hidden", fontVariant: ["tabular-nums"],
  },
  more: {
    color: t.color.ink4, fontFamily: tokens.font.sans,
    fontSize: tokens.size.eyebrow, marginTop: 2,
  },
  err: {
    color: t.color.ink3, fontFamily: tokens.font.sans,
    fontSize: tokens.size.xs, marginTop: tokens.space.md,
  },
});
  }, [palette]);
};
