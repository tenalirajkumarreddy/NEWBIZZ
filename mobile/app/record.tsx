import { useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Alert,
  KeyboardAvoidingView, Platform, Switch,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import * as Haptics from "expo-haptics";
import {
  ChevronDown, IndianRupee, HandCoins, ClipboardList, TriangleAlert, Store as StoreIcon,
} from "lucide-react-native";
import { GradientHeader } from "@/components/GradientHeader";
import { PressCard } from "@/components/PressCard";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonRows } from "@/components/SkeletonRows";
import { StorePickerSheet, type PickedStore } from "@/features/record/StorePickerSheet";
import { ItemList, effectivePrice } from "@/features/record/ItemList";
import { PaymentSplit } from "@/features/record/PaymentSplit";
import { CreditBanner, computeCreditState, type CreditState } from "@/features/record/CreditBanner";
import { ReceiptModal, type ReceiptResult } from "@/features/record/ReceiptModal";
import { CollectForm } from "@/features/record/CollectForm";
import { parseMoney, round2 } from "@/features/record/fields";
import { postInvoice, recordReceipt, useOrder, type JsonLine } from "@/data/sales";
import { useSellableItems } from "@/data/catalog";
import { useStoreDetail, useCustomerOutstanding } from "@/data/stores";
import { supabase } from "@/lib/supabase";
import { qk } from "@/data/keys";
import { useSession } from "@/lib/session";
import { friendlyError } from "@/lib/rpc";
import { moneyINR, todayIST } from "@/lib/format";
import { tokens } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeContext";

type Mode = "sale" | "collect";

const MAX_QTY = 999_999;

function Segmented({
  value, onChange, canSale, canCollect,
}: {
  value: Mode;
  onChange: (m: Mode) => void;
  canSale: boolean;
  canCollect: boolean;
}) {
  const { palette: t } = useTheme();
  const s = useStyles();
  const opts: { key: Mode; label: string; icon: typeof IndianRupee }[] = [];
  if (canSale) opts.push({ key: "sale", label: "Sale", icon: IndianRupee });
  if (canCollect) opts.push({ key: "collect", label: "Collect", icon: HandCoins });
  if (opts.length === 0) return null;
  return (
    <View style={s.seg}>
      {opts.map((o) => {
        const Icon = o.icon;
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            accessibilityLabel={`${o.label} mode`}
            accessibilityState={{ selected: on }}
            style={({ pressed }) => [s.segBtn, on && s.segBtnOn, pressed && { opacity: 0.85 }]}
          >
            <Icon size={14} color={on ? t.color.surface : t.color.white30} />
            <Text style={[s.segTxt, on && s.segTxtOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function StoreCard({
  store, locked, onPress, accent,
}: {
  store: PickedStore | null;
  locked: boolean;
  onPress: () => void;
  accent: "brand" | "grn";
}) {
  const { palette: t } = useTheme();
  const s = useStyles();
  const fg = accent === "grn" ? t.color.grn : t.color.brand;
  const wash = accent === "grn" ? t.color.grnWash : t.color.brandWash;
  if (store) {
    return (
      <PressCard onPress={locked ? () => {} : onPress}>
        <View style={s.storeRow}>
          <View style={[s.storeChip, { backgroundColor: wash }]}>
            <Text style={[s.storeChipTxt, { color: fg }]}>{store.name.slice(0, 1).toUpperCase()}</Text>
          </View>
          <View style={s.storeMain}>
            <Text style={s.storeName} numberOfLines={1}>{store.name}</Text>
            <Text style={s.storeSub} numberOfLines={1}>
              {[store.customerName, store.area].filter(Boolean).join(" · ")}
            </Text>
          </View>
          {locked ? (
            <ClipboardList size={15} color={t.color.ink4} />
          ) : (
            <ChevronDown size={16} color={t.color.ink4} />
          )}
        </View>
      </PressCard>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel="Tap to select store"
      style={({ pressed }) => [s.storeEmpty, pressed && { opacity: 0.85 }]}
    >
      <StoreIcon size={16} color={t.color.ink4} />
      <Text style={s.storeEmptyTxt}>Tap to select store</Text>
      <ChevronDown size={16} color={t.color.ink4} />
    </Pressable>
  );
}

export default function RecordScreen() {
  const { palette: t } = useTheme();
  const s = useStyles();
  const router = useRouter();
  const qc = useQueryClient();
  const { can, user } = useSession();
  const params = useLocalSearchParams<{ mode?: string; storeId?: string; orderId?: string }>();
  const canSale = can("cashmemo.create");
  const canCollect = can("receipt.record");

  const [mode, setMode] = useState<Mode>(
    params.mode === "collect" && canCollect ? "collect" : "sale",
  );
  const [storeId, setStoreId] = useState(typeof params.storeId === "string" ? params.storeId : "");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerAccent, setPickerAccent] = useState<"brand" | "grn">("brand");

  // sale state
  const [qty, setQty] = useState<Record<string, number>>({});
  const [priceOverride, setPriceOverride] = useState<Record<string, number>>({});
  const [cash, setCash] = useState("");
  const [upi, setUpi] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptResult | null>(null);
  // Sales default to CASH MEMO (unofficial, no GST). Only invoice.create
  // holders (manager/admin) may post an official GST invoice directly.
  const canOfficial = can("invoice.create");
  const [official, setOfficial] = useState(false);

  const orderId = typeof params.orderId === "string" && params.orderId ? params.orderId : null;
  const orderQ = useOrder(orderId);
  const order = orderQ.data ?? null;

  const detail = useStoreDetail(storeId);
  const itemsQ = useSellableItems();
  const customer = detail.data?.store?.customer as
    | { id?: string; name?: string | null; credit_limit?: number | null }
    | null | undefined;
  const customerId = customer?.id ?? null;
  const outstandingQ = useCustomerOutstanding(customerId);

  const prefillDone = useRef(false);
  useEffect(() => {
    if (mode === "collect" && !canCollect && canSale) setMode("sale");
    else if (mode === "sale" && !canSale && canCollect) setMode("collect");
  }, [mode, canSale, canCollect]);
  useEffect(() => {
    if (prefillDone.current) return;
    if (!order || order.lines.length === 0) return;
    setQty((prev) => {
      const next = { ...prev };
      for (const l of order.lines) {
        if (l.itemId && l.qty > 0) next[l.itemId] = l.qty;
      }
      return next;
    });
    setPriceOverride((prev) => {
      const next = { ...prev };
      for (const l of order.lines) {
        if (l.itemId && l.unitPrice >= 0) next[l.itemId] = l.unitPrice;
      }
      return next;
    });
    prefillDone.current = true;
  }, [order]);

  useEffect(() => {
    if (order?.storeId) setStoreId(order.storeId);
  }, [order?.storeId]);

  function switchMode(m: Mode) {
    setMode(m);
    setPickerAccent(m === "collect" ? "grn" : "brand");
  }

  const items = itemsQ.data ?? [];
  const lines: { itemId: string; qty: number; unitPrice: number }[] = useMemo(() => {
    return Object.entries(qty)
      .filter(([, q]) => Number.isFinite(q) && q > 0)
      .map(([itemId, q]) => {
        const item = items.find((i) => i.id === itemId);
        const override = priceOverride[itemId];
        const price = override ?? effectivePrice(item, q);
        return { itemId, qty: q, unitPrice: round2(price) };
      });
  }, [qty, priceOverride, items]);

  const cartTotal = useMemo(
    () => round2(lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0)),
    [lines],
  );

  // Server adds GST per line on top of these (tax-exclusive) prices — mirror that
  // locally so the credit gate judges the post-tax exposure.
  const postTaxTotal = useMemo(
    () =>
      round2(
        lines.reduce((sum, l) => {
          const gst = items.find((i) => i.id === l.itemId)?.gstRate ?? 0;
          return sum + l.qty * l.unitPrice * (1 + gst / 100);
        }, 0),
      ),
    [lines, items],
  );

  const cashNum = useMemo(() => {
    const n = parseMoney(cash);
    return Number.isNaN(n) ? 0 : n;
  }, [cash]);
  const upiNum = useMemo(() => {
    const n = parseMoney(upi);
    return Number.isNaN(n) ? 0 : n;
  }, [upi]);
  const collected = round2(cashNum + upiNum);

  const creditState: CreditState = useMemo(() => {
    const limit = Number(customer?.credit_limit ?? 0);
    if (!(limit > 0)) return { level: "none" };
    if (outstandingQ.isLoading) return { level: "loading" };
    if (outstandingQ.isError) return { level: "unavailable" };
    return computeCreditState(limit, outstandingQ.data ?? 0, postTaxTotal, collected);
  }, [
    outstandingQ.isLoading,
    outstandingQ.isError,
    outstandingQ.data,
    customer?.credit_limit,
    postTaxTotal,
    collected,
  ]);

  const creditBlocked = creditState.level === "exceeded" && !can("credit.override");
  const canOverride = creditState.level === "exceeded" && can("credit.override");
  const creditGateOpen = creditState.level !== "loading";

  const saleReady =
    !!storeId && lines.length > 0 && cartTotal > 0 && cashNum >= 0 && upiNum >= 0 && creditGateOpen;

  async function invalidateAfterSuccess(store: string | null) {
    await Promise.all([
      qc.invalidateQueries({ queryKey: qk.today() }),
      qc.invalidateQueries({ queryKey: qk.todaySplit() }),
      qc.invalidateQueries({ queryKey: ["orders"] }),
      qc.invalidateQueries({ queryKey: qk.holdings() }),
      store ? qc.invalidateQueries({ queryKey: qk.store(store) }) : Promise.resolve(),
      customerId ? qc.invalidateQueries({ queryKey: qk.customerOutstanding(customerId) }) : Promise.resolve(),
      customerId ? qc.invalidateQueries({ queryKey: qk.openInvoices(customerId) }) : Promise.resolve(),
    ]);
  }

  function resetForm() {
    setQty({});
    setPriceOverride({});
    setCash("");
    setUpi("");
    prefillDone.current = false;
  }

  async function submitSale() {
    if (submitting || !saleReady || creditBlocked) return;
    if (!storeId) {
      Toast.show({ type: "error", text1: "Select a store first" });
      return;
    }
    if (!customerId) {
      Toast.show({ type: "error", text1: "Store details still loading", text2: "Try again in a moment" });
      return;
    }

    setSubmitting(true);
    try {
      const invoiceId = await postInvoice(
        {
          store_id: storeId,
          invoice_date: todayIST(),
          order_id: orderId,
          place_of_supply: null,
        },
        lines.map((l): JsonLine => ({ item_id: l.itemId, qty: l.qty, unit_price: l.unitPrice })),
        official,
      );

      let receiptFailed = false;
      let receiptError: string | null = null;
      let postedCollected = 0;

      // Server computes GST + rounding into grand_total — use it for the receipt
      // instead of the pre-tax cart estimate. Falls back to the estimate if the
      // fetch fails.
      let serverTotal: number | null = null;
      try {
        const g = await supabase
          .from("invoices")
          .select("grand_total")
          .eq("id", invoiceId)
          .single();
        if (g.error) throw g.error;
        const n = Number(g.data?.grand_total);
        if (Number.isFinite(n) && n > 0) serverTotal = round2(n);
      } catch {
        serverTotal = null;
      }

      if (cashNum > 0) {
        try {
          await recordReceipt(
            {
              customer_id: customerId,
              amount: cashNum,
              mode: "cash",
              deposit_account: "2140",
              collected_by: user?.id,
              store_id: storeId,
              notes: "Collected on sale",
            },
            [{ invoice_id: invoiceId, amount: cashNum }],
          );
          postedCollected = round2(postedCollected + cashNum);
        } catch (e) {
          receiptFailed = true;
          receiptError = `cash: ${friendlyError(e)}`;
        }
      }
      if (upiNum > 0) {
        try {
          await recordReceipt(
            {
              customer_id: customerId,
              amount: upiNum,
              mode: "upi",
              deposit_account: "2140",
              collected_by: user?.id,
              store_id: storeId,
              notes: "Collected on sale",
            },
            [{ invoice_id: invoiceId, amount: upiNum }],
          );
          postedCollected = round2(postedCollected + upiNum);
        } catch (e) {
          receiptFailed = true;
          receiptError = receiptError
            ? `${receiptError}; upi: ${friendlyError(e)}`
            : `upi: ${friendlyError(e)}`;
        }
      }

      if (receiptFailed) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        Alert.alert(
          "Invoice posted but receipt failed",
          `${receiptError ?? "Unknown error"}.\nRecord the receipt from Collect.`,
        );
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }

      await invalidateAfterSuccess(storeId);
      setReceipt({
        kind: "sale",
        invoiceRef: invoiceId,
        invoiceTotal: serverTotal ?? cartTotal,
        collected: postedCollected,
        balance: round2((serverTotal ?? cartTotal) - postedCollected),
        receiptFailed,
        receiptError,
        advanceNote: null,
        estimateNote: !official
          ? "Cash memo - unofficial sale. No GST applied. A manager can convert it to a GST invoice."
          : serverTotal == null
            ? "Invoice total is a pre-tax estimate - the server total (with GST) may be slightly higher."
            : null,
      });
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Toast.show({ type: "error", text1: "Could not record sale", text2: friendlyError(e) });
    } finally {
      setSubmitting(false);
    }
  }

  function closeReceipt() {
    setReceipt(null);
    resetForm();
    router.back();
  }

  function submitSaleWithOverride() {
    if (canOverride) {
      Alert.alert(
        "Credit limit exceeded",
        "Post this sale anyway? The credit portion goes beyond the customer's limit.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Post sale", style: "destructive", onPress: () => void submitSale() },
        ],
      );
      return;
    }
    void submitSale();
  }

  if (!canSale && !canCollect) {
    return (
      <View style={s.root}>
        <GradientHeader title="Record" subtitle="Sales and payments" />
        <View style={s.noPermBody}>
          <EmptyState
            title="No permission"
            message="You do not have permission to record sales or collect payments."
          />
        </View>
      </View>
    );
  }

  const store: PickedStore | null = storeId
    ? {
        id: storeId,
        name: detail.data?.store?.name ?? "Store",
        area: detail.data?.store?.area ?? null,
        customerName: customer?.name ?? null,
      }
    : null;

  const headerTitle = mode === "sale" ? "Record sale" : "Collect payment";
  const headerSub = order
    ? `Fulfilling order ${order.orderNo}`
    : mode === "sale"
      ? "Cash memo and on-spot collection"
      : "Receipt against open invoices";

  return (
    <View style={s.root}>
      <GradientHeader title={headerTitle} subtitle={headerSub}>
        <View style={{ marginTop: tokens.space.md }}>
          <Segmented value={mode} onChange={switchMode} canSale={canSale} canCollect={canCollect} />
        </View>
      </GradientHeader>

      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView style={s.flex} contentContainerStyle={s.scrollIn} keyboardShouldPersistTaps="handled">
          {mode === "sale" ? (
            <View style={s.body}>
              <StoreCard
                store={store}
                locked={!!orderId}
                onPress={() => {
                  setPickerAccent("brand");
                  setPickerOpen(true);
                }}
                accent="brand"
              />

              {orderId ? (
                orderQ.isLoading ? (
                  <SkeletonRows rows={2} />
                ) : order ? (
                  <View style={s.orderBanner}>
                    <ClipboardList size={15} color={t.color.brand} />
                    <Text style={s.orderBannerTxt}>
                      Fulfilling order <Text style={s.monoBold}>{order.orderNo}</Text> — cart prefilled from order lines
                    </Text>
                  </View>
                ) : (
                  <View style={[s.orderBanner, s.orderBannerWarn]}>
                    <TriangleAlert size={15} color={t.color.amb} />
                    <Text style={[s.orderBannerTxt, { color: t.color.amb }]}>Order not found</Text>
                  </View>
                )
              ) : null}

              <Text style={s.sectionTitle}>Items</Text>
              <ItemList
                items={items}
                qtyByItem={qty}
                priceOverride={priceOverride}
                onQty={(id, q) => setQty((prev) => ({ ...prev, [id]: Math.min(q, MAX_QTY) }))}
                loading={itemsQ.isLoading}
                errorText={itemsQ.isError ? friendlyError(itemsQ.error) : null}
              />

              {lines.length > 0 ? (
                <View style={s.card}>
                  <View style={s.totalRow}>
                    <Text style={s.totalLabel}>Order total</Text>
                    <Text style={s.totalVal}>{moneyINR(cartTotal)}</Text>
                  </View>
                  <View style={s.breakdown}>
                    {lines.map((l) => {
                      const item = items.find((i) => i.id === l.itemId);
                      return (
                        <View key={l.itemId} style={s.breakRow}>
                          <Text style={s.breakName} numberOfLines={1}>{item?.name ?? "Item"}</Text>
                          <Text style={s.breakQty}>
                            {l.qty} x {moneyINR(l.unitPrice)}
                          </Text>
                          <Text style={s.breakTotal}>{moneyINR(round2(l.qty * l.unitPrice))}</Text>
                        </View>
                      );
                    })}
                  </View>
                  <PaymentSplit
                    cash={cash}
                    upi={upi}
                    onChangeCash={setCash}
                    onChangeUpi={setUpi}
                    total={cartTotal}
                  />
                  <CreditBanner state={creditState} />
                  {canOfficial ? (
                    <View style={s.officialRow}>
                      <View style={s.officialMain}>
                        <Text style={s.officialLabel}>Official GST invoice</Text>
                        <Text style={s.officialSub}>
                          {official
                            ? "SL series, GST applied - counts in official returns"
                            : "Cash memo (CM) - unofficial sale, no GST"}
                        </Text>
                      </View>
                      <Switch
                        value={official}
                        onValueChange={setOfficial}
                        trackColor={{ true: tokens.color.brand, false: tokens.color.line }}
                        thumbColor="#ffffff"
                        accessibilityLabel="Official GST invoice"
                      />
                    </View>
                  ) : null}
                  <Pressable
                    onPress={submitSaleWithOverride}
                    disabled={submitting || !saleReady || creditBlocked}
                    accessibilityLabel={`Record sale of ${moneyINR(cartTotal)}`}
                    style={({ pressed }) => [
                      s.submit,
                      pressed && { opacity: 0.9 },
                      (submitting || !saleReady || creditBlocked) && { opacity: 0.55 },
                    ]}
                  >
                    {submitting ? (
                      <ActivityIndicator color="#ffffff" size="small" />
                    ) : (
                      <Text style={s.submitTxt}>
                        {official ? "Record invoice" : "Record cash memo"} · {moneyINR(cartTotal)}
                      </Text>
                    )}
                  </Pressable>
                </View>
              ) : null}
            </View>
          ) : (
            <View style={s.body}>
              <StoreCard
                store={store}
                locked={false}
                onPress={() => {
                  setPickerAccent("grn");
                  setPickerOpen(true);
                }}
                accent="grn"
              />
              {storeId ? (
                <CollectForm
                  key={storeId}
                  storeId={storeId}
                  accent="grn"
                  onDone={(r) => {
                    void invalidateAfterSuccess(storeId).then(() => setReceipt(r));
                  }}
                />
              ) : (
                <EmptyState title="Select a store" message="Pick the store you are collecting payment for." />
              )}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <StorePickerSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        accent={pickerAccent}
        onSelect={(st) => {
          setStoreId(st.id);
          setPickerOpen(false);
        }}
      />

      <ReceiptModal result={receipt} onClose={closeReceipt} />
    </View>
  );
}

const useStyles = () => {
  const { palette } = useTheme();
  return useMemo(() => {
    const t = palette;
    return StyleSheet.create({
  root: { flex: 1, backgroundColor: t.color.bg },
  flex: { flex: 1 },
  noPermBody: { padding: tokens.space.xl },
  scrollIn: { paddingBottom: 64, flexGrow: 1 },
  body: {
    paddingHorizontal: tokens.space.lg,
    paddingTop: tokens.space.lg,
    gap: tokens.space.md,
  },
  seg: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.14)",
    borderRadius: tokens.radius.full,
    padding: 3,
  },
  segBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 44,
    borderRadius: tokens.radius.full,
  },
  segBtnOn: { backgroundColor: t.color.brand },
  segTxt: { color: t.color.white30, fontFamily: tokens.font.sansMed, fontSize: tokens.size.xs },
  segTxtOn: { color: t.color.surface, fontFamily: tokens.font.sansSemi },
  storeRow: { flexDirection: "row", alignItems: "center", gap: tokens.space.md, padding: tokens.space.md },
  storeChip: {
    width: 40, height: 40, borderRadius: tokens.radius.md,
    alignItems: "center", justifyContent: "center",
  },
  storeChipTxt: { fontFamily: tokens.font.sansBold, fontSize: tokens.size.base },
  storeMain: { flex: 1 },
  storeName: { color: t.color.ink, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.sm },
  storeSub: { color: t.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.xs, marginTop: 1 },
  storeEmpty: {
    minHeight: 56,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: t.color.ink4,
    backgroundColor: t.color.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: tokens.space.sm,
    paddingHorizontal: tokens.space.lg,
  },
  storeEmptyTxt: { color: t.color.ink3, fontFamily: tokens.font.sansMed, fontSize: tokens.size.sm },
  orderBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.sm,
    backgroundColor: t.color.brandWash,
    borderRadius: tokens.radius.md,
    padding: tokens.space.md,
  },
  orderBannerWarn: { backgroundColor: t.color.ambWash },
  orderBannerTxt: {
    flex: 1,
    color: t.color.brand,
    fontFamily: tokens.font.sansMed,
    fontSize: tokens.size.xs,
    lineHeight: 17,
  },
  monoBold: { fontFamily: tokens.font.monoBold },
  sectionTitle: {
    color: t.color.ink,
    fontFamily: tokens.font.sansSemi,
    fontSize: tokens.size.base,
    marginTop: tokens.space.xs,
  },
  card: {
    backgroundColor: t.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: t.color.line,
    padding: tokens.space.lg,
    gap: tokens.space.lg,
    ...t.shadow.card,
  },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: tokens.space.md,
  },
  totalLabel: {
    color: t.color.ink3,
    fontFamily: tokens.font.sansSemi,
    fontSize: tokens.size.eyebrow,
    letterSpacing: 0.5,
  },
  totalVal: {
    color: t.color.ink,
    fontFamily: tokens.font.monoBold,
    fontSize: tokens.size.xxl,
    fontVariant: ["tabular-nums"],
  },
  breakdown: { gap: 6 },
  breakRow: { flexDirection: "row", alignItems: "center", gap: tokens.space.sm },
  breakName: { flex: 1, color: t.color.ink2, fontFamily: tokens.font.sans, fontSize: tokens.size.xs },
  breakQty: {
    color: t.color.ink4,
    fontFamily: tokens.font.mono,
    fontSize: tokens.size.xs,
    fontVariant: ["tabular-nums"],
  },
  breakTotal: {
    color: t.color.ink,
    fontFamily: tokens.font.mono,
    fontSize: tokens.size.xs,
    fontVariant: ["tabular-nums"],
    minWidth: 84,
    textAlign: "right",
  },
  submit: {
    minHeight: 48,
    borderRadius: tokens.radius.md,
    backgroundColor: t.color.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  submitTxt: { color: t.color.surface, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.sm },
  officialRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.md,
    padding: tokens.space.md,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: t.color.line,
    backgroundColor: t.color.surface,
  },
  officialMain: { flex: 1, minWidth: 0 },
  officialLabel: { color: t.color.ink, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
  officialSub: { color: t.color.ink4, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow, marginTop: 1, lineHeight: 15 },
});
  }, [palette]);
};
