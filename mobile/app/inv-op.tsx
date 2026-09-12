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
import { useStockLevels } from "@/data/production";
import { tokens } from "@/theme/tokens";
import { moneyCompact } from "@/lib/format";
import { useRouter } from "expo-router";

export default function InvOpScreen() {
  const { claims } = useSession();
  const router = useRouter();
  const { palette: t } = useTheme();
  const s = useStyles();
  const fetching = useIsFetching();

  const stock = useStockLevels({ enabled: !!claims?.userId });

  return (
    <Screen
      refreshing={fetching > 0}
      onRefresh={() => {
        void stock.refetch();
      }}
    >
      <GradientHeader title="Inventory" subtitle={roleLabel(claims)} right={<HeaderRight />} />

      <View style={s.body}>
        {stock.isLoading ? (
          <SkeletonRows rows={4} />
        ) : stock.isError ? (
          <EmptyState
            title="Could not load stock"
            message={friendlyError(stock.error)}
          />
        ) : (
          <View style={s.list}>
            {stock.data ?? []}.map((r) => (
              <View key={r.itemId} style={s.item}>
                <View style={s.row}>
                  <Text style={s.name}>{r.itemName}</Text>
                  <Text style={s.qty}>
                    {r.qtyOnHand.toLocaleString("en-IN")} {r.uom ?? ""}
                  </Text>
                </View>
                <View style={s.actions}>
                  <Text style={s.reorder}>
                    Reorder level:{" "}
                    {r.reorderLevel.toLocaleString("en-IN")}
                    {r.uom ?? ""}
                  </Text>
                  {r.qtyOnHand <= (r.reorderLevel ?? 0) && (
                    <Text style={s.reorderUrgent}>⚠ Low stock</Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}
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
    list: { gap: tokens.space.md },
    item: {
      backgroundColor: t.color.surface,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: t.color.line,
      padding: tokens.space.md,
      gap: tokens.space.md,
      ...tokens.shadow.card,
    },
    row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    name: { color: t.color.ink, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
    qty: {
      color: t.color.ink2,
      fontFamily: tokens.font.monoBold,
      fontSize: tokens.size.xs,
      fontVariant: ["tabular-nums"],
    },
    actions: { flexDirection: "row", alignItems: "center", gap: tokens.space.sm },
    reorder: { color: t.color.ink4, fontSize: tokens.size.eyebrow },
    reorderUrgent: {
      color: "#EF4444",
      fontFamily: tokens.font.sansSemi,
      fontSize: tokens.size.eyebrow,
    },
  });
};