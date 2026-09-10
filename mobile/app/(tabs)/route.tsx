import { useState, useMemo } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useQueryClient, useIsFetching } from "@tanstack/react-query";
import { Map, ShoppingCart } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { GradientHeader } from "@/components/GradientHeader";
import { HeaderRight } from "@/components/HeaderRight";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonRows } from "@/components/SkeletonRows";
import { SessionPanel } from "@/features/routes/SessionPanel";
import { RouteCard } from "@/features/routes/RouteCard";
import { OrdersView } from "@/features/routes/OrdersView";
import { useActiveSession, useRoutes, useVisitedToday } from "@/data/routes";
import { qk } from "@/data/keys";
import { friendlyError } from "@/lib/rpc";
import { tokens } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeContext";

type ViewKey = "routes" | "orders";

const VIEWS: { key: ViewKey; label: string; icon: typeof Map }[] = [
  { key: "routes", label: "Routes", icon: Map },
  { key: "orders", label: "Orders", icon: ShoppingCart },
];

function SegmentedToggle({ value, onChange }: { value: ViewKey; onChange: (v: ViewKey) => void }) {
  const { palette: t } = useTheme();
  const s = useStyles();
  return (
    <View style={s.seg}>
      {VIEWS.map((v) => {
        const Icon = v.icon;
        const selected = v.key === value;
        return (
          <Pressable
            key={v.key}
            onPress={() => onChange(v.key)}
            accessibilityLabel={`${v.label} view`}
            accessibilityState={{ selected }}
            style={({ pressed }) => [s.segBtn, selected && s.segBtnOn, pressed && { opacity: 0.85 }]}
          >
            <Icon size={14} color={selected ? t.color.surface : t.color.ink3} />
            <Text style={[s.segTxt, selected && s.segTxtOn]}>{v.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function RouteScreen() {
  const s = useStyles();
  const qc = useQueryClient();
  const fetching = useIsFetching();
  const [view, setView] = useState<ViewKey>("routes");

  const session = useActiveSession();
  const routes = useRoutes();
  const sessionId = session.data?.id ?? "";
  const visited = useVisitedToday(sessionId);

  const visitedSet = new Set(visited.data ?? []);
  const activeRouteId = session.data?.route_id ?? "";

  async function onRefresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: qk.routes() }),
      qc.invalidateQueries({ queryKey: qk.activeSession() }),
      qc.invalidateQueries({ queryKey: ["orders"] }),
      ...(sessionId ? [qc.invalidateQueries({ queryKey: qk.visited(sessionId) })] : []),
    ]);
  }

  return (
    <Screen refreshing={fetching > 0} onRefresh={onRefresh}>
      <GradientHeader
        title="Routes"
        subtitle="Sessions, stores and orders"
        right={<HeaderRight />}
      />

      <View style={s.body}>
        <SegmentedToggle value={view} onChange={setView} />

        {view === "routes" ? (
          <>
            <SessionPanel />

            {routes.isError ? (
              <EmptyState title="Could not load routes" message={friendlyError(routes.error)} />
            ) : routes.isLoading ? (
              <SkeletonRows rows={4} />
            ) : (routes.data?.length ?? 0) === 0 ? (
              <EmptyState
                icon={Map}
                title="No routes yet"
                message="Active routes assigned to stores will appear here."
              />
            ) : (
              routes.data!.map((r, i) => (
                <RouteCard
                  key={r.id}
                  index={i}
                  routeId={r.id}
                  name={r.name}
                  storeCount={r.storeCount}
                  isActive={r.id === activeRouteId}
                  visitedSet={visitedSet}
                  sessionId={sessionId}
                />
              ))
            )}
          </>
        ) : (
          <OrdersView />
        )}
      </View>
    </Screen>
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
  seg: {
    flexDirection: "row",
    backgroundColor: t.color.fill,
    borderRadius: tokens.radius.full,
    padding: 3,
  },
  segBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 40,
    borderRadius: tokens.radius.full,
  },
  segBtnOn: {
    backgroundColor: t.color.brand,
    ...t.shadow.card,
  },
  segTxt: { color: t.color.ink3, fontFamily: tokens.font.sansMed, fontSize: tokens.size.xs },
  segTxtOn: { color: t.color.surface, fontFamily: tokens.font.sansSemi },
});
  }, [palette]);
};
