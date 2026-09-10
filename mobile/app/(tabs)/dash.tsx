import { useMemo } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, ChevronRight, ClipboardList, IndianRupee, Navigation, ReceiptText, Wallet,
} from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { GradientHeader } from "@/components/GradientHeader";
import { HeaderRight } from "@/components/HeaderRight";
import { StatTile } from "@/components/StatTile";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonRows } from "@/components/SkeletonRows";
import { roleLabel } from "@/lib/claims";
import { useSession } from "@/lib/session";
import { useRouter } from "expo-router";
import { friendlyError } from "@/lib/rpc";
import { gotoTab } from "@/lib/tabBus";
import { moneyINR, moneyCompact } from "@/lib/format";
import { qk } from "@/data/keys";
import {
  useArAging, useOrders, useTodayCollectionsTotal, useTodayKpis, useWeeklySales,
} from "@/data/sales";
import { useActiveSessionsCount } from "@/data/routes";
import { usePendingExpenses } from "@/data/expenses";
import { tokens } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeContext";

export default function DashScreen() {
  const { palette: t } = useTheme();
  const st = useStyles();
  const { claims, can } = useSession();
  const qc = useQueryClient();
  const router = useRouter();
  const fetching = useIsFetching();

  const kpis = useTodayKpis();
  const collections = useTodayCollectionsTotal();
  const orders = useOrders();
  const aging = useArAging();
  const weekly = useWeeklySales();
  const sessions = useActiveSessionsCount();
  const pendingExpenses = usePendingExpenses();

  const totalOutstanding = useMemo(
    () => (aging.data ?? []).reduce((sum, r) => sum + r.outstanding, 0),
    [aging.data],
  );
  const overdue30 = useMemo(
    () => (aging.data ?? []).filter((r) => r.ageDays > 30),
    [aging.data],
  );
  const overdue30Total = useMemo(() => overdue30.reduce((sum, r) => sum + r.outstanding, 0), [overdue30]);
  const dueStores = useMemo(() => {
    const byCustomer = new Map<string, { name: string; total: number }>();
    for (const r of aging.data ?? []) {
      const cur = byCustomer.get(r.customerId);
      if (cur) cur.total += r.outstanding;
      else byCustomer.set(r.customerId, { name: r.customerName, total: r.outstanding });
    }
    return [...byCustomer.entries()]
      .map(([customerId, v]) => ({ customerId, ...v }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 3);
  }, [aging.data]);
  const pendingApprovals = useMemo(
    () => (orders.data ?? []).filter((o) => o.status === "confirmed" || o.status === "approved").length,
    [orders.data],
  );
  const weekTotal = useMemo(
    () => (weekly.data ?? []).reduce((sum, d) => sum + d.total, 0),
    [weekly.data],
  );
  const weekMax = useMemo(
    () => Math.max(1, ...(weekly.data ?? []).map((d) => d.total)),
    [weekly.data],
  );

  async function onRefresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: qk.today() }),
      qc.invalidateQueries({ queryKey: qk.todayCollections() }),
      qc.invalidateQueries({ queryKey: ["orders"] }),
      qc.invalidateQueries({ queryKey: qk.aging() }),
      qc.invalidateQueries({ queryKey: qk.weekly() }),
      qc.invalidateQueries({ queryKey: qk.activeSessionsCount() }),
    ]);
  }

  return (
    <Screen refreshing={fetching > 0} onRefresh={onRefresh}>
      <GradientHeader title="Dash" subtitle={roleLabel(claims)} right={<HeaderRight />}>
        <View style={st.hero}>
          <Text style={st.heroEyebrow}>SALES — TODAY</Text>
          <Text style={st.heroValue}>{moneyCompact(kpis.data?.salesTotal ?? 0)}</Text>
          <Text style={st.heroSub}>
            {kpis.data?.invoiceCount ?? 0} invoices · {kpis.data?.receiptCount ?? 0} receipts
          </Text>
        </View>
      </GradientHeader>

      <View style={st.body}>
        <View style={st.gridRow}>
          <StatTile
            label="Outstanding"
            value={moneyCompact(totalOutstanding)}
            delta={aging.isLoading ? undefined : `${aging.data?.length ?? 0} open invoices`}
            tone={totalOutstanding > 0 ? "red" : "brand"}
            icon={Wallet}
          />
          <StatTile
            label="Collections today"
            value={moneyCompact(collections.data ?? 0)}
            delta={collections.isLoading ? undefined : "All agents, posted"}
            tone="grn"
            icon={IndianRupee}
          />
        </View>
        <View style={st.gridRow}>
          <StatTile label="Open orders" value={String(orders.data?.length ?? 0)} tone="brand" icon={ClipboardList} />
          <StatTile label="Active sessions" value={String(sessions.data ?? 0)} tone="grn" icon={Navigation} />
        </View>

        <View style={st.card}>
          <View style={st.cardHead}>
            <View style={[st.chip, { backgroundColor: t.color.redWash }]}>
              <AlertTriangle size={13} color={t.color.red} />
            </View>
            <Text style={st.cardTitle}>Needs attention</Text>
          </View>
          {aging.isLoading ? (
            <SkeletonRows rows={3} />
          ) : aging.isError ? (
            <EmptyState title="Could not load receivables" message={friendlyError(aging.error)} />
          ) : overdue30.length === 0 ? (
            <Text style={st.muted}>No invoices overdue beyond 30 days.</Text>
          ) : (
            <>
              {overdue30.slice(0, 3).map((r) => (
                <View key={r.invoiceId} style={st.arRow}>
                  <View style={st.arMain}>
                    <Text style={st.arName} numberOfLines={1}>{r.customerName}</Text>
                    <Text style={st.arSub}>{r.bucket ?? `${r.ageDays} days`}</Text>
                  </View>
                  <Text style={st.arAmount}>{moneyINR(r.outstanding)}</Text>
                </View>
              ))}
              <Text style={st.summary}>
                {overdue30.length} invoice{overdue30.length === 1 ? "" : "s"} over 30 days · {moneyCompact(overdue30Total)} total
              </Text>
            </>
          )}
          <View style={st.divider} />
          {can("expense.manage") && (pendingExpenses.data?.length ?? 0) > 0 ? (
            <Pressable
              onPress={() => {
                gotoTab("approvals");
                router.setParams({ seg: "expenses" });
              }}
              accessibilityRole="button"
              accessibilityLabel="Review pending expenses"
              style={({ pressed }) => [st.pendingRow, pressed && { opacity: 0.85 }]}
            >
              <View style={[st.chip, { backgroundColor: t.color.ambWash }]}>
                <Wallet size={13} color={t.color.amb} />
              </View>
              <View style={st.arMain}>
                <Text style={st.arName}>Expense approvals</Text>
                <Text style={st.arSub}>
                  {pendingExpenses.data!.length} submission{pendingExpenses.data!.length === 1 ? "" : "s"} waiting
                </Text>
              </View>
              <Text style={st.pendingCount}>{pendingExpenses.data!.length}</Text>
              <ChevronRight size={16} color={t.color.ink4} />
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => gotoTab("approvals")}
            accessibilityRole="button"
            accessibilityLabel="Open approvals"
            style={({ pressed }) => [st.pendingRow, pressed && { opacity: 0.85 }]}
          >
            <View style={[st.chip, { backgroundColor: t.color.brandWash }]}>
              <ClipboardList size={13} color={t.color.brand} />
            </View>
            <View style={st.arMain}>
              <Text style={st.arName}>Pending approvals</Text>
              <Text style={st.arSub}>Review and invoice orders</Text>
            </View>
            <Text style={st.pendingCount}>{pendingApprovals}</Text>
            <ChevronRight size={16} color={t.color.ink4} />
          </Pressable>
        </View>

        <View style={st.card}>
          <View style={st.cardHead}>
            <Text style={st.cardTitle}>Sales — last 7 days</Text>
            <Text style={st.weekTotal}>{moneyCompact(weekTotal)}</Text>
          </View>
          {weekly.isLoading ? (
            <SkeletonRows rows={2} />
          ) : weekly.isError ? (
            <EmptyState title="Could not load weekly sales" message={friendlyError(weekly.error)} />
          ) : (
            <View style={st.chart}>
              {(weekly.data ?? []).map((d) => {
                const height = d.total > 0 ? Math.max(6, Math.round((d.total / weekMax) * 84)) : 3;
                return (
                  <View key={d.date} style={st.col}>
                    <View style={st.barTrack}>
                      <View
                        style={[
                          st.bar,
                          {
                            height,
                            backgroundColor:
                              d.total > 0
                                ? d.isToday
                                  ? t.color.brand
                                  : t.color.brandWash
                                : t.color.line,
                          },
                        ]}
                      />
                    </View>
                    <Text style={[st.colLabel, d.isToday && st.colLabelToday]}>{d.label}</Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        <View style={st.card}>
          <View style={st.cardHead}>
            <Text style={st.cardTitle}>Top due customers</Text>
            <ReceiptText size={14} color={t.color.ink4} />
          </View>
          {aging.isLoading ? (
            <SkeletonRows rows={3} />
          ) : aging.isError ? (
            <EmptyState title="Could not load receivables" message={friendlyError(aging.error)} />
          ) : dueStores.length === 0 ? (
            <Text style={st.muted}>No outstanding receivables.</Text>
          ) : (
            dueStores.map((c) => (
              <View key={c.customerId} style={st.arRow}>
                <Text style={[st.arName, st.arMain]} numberOfLines={1}>{c.name}</Text>
                <Text style={st.arAmount}>{moneyCompact(c.total)}</Text>
              </View>
            ))
          )}
        </View>
      </View>
    </Screen>
  );
}

const useStyles = () => {
  const { palette } = useTheme();
  return useMemo(() => {
    const t = palette;
    return StyleSheet.create({
  hero: {
    marginTop: tokens.space.lg,
    backgroundColor: t.color.white15,
    borderRadius: tokens.radius.lg,
    padding: tokens.space.md,
  },
  heroEyebrow: {
    color: t.color.white30,
    fontFamily: tokens.font.sansSemi,
    fontSize: tokens.size.eyebrow,
    letterSpacing: 0.8,
  },
  heroValue: {
    color: "#ffffff",
    fontFamily: tokens.font.monoBold,
    fontSize: 30,
    marginTop: 2,
    fontVariant: ["tabular-nums"],
  },
  heroSub: {
    color: t.color.white30,
    fontFamily: tokens.font.sansMed,
    fontSize: tokens.size.xs,
    marginTop: 2,
  },
  body: {
    paddingHorizontal: tokens.space.lg,
    paddingTop: tokens.space.lg,
    gap: tokens.space.md,
  },
  gridRow: { flexDirection: "row", gap: tokens.space.sm },
  card: {
    backgroundColor: t.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: t.color.line,
    padding: tokens.space.md,
    gap: tokens.space.xs,
    ...t.shadow.card,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.sm,
    marginBottom: tokens.space.xs,
  },
  chip: {
    width: 26,
    height: 26,
    borderRadius: tokens.radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    flex: 1,
    color: t.color.ink,
    fontFamily: tokens.font.sansSemi,
    fontSize: tokens.size.sm,
  },
  arRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.md,
    minHeight: 40,
  },
  arMain: { flex: 1, minWidth: 0 },
  arName: { color: t.color.ink, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
  arSub: { color: t.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow, marginTop: 1 },
  arAmount: {
    color: t.color.ink,
    fontFamily: tokens.font.monoBold,
    fontSize: tokens.size.xs,
    fontVariant: ["tabular-nums"],
  },
  summary: { color: t.color.ink4, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow },
  muted: { color: t.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.xs },
  divider: { height: 1, backgroundColor: t.color.lineSoft, marginVertical: tokens.space.xs },
  pendingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.sm,
    minHeight: 44,
  },
  pendingCount: {
    color: t.color.brand,
    fontFamily: tokens.font.monoBold,
    fontSize: tokens.size.sm,
    fontVariant: ["tabular-nums"],
  },
  weekTotal: {
    color: t.color.ink,
    fontFamily: tokens.font.monoBold,
    fontSize: tokens.size.xs,
    fontVariant: ["tabular-nums"],
  },
  chart: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: tokens.space.sm,
    paddingTop: tokens.space.sm,
  },
  col: { flex: 1, alignItems: "center", gap: tokens.space.xs },
  barTrack: { height: 84, width: "100%", justifyContent: "flex-end" },
  bar: { width: "100%", borderRadius: 4 },
  colLabel: {
    color: t.color.ink4,
    fontFamily: tokens.font.sansSemi,
    fontSize: tokens.size.eyebrow,
  },
  colLabelToday: { color: t.color.brand, fontFamily: tokens.font.sansBold },
});
  }, [palette]);
};
