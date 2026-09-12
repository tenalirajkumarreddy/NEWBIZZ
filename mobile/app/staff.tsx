import { useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, RefreshControl } from "react-native";
import { useSession } from "@/lib/session";
import { useQuery } from "@tanstack/react-query";
import { useIsFetching } from "@tanstack/react-query";
import { Screen } from "@/components/Screen";
import { GradientHeader } from "@/components/GradientHeader";
import { HeaderRight } from "@/components/HeaderRight";
import { StatTile } from "@/components/StatTile";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonRows } from "@/components/SkeletonRows";
import { useStaff } from "@/data/operator";
import { tokens } from "@/theme/tokens";
import { moneyCompact } from "@/lib/format";
import { useRouter } from "expo-router";

export default function StaffScreen() {
  const { claims } = useSession();
  const router = useRouter();
  const { palette: t } = useTheme();
  const s = useStyles();
  const fetching = useIsFetching();

  const staff = useStaff({ enabled: !!claims?.userId });

  return (
    <Screen
      refreshing={fetching > 0}
      onRefresh={() => {
        void staff.refetch();
      }}
    >
      <GradientHeader title="Staff" subtitle={roleLabel(claims)} right={<HeaderRight />} />

      <View style={s.body}>
        {staff.isLoading ? (
          <SkeletonRows rows={5} />
        ) : staff.isError ? (
          <EmptyState
            title="Could not load staff"
            message={friendlyError(staff.error)}
          />
        ) : (
          <View style={s.list}>
            {(staff.data ?? []).map((s) => (
              <View
                key={s.id}
                style={s.item}
                onPress={() => {
                  // navigate to worker detail - not implemented for v1
                  // router.push(`/worker-detail/${s.id}`);
                }}
              >
                <View style={s.row}>
                  <Users size={14} color={t.color.brand} />
                  <View style={s.details}>
                    <Text style={s.name}>{s.name}</Text>
                    <Text style={s.kind}>
                      {s.kind === "user" ? "User employee" : "Worker"}
                    </Text>
                  </View>
                  <Text style={s.role}>
                    {s.status ? statusLabel(s.status) : "-"}
                  </Text>
                </View>
                <ChevronRight size={14} color={t.color.ink4} />
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
    row: { flexDirection: "row", alignItems: "center", gap: tokens.space.md },
    details: { flex: 1 },
    name: {
      color: t.color.ink,
      fontFamily: tokens.font.sansSemi,
      fontSize: tokens.size.xs,
    },
    kind: { color: t.color.ink4, fontSize: tokens.size.xs },
    role: {
      color: t.color.ink3,
      fontFamily: tokens.font.mono,
      fontSize: tokens.size.eyebrow,
      fontVariant: ["tabular-nums"],
    },
  });
};