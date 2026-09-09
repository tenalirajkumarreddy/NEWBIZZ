import { useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { CheckCheck, ClipboardList, Eye, FileText, Info } from "lucide-react-native";
import Toast from "react-native-toast-message";
import { Screen } from "@/components/Screen";
import { GradientHeader } from "@/components/GradientHeader";
import { HeaderRight } from "@/components/HeaderRight";
import { StatTile } from "@/components/StatTile";
import { EmptyState } from "@/components/EmptyState";
import { Sheet } from "@/components/Sheet";
import { SkeletonRows } from "@/components/SkeletonRows";
import { roleLabel } from "@/lib/claims";
import { useSession } from "@/lib/session";
import { friendlyError } from "@/lib/rpc";
import { moneyINR } from "@/lib/format";
import { qk } from "@/data/keys";
import {
  postInvoiceFromOrder, useOrders, type OrderRow,
} from "@/data/sales";
import { tokens } from "@/theme/tokens";

export default function ApprovalsScreen() {
  const { claims, can } = useSession();
  const qc = useQueryClient();
  const fetching = useIsFetching();
  const confirmed = useOrders("confirmed");
  const approved = useOrders("approved");
  const openOrders = useOrders();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [detail, setDetail] = useState<OrderRow | null>(null);

  const pending = useMemo(
    () => ordersAll(confirmed, approved).sort((a, b) => (a.orderDate < b.orderDate ? 1 : -1)),
    [confirmed.data, approved.data],
  );

  async function onApprove(order: OrderRow) {
    if (busyId) return;
    setBusyId(order.id);
    try {
      await postInvoiceFromOrder(order.id, true);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["orders"] }),
        qc.invalidateQueries({ queryKey: qk.today() }),
        qc.invalidateQueries({ queryKey: qk.weekly() }),
        qc.invalidateQueries({ queryKey: qk.aging() }),
        qc.invalidateQueries({ queryKey: qk.todayCollections() }),
      ]);
      Toast.show({ type: "success", text1: "Invoice created" });
    } catch (e) {
      Toast.show({ type: "error", text1: "Could not approve order", text2: friendlyError(e) });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Screen refreshing={fetching > 0} onRefresh={async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["orders"] }),
        qc.invalidateQueries({ queryKey: qk.today() }),
        qc.invalidateQueries({ queryKey: qk.aging() }),
      ]);
    }}>
      <GradientHeader title="Approvals" subtitle={roleLabel(claims)} right={<HeaderRight />} />

      <View style={st.body}>
        <View style={st.gridRow}>
          <StatTile
            label="Pending approvals"
            value={String(confirmed.isLoading || approved.isLoading ? "…" : pending.length)}
            tone="amb"
            icon={ClipboardList}
          />
          <StatTile
            label="Open orders"
            value={String(openOrders.isLoading ? "…" : (openOrders.data ?? []).length)}
            tone="brand"
            icon={FileText}
          />
        </View>


        <View style={st.note}>
          <Info size={13} color={tokens.color.ink3} />
          <Text style={st.noteTxt}>
            Approving creates an official GST invoice. Server enforces credit limits on invoicing.
          </Text>
        </View>

        {confirmed.isLoading || approved.isLoading ? (
          <SkeletonRows rows={4} />
        ) : confirmed.isError || approved.isError ? (
          <EmptyState
            title="Could not load orders"
            message={friendlyError(confirmed.error ?? approved.error)}
          />
        ) : pending.length === 0 ? (
          <EmptyState
            icon={CheckCheck}
            title="No orders awaiting approval"
            message="Confirmed and approved orders will appear here for invoicing."
          />
        ) : (
          pending.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              busy={busyId === order.id}
              canInvoice={can("invoice.create")}
              canView={can("order.view")}
              onApprove={() => void onApprove(order)}
              onView={() => setDetail(order)}
            />
          ))
        )}
      </View>

      <Sheet visible={detail != null} onClose={() => setDetail(null)} title={detail ? `Order ${detail.orderNo}` : undefined}>
        {detail ? (
          <View style={st.detailBody}>
            <Text style={st.detailStore}>{detail.storeName ?? "Unknown store"}</Text>
            <Text style={st.detailDate}>{detail.orderDate}</Text>
            {detail.notes ? <Text style={st.detailNotes}>Notes: {detail.notes}</Text> : null}
            <View style={st.detailLines}>
              {detail.lines.map((l, i) => (
                <View key={`${l.itemId}-${i}`} style={st.arRow}>
                  <View style={st.arMain}>
                    <Text style={st.lineName} numberOfLines={1}>{l.itemName ?? "Item"}</Text>
                    <Text style={st.lineSub}>{l.qty} × {moneyINR(l.unitPrice)}</Text>
                  </View>
                  <Text style={st.lineAmt}>{moneyINR(l.qty * l.unitPrice)}</Text>
                </View>
              ))}
            </View>
            <View style={st.detailTotal}>
              <Text style={st.totalLabel}>Total</Text>
              <Text style={st.totalValue}>{moneyINR(orderTotal(detail))}</Text>
            </View>
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}

function orderTotal(order: OrderRow): number {
  return order.lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0);
}

function ordersAll(confirmed: { data?: OrderRow[] }, approved: { data?: OrderRow[] }): OrderRow[] {
  return [...(confirmed.data ?? []), ...(approved.data ?? [])];
}


function OrderCard({
  order, busy, canInvoice, canView, onApprove, onView,
}: {
  order: OrderRow;
  busy: boolean;
  canInvoice: boolean;
  canView: boolean;
  onApprove: () => void;
  onView: () => void;
}) {
  const lines = order.lines;
  const total = orderTotal(order);
  return (
    <View style={st.card}>
      <View style={st.cardHead}>
        <View style={st.arMain}>
          <Text style={st.orderNo}>{order.orderNo}</Text>
          <Text style={st.storeName} numberOfLines={1}>{order.storeName ?? "Unknown store"} · {order.orderDate}</Text>
        </View>
        <Text style={st.total} numberOfLines={1}>{moneyINR(total)}</Text>
      </View>
      <View style={st.preview}>
        {lines.slice(0, 2).map((l, i) => (
          <Text key={`${l.itemId}-${i}`} style={st.previewLine} numberOfLines={1}>
            {l.qty} × {l.itemName ?? "Item"} — {moneyINR(l.qty * l.unitPrice)}
          </Text>
        ))}
        {lines.length > 2 ? <Text style={st.more}>+{lines.length - 2} more</Text> : null}
      </View>
      <View style={st.actions}>
        {canInvoice ? (
          <Pressable
            onPress={onApprove}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={`Approve and invoice ${order.orderNo}`}
            style={({ pressed }) => [st.btn, st.btnGrn, (pressed || busy) && { opacity: 0.8 }]}
          >
            <CheckCheck size={14} color="#ffffff" />
            <Text style={st.btnTxt}>{busy ? "Invoicing…" : "Approve & invoice"}</Text>
          </Pressable>
        ) : null}
        {canView ? (
          <Pressable
            onPress={onView}
            accessibilityRole="button"
            accessibilityLabel={`View ${order.orderNo}`}
            style={({ pressed }) => [st.btn, st.btnBrand, pressed && { opacity: 0.85 }]}
          >
            <Eye size={14} color="#ffffff" />
            <Text style={st.btnTxt}>View</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  body: {
    paddingHorizontal: tokens.space.lg,
    paddingTop: tokens.space.lg,
    gap: tokens.space.md,
  },
  gridRow: { flexDirection: "row", gap: tokens.space.sm },
  note: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.sm,
    backgroundColor: tokens.color.fill,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.line,
    paddingHorizontal: tokens.space.md,
    paddingVertical: tokens.space.sm,
  },
  noteTxt: {
    flex: 1,
    color: tokens.color.ink3,
    fontFamily: tokens.font.sans,
    fontSize: tokens.size.xs,
    lineHeight: 17,
  },
  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: "rgba(226,232,240,0.6)",
    padding: tokens.space.md,
    gap: tokens.space.sm,
    ...tokens.shadow.card,
  },
  cardHead: { flexDirection: "row", alignItems: "flex-start", gap: tokens.space.md },
  orderNo: {
    color: tokens.color.ink,
    fontFamily: tokens.font.monoBold,
    fontSize: tokens.size.sm,
    fontVariant: ["tabular-nums"],
  },
  storeName: {
    color: tokens.color.ink3,
    fontFamily: tokens.font.sans,
    fontSize: tokens.size.xs,
    marginTop: 2,
  },
  total: {
    color: tokens.color.ink,
    fontFamily: tokens.font.monoBold,
    fontSize: tokens.size.sm,
    fontVariant: ["tabular-nums"],
    maxWidth: 110,
  },
  preview: { gap: 2 },
  previewLine: { color: tokens.color.ink2, fontFamily: tokens.font.sans, fontSize: tokens.size.xs },
  more: { color: tokens.color.ink4, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.eyebrow },
  actions: { flexDirection: "row", gap: tokens.space.sm },
  btn: {
    flex: 1,
    minHeight: 44,
    borderRadius: tokens.radius.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: tokens.space.xs,
  },
  btnGrn: { backgroundColor: tokens.color.grn },
  btnBrand: { backgroundColor: tokens.color.brand },
  btnTxt: { color: "#ffffff", fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
  detailBody: { gap: tokens.space.md, paddingBottom: tokens.space.md },
  detailStore: { color: tokens.color.ink, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.base },
  detailDate: { color: tokens.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.xs },
  detailNotes: { color: tokens.color.ink2, fontFamily: tokens.font.sans, fontSize: tokens.size.xs },
  detailLines: { gap: tokens.space.xs },
  arRow: { flexDirection: "row", alignItems: "center", gap: tokens.space.md, minHeight: 40 },
  arMain: { flex: 1, minWidth: 0 },
  lineName: { color: tokens.color.ink, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
  lineSub: { color: tokens.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow, marginTop: 1 },
  lineAmt: {
    color: tokens.color.ink,
    fontFamily: tokens.font.monoBold,
    fontSize: tokens.size.xs,
    fontVariant: ["tabular-nums"],
  },
  detailTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: tokens.color.line,
    paddingTop: tokens.space.md,
  },
  totalLabel: { color: tokens.color.ink3, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
  totalValue: {
    color: tokens.color.ink,
    fontFamily: tokens.font.monoBold,
    fontSize: tokens.size.lg,
    fontVariant: ["tabular-nums"],
  },
});
