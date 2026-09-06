import { useState } from "react";
import { View, Text, StyleSheet, Pressable, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import { PackageOpen } from "lucide-react-native";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonRows } from "@/components/SkeletonRows";
import { StatusBadge } from "@/components/StatusBadge";
import { useOrders, postInvoiceFromOrder, type OrderRow } from "@/data/sales";
import { qk } from "@/data/keys";
import { useSession } from "@/lib/session";
import { friendlyError } from "@/lib/rpc";
import { moneyINR } from "@/lib/format";
import { tokens } from "@/theme/tokens";

export const ORDER_CHIPS = [
  { key: "all", label: "All", status: undefined },
  { key: "confirmed", label: "Confirmed", status: "confirmed" },
  { key: "approved", label: "Approved", status: "approved" },
  { key: "fulfilled", label: "Fulfilled", status: "fulfilled" },
  { key: "cancelled", label: "Cancelled", status: "cancelled" },
] as const;

function orderTone(status: string): "neutral" | "brand" | "grn" | "amb" | "red" {
  switch (status) {
    case "fulfilled": return "grn";
    case "approved": return "brand";
    case "confirmed":
    case "partially_fulfilled": return "amb";
    case "cancelled": return "red";
    default: return "neutral";
  }
}

function orderTotal(o: OrderRow): number {
  return o.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
}

function ActionBtn({
  label, onPress, tone,
}: {
  label: string; onPress: () => void; tone: "brand" | "grn";
}) {
  const bg = tone === "brand" ? tokens.color.brandWash : tokens.color.grnWash;
  const fg = tone === "brand" ? tokens.color.brand : tokens.color.grn;
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      style={({ pressed }) => [s.actBtn, { backgroundColor: bg }, pressed && { opacity: 0.8 }]}
    >
      <Text style={[s.actTxt, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

function OrderCard({ order }: { order: OrderRow }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { can } = useSession();
  const [invoicing, setInvoicing] = useState(false);

  const total = orderTotal(order);
  const preview = order.lines.slice(0, 2);
  const moreCount = order.lines.length - preview.length;
  const canFulfill = (order.status === "confirmed" || order.status === "approved") && can("cashmemo.create");
  const canInvoice = order.status === "approved" && can("invoice.create");

  async function invoice() {
    if (invoicing) return;
    setInvoicing(true);
    try {
      const invoiceId = await postInvoiceFromOrder(order.id, true);
      await qc.invalidateQueries({ queryKey: ["orders"] });
      await qc.invalidateQueries({ queryKey: qk.today() });
      Toast.show({ type: "success", text1: "Invoice posted", text2: `#${invoiceId.slice(0, 8)}` });
    } catch (e) {
      Toast.show({ type: "error", text1: "Could not post invoice", text2: friendlyError(e) });
    } finally {
      setInvoicing(false);
    }
  }

  function confirmInvoice() {
    Alert.alert(
      "Post invoice?",
      `An official GST invoice will be raised for ${order.orderNo}.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Post invoice", onPress: () => void invoice() },
      ],
    );
  }

  return (
    <View style={s.card}>
      <View style={s.head}>
        <View style={s.headMain}>
          <Text style={s.orderNo}>{order.orderNo}</Text>
          <Text style={s.store} numberOfLines={1}>{order.storeName ?? "Unknown store"}</Text>
        </View>
        <StatusBadge label={order.status.replace(/_/g, " ")} tone={orderTone(order.status)} />
      </View>

      {preview.length > 0 ? (
        <View style={s.lines}>
          {preview.map((l, i) => (
            <Text key={`${l.itemId}-${i}`} style={s.line} numberOfLines={1}>
              {l.itemName ?? "Item"} x <Text style={s.mono}>{l.qty}</Text>
            </Text>
          ))}
          {moreCount > 0 ? <Text style={s.more}>+{moreCount} more</Text> : null}
        </View>
      ) : null}

      <View style={s.foot}>
        <Text style={s.total}>{moneyINR(total)}</Text>
        <View style={s.acts}>
          {canFulfill ? (
            <ActionBtn
              label="Fulfill"
              tone="brand"
              onPress={() => router.push(`/record?mode=sale&orderId=${order.id}&storeId=${order.storeId}`)}
            />
          ) : null}
          {canInvoice ? (
            <ActionBtn label={invoicing ? "Posting..." : "Invoice"} tone="grn" onPress={confirmInvoice} />
          ) : null}
        </View>
      </View>
    </View>
  );
}

export function OrdersView() {
  const [chip, setChip] = useState<string>("all");
  const activeChip = ORDER_CHIPS.find((c) => c.key === chip) ?? ORDER_CHIPS[0];
  const orders = useOrders(activeChip.status);

  return (
    <View style={s.wrap}>
      <View style={s.chipsRow}>
        {ORDER_CHIPS.map((c) => {
          const selected = c.key === chip;
          return (
            <Pressable
              key={c.key}
              onPress={() => setChip(c.key)}
              accessibilityLabel={`Filter orders: ${c.label}`}
              style={({ pressed }) => [
                s.chip,
                selected && s.chipOn,
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={[s.chipTxt, selected && s.chipTxtOn]}>{c.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {orders.isError ? (
        <EmptyState title="Could not load orders" message={friendlyError(orders.error)} />
      ) : orders.isLoading ? (
        <SkeletonRows rows={4} />
      ) : (orders.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={PackageOpen}
          title="No orders"
          message="Orders in this status will appear here."
        />
      ) : (
        orders.data!.map((o) => <OrderCard key={o.id} order={o} />)
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: tokens.space.md },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: tokens.space.sm },
  chip: {
    minHeight: 44,
    paddingHorizontal: tokens.space.md,
    borderRadius: tokens.radius.full,
    borderWidth: 1,
    borderColor: tokens.color.line,
    backgroundColor: tokens.color.surface,
    alignItems: "center", justifyContent: "center",
  },
  chipOn: { backgroundColor: tokens.color.brand, borderColor: tokens.color.brand },
  chipTxt: { color: tokens.color.ink2, fontFamily: tokens.font.sansMed, fontSize: tokens.size.xs },
  chipTxtOn: { color: tokens.color.surface, fontFamily: tokens.font.sansSemi },
  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: "rgba(226,232,240,0.6)",
    padding: tokens.space.lg,
    gap: tokens.space.md,
    ...tokens.shadow.card,
  },
  head: { flexDirection: "row", alignItems: "center", gap: tokens.space.md },
  headMain: { flex: 1 },
  orderNo: {
    color: tokens.color.ink, fontFamily: tokens.font.monoBold, fontSize: tokens.size.sm,
    fontVariant: ["tabular-nums"],
  },
  store: { color: tokens.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.xs, marginTop: 1 },
  lines: { gap: 2 },
  line: { color: tokens.color.ink2, fontFamily: tokens.font.sans, fontSize: tokens.size.xs },
  mono: { fontFamily: tokens.font.mono, fontVariant: ["tabular-nums"] },
  more: { color: tokens.color.ink4, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow },
  foot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: tokens.space.md },
  total: {
    color: tokens.color.ink, fontFamily: tokens.font.monoBold, fontSize: tokens.size.base,
    fontVariant: ["tabular-nums"],
    flex: 1,
  },
  acts: { flexDirection: "row", gap: tokens.space.sm },
  actBtn: {
    minHeight: 44,
    paddingHorizontal: tokens.space.lg,
    borderRadius: tokens.radius.md,
    alignItems: "center", justifyContent: "center",
  },
  actTxt: { fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
});
