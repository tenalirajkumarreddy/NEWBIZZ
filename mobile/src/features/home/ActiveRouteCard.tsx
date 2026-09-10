import { useState, useMemo } from "react";
import { View, Text, StyleSheet, Pressable, Alert } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import { Route as RouteIcon, Timer } from "lucide-react-native";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonRows } from "@/components/SkeletonRows";
import {
  useActiveSession, useRouteStores, useRoutes, useVisitedToday, endSession,
} from "@/data/routes";
import { qk } from "@/data/keys";
import { gotoTab } from "@/lib/tabBus";
import { friendlyError } from "@/lib/rpc";
import { tokens } from "@/theme/tokens";
import { formatElapsed, useElapsed } from "./useElapsed";
import { useTheme } from "@/theme/ThemeContext";

export function ActiveRouteCard() {
  const { palette: t } = useTheme();
  const s = useStyles();
  const session = useActiveSession();
  const qc = useQueryClient();
  const [ending, setEnding] = useState(false);

  const routeId = session.data?.route_id ?? "";
  const sessionId = session.data?.id ?? "";
  const routeStores = useRouteStores(routeId);
  const routes = useRoutes();
  const visited = useVisitedToday(sessionId);
  const elapsedSec = useElapsed(session.data?.started_at);

  if (session.isLoading) {
    return (
      <View style={s.card}>
        <SkeletonRows rows={3} />
      </View>
    );
  }

  if (session.isError) {
    return <EmptyState title="Could not load route session" message={friendlyError(session.error)} />;
  }

  if (!session.data) {
    return (
      <EmptyState
        icon={RouteIcon}
        title="No active route"
        message="Start today's route session to track visits and collections."
        actionLabel="Open Routes"
        onAction={() => gotoTab("routes")}
      />
    );
  }

  const sessionData = session.data;
  const total = routeStores.data?.length ?? sessionData.stores_planned ?? 0;
  const done = visited.data?.length ?? 0;
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const routeName = routes.data?.find((r) => r.id === routeId)?.name ?? "Active route";

  async function end() {
    if (!sessionData) return;
    setEnding(true);
    try {
      await endSession(sessionData.id, done);
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.activeSession() }),
        qc.invalidateQueries({ queryKey: qk.visited(sessionData.id) }),
        qc.invalidateQueries({ queryKey: qk.today() }),
      ]);
      Toast.show({ type: "success", text1: "Route ended" });
    } catch (e) {
      Toast.show({ type: "error", text1: "Could not end route", text2: friendlyError(e) });
    } finally {
      setEnding(false);
    }
  }

  function confirmEnd() {
    Alert.alert(
      "End route?",
      `${done} of ${total} stores visited so far.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "End route", style: "destructive", onPress: () => void end() },
      ],
    );
  }

  return (
    <View style={s.card}>
      <View style={s.head}>
        <View style={s.chip}>
          <RouteIcon size={13} color={t.color.grn} />
        </View>
        <Text style={s.title} numberOfLines={1}>{routeName}</Text>
        <View style={s.elapsed}>
          <Timer size={11} color={t.color.ink3} />
          <Text style={s.elapsedTxt}>{formatElapsed(elapsedSec)}</Text>
        </View>
      </View>

      <View style={s.track}>
        <View style={[s.fill, { width: `${pct}%` }]} />
      </View>

      <View style={s.foot}>
        <Text style={s.progress}>
          <Text style={s.mono}>{done}</Text> of <Text style={s.mono}>{total}</Text> visited
          {"  ·  "}
          <Text style={s.mono}>{pct}%</Text>
        </Text>
        <Pressable
          onPress={confirmEnd}
          disabled={ending}
          style={({ pressed }) => [s.endBtn, pressed && { opacity: 0.85 }, ending && { opacity: 0.5 }]}
        >
          <Text style={s.endTxt}>{ending ? "Ending..." : "End route"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const useStyles = () => {
  const { palette } = useTheme();
  return useMemo(() => {
    const t = palette;
    return StyleSheet.create({
  card: {
    backgroundColor: t.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: t.color.line,
    padding: tokens.space.lg,
    ...t.shadow.card,
  },
  head: { flexDirection: "row", alignItems: "center", gap: tokens.space.sm },
  chip: {
    width: 26, height: 26, borderRadius: tokens.radius.sm,
    backgroundColor: t.color.grnWash, alignItems: "center", justifyContent: "center",
  },
  title: { color: t.color.ink, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.sm, flex: 1 },
  elapsed: { flexDirection: "row", alignItems: "center", gap: 4 },
  elapsedTxt: {
    color: t.color.ink3, fontFamily: tokens.font.mono, fontSize: tokens.size.xs,
    fontVariant: ["tabular-nums"],
  },
  track: {
    height: 6, borderRadius: 3, backgroundColor: t.color.lineSoft,
    marginTop: tokens.space.lg, overflow: "hidden",
  },
  fill: { height: "100%", borderRadius: 3, backgroundColor: t.color.grn },
  foot: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginTop: tokens.space.md, gap: tokens.space.md,
  },
  progress: { color: t.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.xs, flex: 1 },
  mono: {
    fontFamily: tokens.font.monoBold, fontSize: tokens.size.xs, color: t.color.ink2,
    fontVariant: ["tabular-nums"],
  },
  endBtn: {
    minHeight: 44, paddingHorizontal: tokens.space.lg, borderRadius: tokens.radius.md,
    backgroundColor: t.color.redWash, alignItems: "center", justifyContent: "center",
  },
  endTxt: { color: t.color.red, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
});
  }, [palette]);
};
