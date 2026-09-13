import { useState } from "react";
import { View, Text, Pressable, StyleSheet, Alert } from "react-native";
import { useQueryClient, useIsFetching } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import Toast from "react-native-toast-message";
import { Printer, Truck, ReceiptText, Banknote, ChevronDown, ChevronUp, Ticket, IndianRupee } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { GradientHeader } from "@/components/GradientHeader";
import { HeaderRight } from "@/components/HeaderRight";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonRows } from "@/components/SkeletonRows";
import { useSession } from "@/lib/session";
import { roleLabel } from "@/lib/claims";
import { friendlyError } from "@/lib/rpc";
import { moneyINR, dateIST } from "@/lib/format";
import { qk } from "@/data/keys";
import { useOrders, postInvoiceFromOrder, type OrderRow } from "@/data/sales";
import {
  useChallans, setChallanStatus, createChallanForOrder, postDelivery, challanPdfUrl,
  type ChallanRow,
} from "@/data/challans";
import { tokens } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeContext";

type Seg = "orders" | "challans";

const ORDER_TONE: Record<string, "neutral" | "brand" | "grn" | "amb" | "red"> = {
  draft: "neutral", confirmed: "brand", approved: "amb",
  challan_printed: "brand", fulfilled: "grn", partially_fulfilled: "amb",
  invoiced: "grn", cancelled: "red",
};

export default function OrdersScreen() {
  const s = useStyles();
  const { palette: t } = useTheme();
  const { claims } = useSession();
  const qc = useQueryClient();
  const router = useRouter();
  const fetching = useIsFetching();
  const [seg, setSeg] = useState<Seg>("orders");
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const orders = useOrders();
  const challans = useChallans();

  function invalidateOrders() {
    void qc.invalidateQueries({ queryKey: qk.ordersPrefix() });
    void qc.invalidateQueries({ queryKey: qk.opChallans() });
    void qc.invalidateQueries({ queryKey: qk.stockLevels() });
    void qc.invalidateQueries({ queryKey: qk.today() });
  }

  async function act(id: string, fn: () => Promise<unknown>, okMsg: string) {
    setBusy(id);
    try {
      await fn();
      Toast.show({ type: "success", text1: okMsg });
      invalidateOrders();
    } catch (e) {
      Toast.show({ type: "error", text1: "Action failed", text2: friendlyError(e) });
    } finally {
      setBusy(null);
    }
  }

  async function onPrint(o: OrderRow) {
    setBusy(o.id);
    try {
      const id = await createChallanForOrder(o);
      Toast.show({ type: "success", text1: "Challan created" });
      invalidateOrders();
      try {
        await WebBrowser.openBrowserAsync(challanPdfUrl(id));
      } catch {
        Toast.show({ type: "error", text1: "Could not open print view" });
      }
    } catch (e) {
      Toast.show({ type: "error", text1: "Action failed", text2: friendlyError(e) });
    } finally {
      setBusy(null);
    }
  }

  function onDeliver(o: OrderRow) {
    Alert.alert("Fulfil all & deliver?", "Marks every remaining line delivered.", [
      { text: "Cancel", style: "cancel" },
      { text: "Deliver", onPress: () => void act(o.id, () => postDelivery(o.id), "Delivered") },
    ]);
  }

  function onMemo(o: OrderRow) {
    Alert.alert("Fulfil as cash memo?", "Creates a cash memo for the remaining lines.", [
      { text: "Cancel", style: "cancel" },
      { text: "Create", onPress: () => void act(o.id, () => postInvoiceFromOrder(o.id, false), "Cash memo posted") },
    ]);
  }

  function onChallanStatus(c: ChallanRow, status: string) {
    void act(c.id, () => setChallanStatus(c.id, status), `Challan ${status.replace("_", " ")}`);
  }

  return (
    <Screen refreshing={fetching > 0} onRefresh={invalidateOrders}>
      <GradientHeader title="Stores & Orders" subtitle={roleLabel(claims)} right={<HeaderRight />} />
      <View style={s.segRow}>
        <Pressable onPress={() => router.push("/record?mode=sale" as never)} style={s.quick} accessibilityRole="button" accessibilityLabel="Record sale">
          <IndianRupee size={14} color={t.color.brand} />
          <Text style={s.quickTxt}>+ Sale</Text>
        </Pressable>
        <Pressable onPress={() => router.push("/record?mode=collect" as never)} style={s.quick} accessibilityRole="button" accessibilityLabel="Record collection">
          <Banknote size={14} color={t.color.grn} />
          <Text style={s.quickTxt}>+ Collect</Text>
        </Pressable>
      </View>
      <View style={s.segRow}>
        {(["orders", "challans"] as Seg[]).map((k) => (
          <Pressable
            key={k}
            onPress={() => setSeg(k)}
            accessibilityRole="tab"
            accessibilityState={{ selected: seg === k }}
            style={[s.segBtn, seg === k && s.segBtnOn]}
          >
            <Text style={[s.segTxt, seg === k && s.segTxtOn]}>{k === "orders" ? "Orders" : "Challans"}</Text>
          </Pressable>
        ))}
      </View>
      {seg === "orders" ? (
        orders.isLoading ? <View style={s.pad}><SkeletonRows rows={5} /></View>
        : orders.isError ? <EmptyState title="Could not load orders" message={friendlyError(orders.error)} />
        : (orders.data ?? []).length === 0 ? <EmptyState title="No open orders" message="Approved orders appear here for challan and fulfilment." />
        : (
          <View style={s.list}>
            {(orders.data ?? []).map((o) => {
              const total = o.lines.reduce((x, l) => x + l.qty * l.unitPrice, 0);
              const isOpen = open === o.id;
              const approved = o.status === "approved";
              return (
                <View key={o.id} style={s.card}>
                  <Pressable onPress={() => setOpen(isOpen ? null : o.id)} style={s.cardHead} accessibilityRole="button" accessibilityLabel="Toggle order lines">
                    <View style={s.headLine}>
                      <Text style={s.docNo}>{o.orderNo}</Text>
                      <StatusBadge label={o.status.replace(/_/g, " ")} tone={ORDER_TONE[o.status] ?? "neutral"} />
                    </View>
                    <Text style={s.sub} numberOfLines={1}>
                      {o.storeName ?? "Store"} · {dateIST(o.orderDate)} · {moneyINR(total)}
                    </Text>
                    {isOpen ? <ChevronUp size={15} color={t.color.ink4} /> : <ChevronDown size={15} color={t.color.ink4} />}
                  </Pressable>
                  {isOpen ? (
                    <View style={s.lines}>
                      {o.lines.map((l) => (
                        <View key={l.lineId} style={s.lineRow}>
                          <Text style={s.lineName} numberOfLines={1}>{l.itemName ?? "Item"}</Text>
                          <Text style={s.lineQty}>
                            {l.qty - l.qtyFulfilled > 0 ? `${l.qty - l.qtyFulfilled}/${l.qty}` : `${l.qty}`}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                  {approved ? (
                    <View style={s.actions}>
                      <ActionBtn label="Print" icon={Printer} busy={busy === o.id} onPress={() => void onPrint(o)} tone="brand" />
                      <ActionBtn label="Deliver all" icon={Truck} busy={busy === o.id} onPress={() => onDeliver(o)} tone="grn" />
                      <ActionBtn label="Cash memo" icon={Banknote} busy={busy === o.id} onPress={() => onMemo(o)} tone="amb" />
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        )
      ) : challans.isLoading ? <View style={s.pad}><SkeletonRows rows={5} /></View>
        : challans.isError ? <EmptyState title="Could not load challans" message={friendlyError(challans.error)} />
        : (challans.data ?? []).length === 0 ? <EmptyState title="No released challans" message="Only office-released challans are visible here." />
        : (
          <View style={s.list}>
            {(challans.data ?? []).map((c) => (
              <View key={c.id} style={s.card}>
                <View style={s.headLine}>
                  <Text style={s.docNo}>{c.challanNo}</Text>
                  <StatusBadge
                    label={c.status.replace("_", " ")}
                    tone={c.status === "delivered" ? "grn" : c.status === "cancelled" ? "red" : c.status === "in_transit" ? "amb" : "brand"}
                  />
                </View>
                <Text style={s.sub}>{c.orderNo ? `Order ${c.orderNo} · ` : ""}{dateIST(c.challanDate)}</Text>
                <View style={s.actions}>
                  {c.status === "printed" ? (
                    <>
                      <ActionBtn label="Dispatch" icon={Truck} busy={busy === c.id} onPress={() => onChallanStatus(c, "in_transit")} tone="brand" />
                      <ActionBtn label="Delivered" icon={ReceiptText} busy={busy === c.id} onPress={() => onChallanStatus(c, "delivered")} tone="grn" />
                    </>
                  ) : null}
                  {c.status === "in_transit" ? (
                    <ActionBtn label="Delivered" icon={ReceiptText} busy={busy === c.id} onPress={() => onChallanStatus(c, "delivered")} tone="grn" />
                  ) : null}
                  {c.status === "printed" || c.status === "in_transit" ? (
                    <>
                      <ActionBtn label="PDF" icon={Ticket} busy={busy === c.id}
                        onPress={() => void WebBrowser.openBrowserAsync(challanPdfUrl(c.id)).catch(() => Toast.show({ type: "error", text1: "Could not open print view" }))}
                        tone="ghost" />
                      <ActionBtn label="Cancel" icon={Printer} busy={busy === c.id}
                        onPress={() => Alert.alert("Cancel challan?", c.challanNo, [
                          { text: "No", style: "cancel" },
                          { text: "Cancel it", style: "destructive", onPress: () => onChallanStatus(c, "cancelled") },
                        ])}
                        tone="red" />
                    </>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        )}
    </Screen>
  );
}

type ActTone = "brand" | "grn" | "amb" | "red" | "ghost";

function ActionBtn({ label, icon: Icon, onPress, busy, tone }: {
  label: string; icon: typeof Printer; onPress: () => void; busy: boolean; tone: ActTone;
}) {
  const s = useStyles();
  const { palette: t } = useTheme();
  const colors: Record<ActTone, [string, string]> = {
    brand: [t.color.brandWash, t.color.brand],
    grn: [t.color.grnWash, t.color.grn],
    amb: [t.color.ambWash, t.color.amb],
    red: [t.color.redWash, t.color.red],
    ghost: [t.color.surface, t.color.ink2],
  };
  const [bg, fg] = colors[tone];
  return (
    <Pressable
      onPress={() => !busy && onPress()}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        s.actBase, { backgroundColor: bg },
        pressed && { opacity: 0.8 }, busy && { opacity: 0.5 },
      ]}
    >
      <Icon size={13} color={fg} />
      <Text style={[s.actTxt, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

const useStyles = () => {
  const { palette: t } = useTheme();
  return StyleSheet.create({
    segRow: { flexDirection: "row", gap: tokens.space.sm, paddingHorizontal: tokens.space.lg, paddingTop: tokens.space.md },
    segBtn: {
      flex: 1, minHeight: 36, borderRadius: tokens.radius.md, borderWidth: 1, borderColor: t.color.line,
      backgroundColor: t.color.surface, alignItems: "center", justifyContent: "center",
    },
    segBtnOn: { backgroundColor: t.color.ink, borderColor: t.color.ink },
    segTxt: { color: t.color.ink3, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
    segTxtOn: { color: t.color.surface },
    quick: {
      flex: 1, minHeight: 44, borderRadius: tokens.radius.md, borderWidth: 1, borderColor: t.color.line,
      backgroundColor: t.color.surface, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4,
    },
    quickTxt: { fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs, color: t.color.ink },
    list: { paddingHorizontal: tokens.space.lg, paddingTop: tokens.space.md, gap: tokens.space.sm },
    pad: { padding: tokens.space.lg },
    card: {
      backgroundColor: t.color.surface, borderRadius: tokens.radius.lg, borderWidth: 1,
      borderColor: t.color.line, padding: tokens.space.md, gap: tokens.space.xs, ...tokens.shadow.card,
    },
    cardHead: { gap: 2 },
    headLine: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    docNo: { color: t.color.ink, fontFamily: tokens.font.monoBold, fontSize: tokens.size.xs, fontVariant: ["tabular-nums"] },
    sub: { color: t.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow },
    lines: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.color.line, paddingTop: tokens.space.xs },
    lineRow: { flexDirection: "row", justifyContent: "space-between", minHeight: 26, alignItems: "center" },
    lineName: { flex: 1, color: t.color.ink2, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow },
    lineQty: { color: t.color.ink, fontFamily: tokens.font.mono, fontSize: tokens.size.eyebrow, fontVariant: ["tabular-nums"] },
    actions: { flexDirection: "row", flexWrap: "wrap", gap: tokens.space.sm, marginTop: tokens.space.xs },
    actBase: {
      flexDirection: "row", alignItems: "center", gap: 4, minHeight: 36, paddingHorizontal: tokens.space.md,
      borderRadius: tokens.radius.md, borderWidth: 1, borderColor: t.color.line,
    },
    actTxt: { fontFamily: tokens.font.sansSemi, fontSize: tokens.size.eyebrow },
  });
};
