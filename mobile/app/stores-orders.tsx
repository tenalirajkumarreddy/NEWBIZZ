import { useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, FlatList, RefreshControl } from "react-native";
import { useSession } from "@/lib/session";
import { useQuery } from "@tanstack/react-query";
import { useIsFetching } from "@tanstack/react-query";
import { Screen } from "@/components/Screen";
import { GradientHeader } from "@/components/GradientHeader";
import { HeaderRight } from "@/components/HeaderRight";
import { StatTile } from "@/components/StatTile";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonRows } from "@/components/SkeletonRows";
import { useOrders, useChallans } from "@/data/operator";
import { tokens } from "@/theme/tokens";
import { moneyCompact } from "@/lib/format";
import { useRouter } from "expo-router";

export default function StoresOrdersScreen() {
  const { claims } = useSession();
  const router = useRouter();
  const { palette: t } = useTheme();
  const s = useStyles();
  const fetching = useIsFetching();

  const orders = useOrders({ enabled: !!claims?.userId });
  const challans = useChallans({ enabled: !!claims?.userId });

  const lowStockOrders = (orders.data ?? []).filter(
    (o) => o.total > 0 && o.total < 500,
  ).length;

  return (
    <Screen
      refreshing={fetching > 0}
      onRefresh={() => {
        void orders.refetch();
        void challans.refetch();
      }}
    >
      <GradientHeader title="Stores & Orders" subtitle={roleLabel(claims)} right={<HeaderRight />} />

      <View style={s.body}>
        {/* quick stats */}
        <View style={s.tiles}>
          <StatTile
            label="Open orders"
            value={String((orders.data ?? []).length)}
            tone="brand"
            icon={Cart}
          />
          <StatTile
            label="Challans"
            value={String((challans.data ?? []).length)}
            tone="grn"
            icon={ReceiptText}
          />
          <StatTile
            label="Low stock orders"
            value={String(lowStockOrders)}
            tone={lowStockOrders > 0 ? "red" : "amb"}
            icon={Boxes}
          />
        </View>

        <View style={s.lists}>
          {orders.isLoading || challans.isLoading ? (
            <SkeletonRows rows={6} />
          ) : orders.isError || challans.isError ? (
            <EmptyState
              title="Could not load data"
              message={friendlyError(orders.error ?? challans.error)}
            />
          ) : (
            <>
              <View style={s.orders}>
                <Text style={s.section}>Orders</Text>
                <FlatList
                  data={orders.data ?? []}
                  keyExtractor={(r) => r.id ?? String(r.id)}
                  renderItem={({ item }) => (
                    <View style={s.orderItem}>
                      <Text style={s.orderNo}>{item.orderNo}</Text>
                      <Text style={s.orderMeta}>
                        {new Date(item.orderDate).toLocaleDateString()} ·{" "}
                        {String(item.total ?? 0)}
                      </Text>
                      <Text style={s.orderStatus} color={t.color.ink}>
                        {item.status}
                      </Text>
                    </View>
                  )}
                  ListEmptyComponent={(
                    <Text style={s.empty}>No orders</Text>
                  )}
                />
              </View>

              <View style={s.challans}>
                <Text style={s.section}>Delivery Challans</Text>
                <FlatList
                  data={challans.data ?? []}
                  keyExtractor={(r) => r.id ?? String(r.id)}
                  renderItem={({ item }) => (
                    <View style={s.challanItem}>
                      <Text style={s.challanNo}>{item.challanNo}</Text>
                      <Text style={s.challanMeta}>
                        {new Date(item.challanDate).toLocaleDateString()} ·{" "}
                        {item.orderNo ?? "-"}
                      </Text>
                      <Text style={s.challanStatus} color={t.color.ink}>
                        {item.status}
                      </Text>
                    </View>
                  )}
                  ListEmptyComponent={(
                    <Text style={s.empty}>No challans</Text>
                  )}
                />
              </View>
            </>
          )}
        </View>
      </View>
    </Screen>
  );
}

const useStyles = () => {
  const { palette: t } = useTheme();
  return StyleSheet.create({
    body: {
      paddingHorizontal: tokens.space.lg,
      paddingTop: tokens.space.md,
    },
    tiles: { flexDirection: "row", gap: tokens.space.sm, marginBottom: tokens.space.md },
    section: {
      color: t.color.ink,
      fontFamily: tokens.font.sansSemi,
      fontSize: tokens.size.xs,
      marginBottom: tokens.space.xs,
    },
    lists: { gap: tokens.space.md },
    orderItem: {
      backgroundColor: t.color.surface,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: t.color.line,
      padding: tokens.space.md,
      gap: tokens.space.md,
      ...tokens.shadow.card,
    },
    orderNo: {
      color: t.color.ink2,
      fontFamily: tokens.font.sansSemi,
      fontSize: tokens.size.sm,
    },
    orderMeta: { color: t.color.ink4, fontSize: tokens.size.xs },
    orderStatus: { fontSize: tokens.size.eyebrow },
    challanItem: {
      backgroundColor: t.color.surface,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: t.color.line,
      padding: tokens.space.md,
      gap: tokens.space.md,
      ...tokens.shadow.card,
    },
    challanNo: {
      color: t.color.ink2,
      fontFamily: tokens.font.sansSemi,
      fontSize: tokens.size.sm,
    },
    challanMeta: { color: t.color.ink4, fontSize: tokens.size.xs },
    challanStatus: { fontSize: tokens.size.eyebrow },
    empty: { color: t.color.ink4, marginTop: tokens.space.lg },
  });
};