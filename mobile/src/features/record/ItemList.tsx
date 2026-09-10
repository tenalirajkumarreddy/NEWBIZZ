import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput } from "react-native";
import { Minus, Plus, PackageOpen } from "lucide-react-native";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonRows } from "@/components/SkeletonRows";
import { moneyINR } from "@/lib/format";
import { tokens } from "@/theme/tokens";
import type { SellableItem } from "@/data/catalog";

const MAX_QTY = 999_999;

export function effectivePrice(item: SellableItem | undefined, qty: number): number {
  if (!item) return 0;
  const rows = item.priceLists;
  if (!rows || rows.length === 0) return item.defaultPrice;
  const eligible = rows.filter((r) => qty >= r.minQty);
  if (eligible.length === 0) return rows[0].price;
  return eligible.reduce((best, r) => (r.minQty > best.minQty ? r : best), eligible[0]).price;
}

function fmtQty(n: number): string {
  return String(Math.round(n * 100) / 100);
}

export function ItemList({
  items, qtyByItem, priceOverride, onQty, loading, errorText,
}: {
  items: SellableItem[];
  qtyByItem: Record<string, number>;
  priceOverride: Record<string, number>;
  onQty: (itemId: string, qty: number) => void;
  loading: boolean;
  errorText: string | null;
}) {
  if (loading) return <SkeletonRows rows={6} />;
  if (errorText) return <EmptyState title="Could not load items" message={errorText} />;
  if (items.length === 0) {
    return (
      <EmptyState
        icon={PackageOpen}
        title="No sellable items"
        message="Ask your manager to add items to the catalog."
      />
    );
  }
  return (
    <View style={s.list}>
      {items.map((item) => (
        <ItemRow
          key={item.id}
          item={item}
          qty={qtyByItem[item.id] ?? 0}
          override={priceOverride[item.id]}
          onQty={onQty}
        />
      ))}
    </View>
  );
}

function ItemRow({
  item, qty, override, onQty,
}: {
  item: SellableItem;
  qty: number;
  override: number | undefined;
  onQty: (itemId: string, qty: number) => void;
}) {
  const price = override ?? effectivePrice(item, qty);
  const selected = qty > 0;
  const [txt, setTxt] = useState(qty > 0 ? fmtQty(qty) : "");

  useEffect(() => {
    const parsed = Number(txt.trim());
    if (!(Number.isFinite(parsed) && parsed === qty)) {
      setTxt(qty > 0 ? fmtQty(qty) : "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qty]);

  function commit(t: string) {
    setTxt(t);
    const n = Number(t.trim());
    if (!Number.isFinite(n) || n < 0) return;
    onQty(item.id, Math.min(n, MAX_QTY));
  }

  return (
    <View style={[s.row, selected && s.rowOn]}>
      <View style={s.rowMain}>
        <Text style={s.name} numberOfLines={1}>{item.name}</Text>
        <View style={s.meta}>
          <Text style={s.sku} numberOfLines={1}>{item.sku}</Text>
          <Text style={s.dot}>·</Text>
          <Text style={s.price}>{moneyINR(price)}</Text>
          {item.unit ? <Text style={s.unit}> / {item.unit}</Text> : null}
        </View>
      </View>      {selected ? (
        <Text style={s.lineTotal}>{moneyINR(qty * price)}</Text>
      ) : (
        <Pressable
          onPress={() => onQty(item.id, 1)}
          accessibilityLabel={`Add ${item.name}`}
          style={({ pressed }) => [s.addBtn, pressed && { opacity: 0.8 }]}
        >
          <Plus size={16} color={tokens.color.brand} />
        </Pressable>
      )}
      {selected ? (
        <View style={s.stepper}>
          <Pressable
            onPress={() => onQty(item.id, Math.max(0, qty - 1))}
            accessibilityLabel={`Decrease ${item.name}`}
            style={({ pressed }) => [s.stepBtn, pressed && { opacity: 0.8 }]}
          >
            <Minus size={15} color={tokens.color.ink2} />
          </Pressable>
          <TextInput
            style={s.stepInput}
            value={txt}
            onChangeText={commit}
            keyboardType="decimal-pad"
            inputMode="decimal"
            accessible
            accessibilityLabel={`Quantity for ${item.name}`}
          />
          <Pressable
            onPress={() => onQty(item.id, Math.min(qty + 1, MAX_QTY))}
            accessibilityLabel={`Increase ${item.name}`}
            style={({ pressed }) => [s.stepBtn, pressed && { opacity: 0.8 }]}
          >
            <Plus size={15} color={tokens.color.brand} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  list: { gap: tokens.space.sm },
  row: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: "rgba(226,232,240,0.6)",
    padding: tokens.space.md,
    gap: tokens.space.sm,
    ...tokens.shadow.card,
  },
  rowOn: { borderColor: tokens.color.brand, backgroundColor: tokens.color.brandWash },
  rowMain: { flexDirection: "row", alignItems: "center", gap: tokens.space.md },
  name: { color: tokens.color.ink, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.sm },
  meta: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2, flexWrap: "wrap" },
  sku: { color: tokens.color.ink4, fontFamily: tokens.font.mono, fontSize: tokens.size.eyebrow },
  dot: { color: tokens.color.ink4, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow },
  price: { color: tokens.color.ink2, fontFamily: tokens.font.mono, fontSize: tokens.size.eyebrow },
  unit: { color: tokens.color.ink4, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow },
  lineTotal: {
    color: tokens.color.ink,
    fontFamily: tokens.font.monoBold,
    fontSize: tokens.size.sm,
    fontVariant: ["tabular-nums"],
    alignSelf: "flex-end",
  },
  addBtn: {
    width: 44, height: 44, borderRadius: tokens.radius.md,
    borderWidth: 1, borderColor: tokens.color.line,
    backgroundColor: tokens.color.surface,
    alignItems: "center", justifyContent: "center",
    alignSelf: "flex-end",
  },
  stepper: { flexDirection: "row", alignItems: "center", gap: tokens.space.xs, alignSelf: "flex-end" },
  stepBtn: {
    width: 44, height: 44, borderRadius: tokens.radius.md,
    borderWidth: 1, borderColor: tokens.color.line,
    backgroundColor: tokens.color.surface,
    alignItems: "center", justifyContent: "center",
  },
  stepInput: {
    width: 64, height: 44,
    borderWidth: 1, borderColor: tokens.color.line,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.surface,
    textAlign: "center",
    color: tokens.color.ink,
    fontFamily: tokens.font.mono,
    fontSize: tokens.size.sm,
    paddingVertical: 0,
  },
});
