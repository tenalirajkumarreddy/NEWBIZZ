import { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput } from "react-native";
import Toast from "react-native-toast-message";
import { Plus, Minus } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { GradientHeader } from "@/components/GradientHeader";
import { HeaderRight } from "@/components/HeaderRight";
import { SkeletonRows } from "@/components/SkeletonRows";
import { EmptyState } from "@/components/EmptyState";
import { StatusBadge } from "@/components/StatusBadge";
import { Sheet } from "@/components/Sheet";
import { DropdownSelect } from "@/components/DropdownSelect";
import { useSession } from "@/lib/session";
import { roleLabel } from "@/lib/claims";
import { moneyINR, moneyCompact, dateIST } from "@/lib/format";
import { friendlyError } from "@/lib/rpc";
import {
  usePortalOrders, usePortalStores, usePortalCatalog,
  createPortalOrder, usePortalInvalidate,
} from "@/data/portal";
import { tokens } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeContext";

const ORDER_TONE: Record<string, "grn" | "amb" | "brand" | "red" | "neutral"> = {
  pending: "amb", approved: "brand", converted: "grn", rejected: "red",
};

export default function CustomerOrders() {
  const s = useStyles();
  const t = useTheme().palette;
  const { claims } = useSession();
  const orders = usePortalOrders();
  const orderRows = orders.data ?? [];
  const stores = usePortalStores(false);
  const catalog = usePortalCatalog(false);
  const invalidate = usePortalInvalidate();

  const [open, setOpen] = useState(false);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);

  const storeOptions = useMemo(
    () => (stores.data ?? []).map((st) => ({ value: st.id, label: `${st.name}${st.city ? ` · ${st.city}` : ""}` })),
    [stores.data],
  );

  const lines = useMemo(
    () => (catalog.data ?? []).filter((it) => (qtys[it.id] ?? 0) > 0),
    [catalog.data, qtys],
  );
  const estTotal = lines.reduce((sum, l) => {
    const item = catalog.data?.find((c) => c.id === l.id);
    return sum + (item ? item.defaultPrice * (qtys[item.id] ?? 0) : 0);
  }, 0);

  function openSheet() {
    setStoreId(null);
    setNotes("");
    setQtys({});
    setOpen(true);
  }

  function setQty(id: string, q: number) {
    setQtys((prev) => ({ ...prev, [id]: Math.max(0, q) }));
  }

  async function submit() {
    if (!storeId || lines.length === 0 || busy) return;
    setBusy(true);
    try {
      await createPortalOrder({
        storeId,
        notes,
        lines: lines.map((l) => ({ item_id: l.id, qty: qtys[l.id] ?? 0 })),
      });
      Toast.show({ type: "success", text1: "Order sent", text2: "The office will confirm it shortly." });
      setOpen(false);
      invalidate();
    } catch (e) {
      Toast.show({ type: "error", text1: "Could not send order", text2: friendlyError(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen refreshing={orders.isFetching} onRefresh={() => void orders.refetch()}>
      <GradientHeader title="Orders" subtitle={roleLabel(claims)} right={<HeaderRight />} />
      <View style={s.body}>
        <Pressable
          onPress={openSheet}
          accessibilityRole="button"
          accessibilityLabel="New order"
          style={({ pressed }) => [s.newBtn, pressed && { opacity: 0.85 }]}
        >
          <Plus size={14} color={t.color.brand} />
          <Text style={s.newBtnTxt}>New order</Text>
        </Pressable>

        {orders.isLoading ? (
          <SkeletonRows rows={5} />
        ) : orders.isError ? (
          <EmptyState title="Could not load orders" message="Pull down to retry." />
        ) : orderRows.length === 0 ? (
          <EmptyState title="No orders yet" message="Tap New order to request stock for one of your stores." />
        ) : (
          <View style={s.list}>
            {orderRows.map((o) => (
              <View key={o.id} style={s.card}>
                <View style={s.row}>
                  <View style={s.main}>
                    <Text style={s.docNo}>{o.orderNo}</Text>
                    <Text style={s.sub} numberOfLines={1}>
                      {dateIST(o.orderDate)} · {o.storeName}
                    </Text>
                  </View>
                  <StatusBadge label={o.status} tone={ORDER_TONE[o.status] ?? "neutral"} />
                </View>
                {o.notes ? <Text style={s.notes} numberOfLines={2}>“{o.notes}”</Text> : null}
              </View>
            ))}
          </View>
        )}
      </View>

      <Sheet visible={open} onClose={() => setOpen(false)} title="New order">
        <View style={s.sheetBody}>
          {stores.isLoading || catalog.isLoading ? (
            <SkeletonRows rows={4} />
          ) : (
            <>
              <Text style={s.label}>DELIVER TO</Text>
              <DropdownSelect
                value={storeId}
                options={storeOptions}
                onChange={(v) => setStoreId(v)}
                placeholder="Select store"
                label="Store"
              />

              <Text style={s.label}>ITEMS</Text>
              <View style={s.itemList}>
                {(catalog.data ?? []).map((it) => {
                  const q = qtys[it.id] ?? 0;
                  return (
                    <View key={it.id} style={s.itemRow}>
                      <View style={s.itemMain}>
                        <Text style={s.itemName} numberOfLines={1}>{it.name}</Text>
                        <Text style={s.itemSub}>
                          {moneyCompact(it.defaultPrice)} · {it.qtyOnHand} in stock
                        </Text>
                      </View>
                      <View style={s.stepper}>
                        <Pressable
                          onPress={() => setQty(it.id, q - 1)}
                          accessibilityRole="button"
                          accessibilityLabel={`Decrease ${it.name}`}
                          style={({ pressed }) => [s.stepBtn, pressed && { opacity: 0.7 }]}
                        >
                          <Minus size={13} color={t.color.ink3} />
                        </Pressable>
                        <Text style={s.stepVal}>{q}</Text>
                        <Pressable
                          onPress={() => setQty(it.id, q + 1)}
                          accessibilityRole="button"
                          accessibilityLabel={`Increase ${it.name}`}
                          style={({ pressed }) => [s.stepBtn, pressed && { opacity: 0.7 }]}
                        >
                          <Plus size={13} color={t.color.ink3} />
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </View>

              <Text style={s.label}>NOTES (OPTIONAL)</Text>
              <TextInput
                style={s.input}
                value={notes}
                onChangeText={setNotes}
                placeholder="Delivery instructions…"
                placeholderTextColor={t.color.ink4}
                multiline
                accessible
                accessibilityLabel="Order notes"
              />

              <View style={s.totalRow}>
                <Text style={s.totalLabel}>ESTIMATED TOTAL</Text>
                <Text style={s.totalVal}>{moneyINR(estTotal)}</Text>
              </View>

              <Pressable
                onPress={() => void submit()}
                disabled={!storeId || lines.length === 0 || busy}
                accessibilityRole="button"
                accessibilityLabel="Submit order"
                style={({ pressed }) => [s.submitBtn, (!storeId || lines.length === 0 || busy || pressed) && { opacity: 0.5 }]}
              >
                <Text style={s.submitTxt}>{busy ? "Sending…" : "Send order"}</Text>
              </Pressable>
            </>
          )}
        </View>
      </Sheet>
    </Screen>
  );
}

const useStyles = () => {
  const t = useTheme().palette;
  return StyleSheet.create({
    body: { paddingHorizontal: tokens.space.lg, paddingTop: tokens.space.lg, gap: tokens.space.md },
    newBtn: {
      minHeight: 44,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: t.color.line,
      backgroundColor: t.color.surface,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
    },
    newBtnTxt: { fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs, color: t.color.ink },
    list: { gap: tokens.space.sm },
    card: {
      backgroundColor: t.color.surface,
      borderRadius: tokens.radius.lg,
      borderWidth: 1,
      borderColor: t.color.line,
      padding: tokens.space.md,
      gap: 6,
      ...tokens.shadow.card,
    },
    row: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: tokens.space.sm },
    main: { flex: 1, minWidth: 0, gap: 2 },
    docNo: { color: t.color.ink, fontFamily: tokens.font.monoBold, fontSize: tokens.size.xs, fontVariant: ["tabular-nums"] },
    sub: { color: t.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow },
    notes: { color: t.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow, fontStyle: "italic" },
    sheetBody: { gap: tokens.space.md, paddingBottom: tokens.space.md },
    label: { color: t.color.ink3, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.eyebrow, letterSpacing: 0.6 },
    itemList: { gap: tokens.space.xs, maxHeight: 280 },
    itemRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.space.sm,
      minHeight: 48,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.color.line,
    },
    itemMain: { flex: 1, minWidth: 0 },
    itemName: { color: t.color.ink, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
    itemSub: { color: t.color.ink4, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow },
    stepper: { flexDirection: "row", alignItems: "center", gap: tokens.space.sm },
    stepBtn: {
      width: 30,
      height: 30,
      borderRadius: tokens.radius.sm,
      borderWidth: 1,
      borderColor: t.color.line,
      backgroundColor: t.color.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    stepVal: { minWidth: 22, textAlign: "center", color: t.color.ink, fontFamily: tokens.font.mono, fontSize: tokens.size.xs },
    input: {
      minHeight: 72,
      borderWidth: 1,
      borderColor: t.color.line,
      borderRadius: tokens.radius.md,
      backgroundColor: t.color.surface,
      paddingHorizontal: tokens.space.md,
      paddingVertical: tokens.space.sm,
      color: t.color.ink,
      fontFamily: tokens.font.sans,
      fontSize: tokens.size.sm,
      textAlignVertical: "top",
    },
    totalRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingTop: tokens.space.xs,
    },
    totalLabel: { color: t.color.ink4, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.eyebrow, letterSpacing: 0.6 },
    totalVal: { color: t.color.ink, fontFamily: tokens.font.monoBold, fontSize: tokens.size.sm, fontVariant: ["tabular-nums"] },
    submitBtn: {
      minHeight: 48,
      borderRadius: tokens.radius.md,
      backgroundColor: t.color.brand,
      alignItems: "center",
      justifyContent: "center",
    },
    submitTxt: { color: "#ffffff", fontFamily: tokens.font.sansSemi, fontSize: tokens.size.sm },
  });
};
