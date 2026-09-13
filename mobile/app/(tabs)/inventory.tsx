import { useMemo, useState } from "react";
import { View, Text, StyleSheet, TextInput } from "react-native";
import { useIsFetching } from "@tanstack/react-query";
import { Boxes, Search } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { GradientHeader } from "@/components/GradientHeader";
import { HeaderRight } from "@/components/HeaderRight";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonRows } from "@/components/SkeletonRows";
import { Sheet } from "@/components/Sheet";
import { useSession } from "@/lib/session";
import { roleLabel } from "@/lib/claims";
import { friendlyError } from "@/lib/rpc";
import { moneyINR, dateIST } from "@/lib/format";
import { useStockLevels, useStockLedger, type StockLevelRow } from "@/data/production";
import { PressCard } from "@/components/PressCard";
import { tokens } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeContext";

type StockRow = StockLevelRow & { branchName: string };

export default function InventoryScreen() {
  const s = useStyles();
  const { palette: t } = useTheme();
  const { claims } = useSession();
  const fetching = useIsFetching();
  const stock = useStockLevels();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<StockRow | null>(null);
  const ledger = useStockLedger(selected?.itemId ?? null);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return stock.data ?? [];
    return (stock.data ?? []).filter(
      (r) => r.itemName.toLowerCase().includes(needle) || r.itemSku.toLowerCase().includes(needle),
    );
  }, [stock.data, q]);

  return (
    <Screen refreshing={fetching > 0} onRefresh={() => void stock.refetch()}>
      <GradientHeader title="Inventory" subtitle={roleLabel(claims)} right={<HeaderRight />} />
      <View style={s.body}>
        <View style={s.search}>
          <Search size={15} color={t.color.ink4} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search item or SKU"
            placeholderTextColor={t.color.ink4}
            style={s.searchInput}
            accessibilityLabel="Search inventory"
          />
        </View>
        {stock.isLoading ? <SkeletonRows rows={8} />
          : stock.isError ? <EmptyState title="Could not load stock" message={friendlyError(stock.error)} />
          : rows.length === 0 ? <EmptyState title="No items" message={q ? "Nothing matches that search." : "Stock appears here once the office loads it."} />
          : rows.map((r) => {
            const low = r.reorderLevel > 0 && r.qtyOnHand <= r.reorderLevel;
            return (
              <PressCard key={`${r.itemId}-${r.branchName}`} onPress={() => setSelected(r)} style={s.row}>
                <View style={s.chip}>
                  <Boxes size={14} color={t.color.brand} />
                </View>
                <View style={s.texts}>
                  <Text style={s.name} numberOfLines={1}>{r.itemName}</Text>
                  <Text style={s.sub} numberOfLines={1}>
                    {r.itemSku} · {r.branchName}{r.reorderLevel > 0 ? ` · reorder at ${r.reorderLevel.toLocaleString("en-IN")}` : ""}
                  </Text>
                </View>
                <View style={s.right}>
                  <Text style={[s.qty, low && { color: t.color.red }]}>
                    {r.qtyOnHand.toLocaleString("en-IN")} {r.unit}
                  </Text>
                  {low ? <StatusBadge label="Low" tone="red" /> : null}
                </View>
              </PressCard>
            );
          })}
      </View>
      <Sheet visible={!!selected} onClose={() => setSelected(null)} title={selected?.itemName ?? "Item"}>
        {selected ? (
          <View style={s.sheetBody}>
            <SheetLine label="On hand" value={`${selected.qtyOnHand.toLocaleString("en-IN")} ${selected.unit}`} />
            <SheetLine label="Reorder level" value={selected.reorderLevel.toLocaleString("en-IN")} />
            <SheetLine label="Branch" value={selected.branchName} />
            <SheetLine label="Value" value={moneyINR(selected.qtyOnHand * selected.cost)} />
            <Text style={s.ledgerTitle}>Recent stock movements</Text>
            {ledger.isLoading ? <Text style={s.ledgerSub}>Loading…</Text>
              : ledger.isError ? <Text style={s.ledgerSub}>{friendlyError(ledger.error)}</Text>
              : (ledger.data ?? []).length === 0 ? <Text style={s.ledgerSub}>No movements yet.</Text>
              : (ledger.data ?? []).map((m) => (
                <View key={m.id} style={s.ledgerRow}>
                  <View style={s.texts}>
                    <Text style={s.name} numberOfLines={1}>{m.moveType.replace(/_/g, " ")}</Text>
                    <Text style={s.sub}>{m.branchName} · {dateIST(m.movedAt.slice(0, 10))}</Text>
                  </View>
                  <Text style={[s.qty, { color: m.qtyDelta >= 0 ? t.color.grn : t.color.ink }]}>
                    {m.qtyDelta >= 0 ? "+" : ""}{m.qtyDelta.toLocaleString("en-IN")}
                    <Text style={s.qtyAfter}> → {m.qtyAfter.toLocaleString("en-IN")}</Text>
                  </Text>
                </View>
              ))}
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}

function SheetLine({ label, value }: { label: string; value: string }) {
  const s = useStyles();
  return (
    <View style={s.ledgerRow}>
      <Text style={s.sub}>{label}</Text>
      <Text style={s.name}>{value}</Text>
    </View>
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
    search: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.space.sm,
      minHeight: 44,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: t.color.line,
      backgroundColor: t.color.surface,
      paddingHorizontal: tokens.space.md,
    },
    searchInput: {
      flex: 1,
      color: t.color.ink,
      fontFamily: tokens.font.sans,
      fontSize: tokens.size.xs,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.space.md,
      padding: tokens.space.md,
    },
    chip: {
      width: 28,
      height: 28,
      borderRadius: tokens.radius.sm,
      backgroundColor: t.color.brandWash,
      alignItems: "center",
      justifyContent: "center",
    },
    texts: { flex: 1, minWidth: 0 },
    name: { color: t.color.ink, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
    sub: { color: t.color.ink4, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow, marginTop: 1 },
    right: { alignItems: "flex-end", gap: tokens.space.xs },
    qty: {
      color: t.color.ink,
      fontFamily: tokens.font.monoBold,
      fontSize: tokens.size.xs,
      fontVariant: ["tabular-nums"],
      textAlign: "right",
    },
    sheetBody: { gap: tokens.space.xs, paddingBottom: tokens.space.xl },
    ledgerTitle: {
      color: t.color.ink3,
      fontFamily: tokens.font.sansSemi,
      fontSize: tokens.size.eyebrow,
      marginTop: tokens.space.md,
    },
    ledgerSub: { color: t.color.ink4, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow },
    ledgerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 34 },
    qtyAfter: { color: t.color.ink3 },
  });
};
