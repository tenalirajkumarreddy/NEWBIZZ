import { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, TextInput, Image } from "react-native";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { CheckCheck, ClipboardList, Eye, FileText, Info, Wallet, X } from "lucide-react-native";
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
import { moneyINR, dateIST } from "@/lib/format";
import { qk } from "@/data/keys";
import {
  postInvoiceFromOrder, useOrders, type OrderRow,
} from "@/data/sales";
import {
  approveExpense, rejectExpense, usePendingExpenses, type PendingExpenseRow,
} from "@/data/expenses";
import { useTransactionImages, imageSignedUrl } from "@/data/attachments";
import { ImageViewer } from "@/components/ImageViewer";
import { tokens } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeContext";

type Segment = "orders" | "expenses";

export default function ApprovalsScreen() {
  const { palette: t } = useTheme();
  const st = useStyles();
  const { claims, can } = useSession();
  const qc = useQueryClient();
  const fetching = useIsFetching();
  const confirmed = useOrders("confirmed");
  const approved = useOrders("approved");
  const openOrders = useOrders();
  const pendingExpenses = usePendingExpenses();
  const params = useLocalSearchParams<{ seg?: string }>();
  const [seg, setSeg] = useState<Segment>(params.seg === "expenses" ? "expenses" : "orders");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [detail, setDetail] = useState<OrderRow | null>(null);
  const [rejecting, setRejecting] = useState<PendingExpenseRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [viewerItems, setViewerItems] = useState<{ storage_bucket: string; storage_path: string }[] | null>(null);

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

  async function onApproveExpense(row: PendingExpenseRow) {
    if (busyId) return;
    setBusyId(row.id);
    try {
      await approveExpense(row.id);
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.pendingExpenses() }),
        qc.invalidateQueries({ queryKey: qk.expenses() }),
        qc.invalidateQueries({ queryKey: qk.custody() }),
      ]);
      Toast.show({ type: "success", text1: "Expense approved", text2: `${row.expenseNo} - ${moneyINR(row.amount)}` });
    } catch (e) {
      Toast.show({ type: "error", text1: "Could not approve expense", text2: friendlyError(e) });
    } finally {
      setBusyId(null);
    }
  }

  function onRejectExpense(row: PendingExpenseRow) {
    setRejectReason("");
    setRejecting(row);
  }

  async function confirmReject() {
    const row = rejecting;
    if (!row || busyId) return;
    setBusyId(row.id);
    try {
      await rejectExpense(row.id, rejectReason.trim() || null);
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.pendingExpenses() }),
        qc.invalidateQueries({ queryKey: qk.expenses() }),
      ]);
      Toast.show({ type: "success", text1: "Expense rejected", text2: row.expenseNo });
      setRejecting(null);
    } catch (e) {
      Toast.show({ type: "error", text1: "Could not reject expense", text2: friendlyError(e) });
    } finally {
      setBusyId(null);
    }
  }

  async function onRefresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["orders"] }),
      qc.invalidateQueries({ queryKey: qk.pendingExpenses() }),
      qc.invalidateQueries({ queryKey: qk.today() }),
      qc.invalidateQueries({ queryKey: qk.aging() }),
    ]);
  }

  const canManageExpenses = can("expense.manage");

  return (
    <Screen refreshing={fetching > 0} onRefresh={onRefresh}>
      <GradientHeader title="Approvals" subtitle={roleLabel(claims)} right={<HeaderRight />} />

      <View style={st.body}>
        <View style={st.segWrap}>
          <SegmentBtn label="Orders" count={pending.length} active={seg === "orders"} onPress={() => setSeg("orders")} />
          {canManageExpenses ? (
            <SegmentBtn
              label="Expenses"
              count={pendingExpenses.data?.length ?? 0}
              active={seg === "expenses"}
              onPress={() => setSeg("expenses")}
            />
          ) : null}
        </View>

        {seg === "orders" ? (
          <>
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
              <Info size={13} color={t.color.ink3} />
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
          </>
        ) : (
          <>
            <View style={st.note}>
              <Info size={13} color={t.color.ink3} />
              <Text style={st.noteTxt}>
                Approving deducts the amount from the spender's cash custody. Rejected expenses move nothing.
              </Text>
            </View>

            {pendingExpenses.isLoading ? (
              <SkeletonRows rows={4} />
            ) : pendingExpenses.isError ? (
              <EmptyState title="Could not load expenses" message={friendlyError(pendingExpenses.error)} />
            ) : (pendingExpenses.data?.length ?? 0) === 0 ? (
              <EmptyState
                icon={CheckCheck}
                title="No expenses awaiting approval"
                message="Field expense submissions will appear here."
              />
            ) : (
              (pendingExpenses.data ?? []).map((row) => (
                <ExpenseCard
                  key={row.id}
                  row={row}
                  busy={busyId === row.id}
                  onApprove={() => void onApproveExpense(row)}
                  onReject={() => onRejectExpense(row)}
                />
              ))
            )}
          </>
        )}
      </View>

      {viewerItems ? (
        <ImageViewer visible items={viewerItems} onClose={() => setViewerItems(null)} />
      ) : null}

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

      <Sheet visible={rejecting != null} onClose={() => setRejecting(null)} title="Reject expense">
        {rejecting ? (
          <View style={st.detailBody}>
            <Text style={st.detailStore}>{rejecting.expenseNo} · <Text style={{ color: t.color.red }}>{moneyINR(rejecting.amount)}</Text></Text>
            <Text style={st.detailNotes}>
              {rejecting.spenderName ?? "Agent"} · {rejecting.category.replace("_", " ")}
            </Text>
            <TextInput
              style={st.rejectInput}
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder="Reason (optional)"
              placeholderTextColor={t.color.ink4}
              maxLength={200}
              multiline
              accessibilityLabel="Rejection reason"
            />
            <View style={st.actions}>
              <Pressable
                onPress={() => void confirmReject()}
                disabled={busyId === rejecting.id}
                accessibilityRole="button"
                accessibilityLabel="Confirm reject"
                style={({ pressed }) => [st.btn, st.btnRed, (pressed || busyId === rejecting.id) && { opacity: 0.8 }]}
              >
                <X size={14} color="#ffffff" />
                <Text style={st.btnTxt}>{busyId === rejecting.id ? "Rejecting…" : "Reject expense"}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}

function SegmentBtn({ label, count, active, onPress }: { label: string; count: number; active: boolean; onPress: () => void }) {
  const st = useStyles();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={[st.segBtn, active && st.segBtnOn]}
    >
      <Text style={[st.segTxt, active && st.segTxtOn]} numberOfLines={1}>{label}</Text>
      <View style={[st.segCount, active && st.segCountOn]}>
        <Text style={[st.segCountTxt, active && st.segCountTxtOn]}>{count}</Text>
      </View>
    </Pressable>
  );
}

function ExpenseCard({
  row, busy, onApprove, onReject,
}: {
  row: PendingExpenseRow;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const { palette: t } = useTheme();
  const st = useStyles();
  const images = useTransactionImages("expenses", row.id);
  const [viewerOpen, setViewerOpen] = useState(false);
  const imgs = images.data ?? [];
  const count = imgs.length;
  return (
    <View style={st.card}>
      <View style={st.cardHead}>
        <View style={[st.expChip]}>
          <Wallet size={14} color={t.color.amb} />
        </View>
        <View style={st.arMain}>
          <Text style={st.orderNo}>{row.expenseNo}</Text>
          <Text style={st.storeName} numberOfLines={1}>
            {row.spenderName ?? "Agent"} · {row.category.replace("_", " ")} · {dateIST(row.expenseDate)}
          </Text>
          {row.note ? <Text style={st.expNote} numberOfLines={1}>"{row.note}"</Text> : null}
        </View>
        {/* Money convention: red = amount will leave custody on approval */}
        <Text style={[st.total, { color: t.color.red }]} numberOfLines={1}>{moneyINR(row.amount)}</Text>
      </View>
      {count > 0 ? (
        <Pressable
          onPress={() => setViewerOpen(true)}
          accessibilityLabel={`View ${count} receipt image(s)`}
          style={({ pressed }) => [st.thumbRow, pressed && { opacity: 0.8 }]}
        >
          {imgs.slice(0, 3).map((img) => (
            <Thumb key={img.id} image={img} />
          ))}
          <Text style={st.thumbCount}>{count} receipt{count === 1 ? "" : "s"} · tap to review</Text>
        </Pressable>
      ) : null}
      <View style={st.actions}>
        <Pressable
          onPress={onApprove}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={`Approve ${row.expenseNo}`}
          style={({ pressed }) => [st.btn, st.btnGrn, (pressed || busy) && { opacity: 0.8 }]}
        >
          <CheckCheck size={14} color="#ffffff" />
          <Text style={st.btnTxt}>{busy ? "Approving…" : "Approve"}</Text>
        </Pressable>
        <Pressable
          onPress={onReject}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={`Reject ${row.expenseNo}`}
          style={({ pressed }) => [st.btn, st.btnGhost, (pressed || busy) && { opacity: 0.7 }]}
        >
          <X size={14} color={t.color.red} />
          <Text style={[st.btnTxt, { color: t.color.red }]}>Reject</Text>
        </Pressable>
      </View>
      {count > 0 ? (
        <ImageViewer
          visible={viewerOpen}
          items={imgs}
          onClose={() => setViewerOpen(false)}
        />
      ) : null}
    </View>
  );
}

/** Small receipt thumbnail that resolves its own signed URL. */
function Thumb({ image }: { image: { storage_bucket: string; storage_path: string } }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    imageSignedUrl(image.storage_bucket, image.storage_path)
      .then((u) => alive && setUrl(u))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [image.storage_bucket, image.storage_path]);
  return url ? (
    <Image source={{ uri: url }} style={th.thumb} />
  ) : (
    <View style={th.thumb} />
  );
}

const th = StyleSheet.create({
  thumb: { width: 28, height: 28, borderRadius: 6, backgroundColor: "rgba(148,163,184,0.25)" },
});

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
  const st = useStyles();
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

const useStyles = () => {
  const { palette } = useTheme();
  return useMemo(() => {
    const t = palette;
    return StyleSheet.create({
  body: {
    paddingHorizontal: tokens.space.lg,
    paddingTop: tokens.space.lg,
    gap: tokens.space.md,
  },
  segWrap: {
    flexDirection: "row",
    backgroundColor: t.color.fill,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: t.color.line,
    padding: 3,
    gap: 3,
  },
  segBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 44,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: 4,
  },
  segBtnOn: { backgroundColor: t.color.surface, ...t.shadow.card },
  segTxt: { color: t.color.ink3, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
  segTxtOn: { color: t.color.brand },
  segCount: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: t.color.ambWash,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  segCountOn: { backgroundColor: t.color.brand },
  segCountTxt: {
    color: t.color.amb,
    fontFamily: tokens.font.monoBold,
    fontSize: 11,
    fontVariant: ["tabular-nums"],
  },
  segCountTxtOn: { color: "#ffffff" },
  expChip: {
    width: 30,
    height: 30,
    borderRadius: tokens.radius.sm,
    backgroundColor: t.color.ambWash,
    alignItems: "center",
    justifyContent: "center",
  },
  expNote: {
    color: t.color.ink4,
    fontFamily: tokens.font.sans,
    fontSize: tokens.size.eyebrow,
    fontStyle: "italic",
    marginTop: 1,
  },
  rejectInput: {
    minHeight: 72,
    textAlignVertical: "top",
    borderWidth: 1,
    borderColor: t.color.line,
    borderRadius: tokens.radius.md,
    backgroundColor: t.color.surface,
    paddingHorizontal: tokens.space.md,
    paddingVertical: tokens.space.sm,
    color: t.color.ink,
    fontFamily: tokens.font.sans,
    fontSize: tokens.size.sm,
  },
  btnRed: { backgroundColor: t.color.red },
  btnGhost: {
    backgroundColor: t.color.surface,
    borderWidth: 1,
    borderColor: t.color.line,
  },
  thumbRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.xs,
    minHeight: 32,
  },
  thumbCount: {
    flex: 1,
    color: t.color.ink3,
    fontFamily: tokens.font.sans,
    fontSize: tokens.size.eyebrow,
  },
  gridRow: { flexDirection: "row", gap: tokens.space.sm },
  note: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.sm,
    backgroundColor: t.color.fill,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: t.color.line,
    paddingHorizontal: tokens.space.md,
    paddingVertical: tokens.space.sm,
  },
  noteTxt: {
    flex: 1,
    color: t.color.ink3,
    fontFamily: tokens.font.sans,
    fontSize: tokens.size.xs,
    lineHeight: 17,
  },
  card: {
    backgroundColor: t.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: t.color.line,
    padding: tokens.space.md,
    gap: tokens.space.sm,
    ...t.shadow.card,
  },
  cardHead: { flexDirection: "row", alignItems: "flex-start", gap: tokens.space.md },
  orderNo: {
    color: t.color.ink,
    fontFamily: tokens.font.monoBold,
    fontSize: tokens.size.sm,
    fontVariant: ["tabular-nums"],
  },
  storeName: {
    color: t.color.ink3,
    fontFamily: tokens.font.sans,
    fontSize: tokens.size.xs,
    marginTop: 2,
  },
  total: {
    color: t.color.ink,
    fontFamily: tokens.font.monoBold,
    fontSize: tokens.size.sm,
    fontVariant: ["tabular-nums"],
    maxWidth: 110,
  },
  preview: { gap: 2 },
  previewLine: { color: t.color.ink2, fontFamily: tokens.font.sans, fontSize: tokens.size.xs },
  more: { color: t.color.ink4, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.eyebrow },
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
  btnGrn: { backgroundColor: t.color.grn },
  btnBrand: { backgroundColor: t.color.brand },
  btnTxt: { color: "#ffffff", fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
  detailBody: { gap: tokens.space.md, paddingBottom: tokens.space.md },
  detailStore: { color: t.color.ink, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.base },
  detailDate: { color: t.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.xs },
  detailNotes: { color: t.color.ink2, fontFamily: tokens.font.sans, fontSize: tokens.size.xs },
  detailLines: { gap: tokens.space.xs },
  arRow: { flexDirection: "row", alignItems: "center", gap: tokens.space.md, minHeight: 40 },
  arMain: { flex: 1, minWidth: 0 },
  lineName: { color: t.color.ink, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
  lineSub: { color: t.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow, marginTop: 1 },
  lineAmt: {
    color: t.color.ink,
    fontFamily: tokens.font.monoBold,
    fontSize: tokens.size.xs,
    fontVariant: ["tabular-nums"],
  },
  detailTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: t.color.line,
    paddingTop: tokens.space.md,
  },
  totalLabel: { color: t.color.ink3, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
  totalValue: {
    color: t.color.ink,
    fontFamily: tokens.font.monoBold,
    fontSize: tokens.size.lg,
    fontVariant: ["tabular-nums"],
  },
});
  }, [palette]);
};
