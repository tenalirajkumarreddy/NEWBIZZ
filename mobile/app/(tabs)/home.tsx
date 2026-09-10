import { View, Text, StyleSheet } from "react-native";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, FileText, ReceiptText, ShoppingCart } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { GradientHeader } from "@/components/GradientHeader";
import { HeaderRight } from "@/components/HeaderRight";
import { StatTile } from "@/components/StatTile";
import { PressCard } from "@/components/PressCard";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonRows } from "@/components/SkeletonRows";
import { useSession } from "@/lib/session";
import { roleLabel } from "@/lib/claims";
import { friendlyError } from "@/lib/rpc";
import { gotoTab } from "@/lib/tabBus";
import { useOrders, useTodayKpis, type OrderRow } from "@/data/sales";
import { useActiveSession } from "@/data/routes";
import { useStockHoldings } from "@/data/holdings";
import { qk } from "@/data/keys";
import { moneyCompact } from "@/lib/format";
import { RevenueCard } from "@/features/home/RevenueCard";
import { VanStockCard } from "@/features/home/VanStockCard";
import { ActiveRouteCard } from "@/features/home/ActiveRouteCard";
import { NextStopCard } from "@/features/home/NextStopCard";
import { tokens } from "@/theme/tokens";

const MAX_PENDING_ROWS = 5;

function OrderRowItem({ order }: { order: OrderRow }) {
  return (
    <PressCard onPress={() => gotoTab("routes")} style={s.orderCard}>
      <View style={s.orderRow}>
        <View style={s.orderChip}>
          <ShoppingCart size={13} color={tokens.color.amb} />
        </View>
        <View style={s.orderMain}>
          <Text style={s.orderStore} numberOfLines={1}>
            {order.storeName ?? "Unknown store"}
          </Text>
          <Text style={s.orderNo}>{order.orderNo}</Text>
        </View>
        <ChevronRight size={16} color={tokens.color.ink4} />
      </View>
    </PressCard>
  );
}

export default function HomeScreen() {
  const { user, claims } = useSession();
  const qc = useQueryClient();
  const kpis = useTodayKpis();
  const orders = useOrders("confirmed");
  const session = useActiveSession();
  const holdings = useStockHoldings();
  const sessionId = session.data?.id ?? "";
  const routeId = session.data?.route_id ?? "";
  const fetching = useIsFetching();

  const pendingTotal = orders.data?.length ?? 0;
  const pending = (orders.data ?? []).slice(0, MAX_PENDING_ROWS);

  async function onRefresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: qk.today() }),
      qc.invalidateQueries({ queryKey: qk.todaySplit() }),
      qc.invalidateQueries({ queryKey: qk.holdings() }),
      qc.invalidateQueries({ queryKey: qk.orders("confirmed") }),
      qc.invalidateQueries({ queryKey: qk.stores() }),
      qc.invalidateQueries({ queryKey: qk.activeSession() }),
      ...(session.data ? [
        qc.invalidateQueries({ queryKey: qk.visited(sessionId) }),
        qc.invalidateQueries({ queryKey: qk.routeStores(routeId) }),
      ] : []),
      qc.invalidateQueries({ queryKey: qk.routes() }),
    ]);
  }

  return (
    <Screen refreshing={fetching > 0} onRefresh={onRefresh}>
      <GradientHeader
        title="Dashboard"
        subtitle={roleLabel(claims)}
        right={<HeaderRight />}
      />

      <View style={s.body}>
        <RevenueCard />

        {kpis.isError ? (
          <EmptyState title="Could not load today" message={friendlyError(kpis.error)} />
        ) : kpis.isLoading ? (
          <SkeletonRows rows={2} />
        ) : (
          <View style={s.tiles}>
            <StatTile label="Sales" value={moneyCompact(kpis.data?.salesTotal ?? 0)} icon={FileText} tone="brand" />
            <StatTile label="Collections" value={moneyCompact(kpis.data?.collectedTotal ?? 0)} icon={ReceiptText} tone="grn" />
            <StatTile label="Orders" value={String(pendingTotal)} icon={ShoppingCart} tone="amb" />
          </View>
        )}

        {holdings.data && holdings.data.length > 0 ? <VanStockCard /> : null}
        <ActiveRouteCard />
        <NextStopCard />

        {orders.isError ? (
          <EmptyState title="Could not load orders" message={friendlyError(orders.error)} />
        ) : orders.isLoading ? (
          <SkeletonRows rows={3} />
        ) : pending.length === 0 ? (
          <EmptyState
            icon={ShoppingCart}
            title="No pending orders"
            message="Confirmed orders waiting on you will appear here."
          />
        ) : (
          <View style={s.ordersWrap}>
            <View style={s.ordersHead}>
              <Text style={s.ordersTitle}>Pending orders</Text>
              <Text style={s.ordersCount}>{pendingTotal}</Text>
            </View>
            {pending.map((o) => (
              <OrderRowItem key={o.id} order={o} />
            ))}
          </View>
        )}
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  body: {
    paddingHorizontal: tokens.space.lg,
    paddingTop: tokens.space.lg,
    gap: tokens.space.md,
  },
  tiles: { flexDirection: "row", gap: tokens.space.sm },
  ordersWrap: { gap: tokens.space.sm },
  ordersHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  ordersTitle: {
    color: tokens.color.ink2, fontFamily: tokens.font.sansSemi,
    fontSize: tokens.size.eyebrow, letterSpacing: 0.6,
  },
  ordersCount: {
    color: tokens.color.ink4, fontFamily: tokens.font.monoBold,
    fontSize: tokens.size.eyebrow, fontVariant: ["tabular-nums"],
  },
  orderCard: { padding: tokens.space.md },
  orderRow: { flexDirection: "row", alignItems: "center", gap: tokens.space.md },
  orderChip: {
    width: 28, height: 28, borderRadius: tokens.radius.sm,
    backgroundColor: tokens.color.ambWash, alignItems: "center", justifyContent: "center",
  },
  orderMain: { flex: 1 },
  orderStore: { color: tokens.color.ink, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
  orderNo: {
    color: tokens.color.ink4, fontFamily: tokens.font.mono, fontSize: 10,
    marginTop: 1, fontVariant: ["tabular-nums"],
  },
});
