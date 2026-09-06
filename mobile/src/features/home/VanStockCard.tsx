import { View, Text, StyleSheet } from "react-native";
import { Package } from "lucide-react-native";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonRows } from "@/components/SkeletonRows";
import { useStockHoldings } from "@/data/holdings";
import { tokens } from "@/theme/tokens";

export function VanStockCard() {
  const { data, isLoading, isError } = useStockHoldings();

  return (
    <View style={s.card}>
      <View style={s.head}>
        <View style={s.chip}>
          <Package size={13} color={tokens.color.brand} />
        </View>
        <Text style={s.title}>Van stock</Text>
        {!isLoading && !isError && (data?.length ?? 0) > 0 ? (
          <Text style={s.count}>{data!.length} items</Text>
        ) : null}
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
        <View style={s.list}>
          {data!.slice(0, 4).map((h) => (
            <View key={h.itemId} style={s.row}>
              <View style={s.rowTxt}>
                <Text style={s.name} numberOfLines={1}>{h.itemName ?? "Item"}</Text>
                {h.sku ? <Text style={s.sku}>{h.sku}</Text> : null}
              </View>
              <Text style={s.qty}>{h.qty}</Text>
            </View>
          ))}
          {data!.length > 4 ? (
            <Text style={s.more}>+{data!.length - 4} more</Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: "rgba(226,232,240,0.6)",
    padding: tokens.space.lg,
    ...tokens.shadow.card,
  },
  head: { flexDirection: "row", alignItems: "center", gap: tokens.space.sm },
  chip: {
    width: 26, height: 26, borderRadius: tokens.radius.sm,
    backgroundColor: tokens.color.brandWash, alignItems: "center", justifyContent: "center",
  },
  title: { color: tokens.color.ink, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.sm, flex: 1 },
  count: {
    color: tokens.color.ink4, fontFamily: tokens.font.sansMed,
    fontSize: tokens.size.xs, fontVariant: ["tabular-nums"],
  },
  body: { marginTop: tokens.space.lg },
  list: { marginTop: tokens.space.md, gap: tokens.space.sm },
  row: { flexDirection: "row", alignItems: "center" },
  rowTxt: { flex: 1, marginRight: tokens.space.md },
  name: { color: tokens.color.ink, fontFamily: tokens.font.sansMed, fontSize: tokens.size.xs },
  sku: {
    color: tokens.color.ink4, fontFamily: tokens.font.mono,
    fontSize: 10, marginTop: 1,
  },
  qty: {
    color: tokens.color.ink, fontFamily: tokens.font.monoBold, fontSize: tokens.size.sm,
    backgroundColor: tokens.color.fill, borderRadius: tokens.radius.sm,
    paddingHorizontal: tokens.space.sm, paddingVertical: 3,
    overflow: "hidden", fontVariant: ["tabular-nums"],
  },
  more: {
    color: tokens.color.ink4, fontFamily: tokens.font.sans,
    fontSize: tokens.size.eyebrow, marginTop: 2,
  },
  err: {
    color: tokens.color.ink3, fontFamily: tokens.font.sans,
    fontSize: tokens.size.xs, marginTop: tokens.space.md,
  },
});
