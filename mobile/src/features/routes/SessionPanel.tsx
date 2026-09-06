import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, Alert } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import Animated, {
  cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming,
} from "react-native-reanimated";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { Play, Route as RouteIcon, Square, Timer } from "lucide-react-native";
import { Sheet } from "@/components/Sheet";
import { PressCard } from "@/components/PressCard";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonRows } from "@/components/SkeletonRows";
import {
  useActiveSession, useRoutes, useVisitedToday, startSession, endSession,
  type RouteRow,
} from "@/data/routes";
import { qk } from "@/data/keys";
import { friendlyError } from "@/lib/rpc";
import { tokens } from "@/theme/tokens";
import { formatElapsed, useElapsed } from "@/features/home/useElapsed";

async function ensureLocation(): Promise<void> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return;
    await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  } catch {
    // graceful: session starts without coords; Next-Stop captures its own later
  }
}

function RouteOption({
  route, selected, onSelect, disabled,
}: {
  route: RouteRow;
  selected: boolean;
  onSelect: () => void;
  disabled: boolean;
}) {
  return (
    <PressCard onPress={onSelect} style={[s.option, selected && s.optionSelected, disabled && { opacity: 0.6 }]}>
      <View style={[s.radio, selected && { borderColor: tokens.color.brand }]}>
        {selected ? <View style={s.radioDot} /> : null}
      </View>
      <View style={s.optionMain}>
        <Text style={s.optionName} numberOfLines={1}>{route.name}</Text>
        <Text style={s.optionSub}>
          <Text style={s.mono}>{route.storeCount}</Text> stores
        </Text>
      </View>
    </PressCard>
  );
}

export function SessionPanel() {
  const qc = useQueryClient();
  const session = useActiveSession();
  const routes = useRoutes();
  const sessionId = session.data?.id ?? "";
  const visited = useVisitedToday(sessionId);
  const elapsedSec = useElapsed(session.data?.started_at);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [ending, setEnding] = useState(false);

  const pulse = useSharedValue(1);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));
  const hasActive = !!session.data;

  useEffect(() => {
    if (!hasActive) return;
    pulse.value = withRepeat(withTiming(0.35, { duration: 900 }), -1, true);
    return () => {
      cancelAnimation(pulse);
      pulse.value = 1;
    };
  }, [hasActive, pulse]);

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

  const active = session.data;
  const routesList = routes.data ?? [];
  const planned = active?.stores_planned ?? 0;
  const done = visited.data?.length ?? 0;
  const activeRouteName = routesList.find((r) => r.id === active?.route_id)?.name ?? "Active route";

  function openPicker() {
    const first = routesList[0];
    setSelectedRouteId((prev) => prev ?? first?.id ?? null);
    setPickerOpen(true);
  }

  async function start() {
    const route = routesList.find((r) => r.id === selectedRouteId);
    if (!route || starting) return;
    setStarting(true);
    try {
      await ensureLocation();
      await startSession(route.id, route.storeCount);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await qc.invalidateQueries({ queryKey: qk.activeSession() });
      setPickerOpen(false);
      Toast.show({ type: "success", text1: "Route session started", text2: route.name });
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Toast.show({ type: "error", text1: "Could not start session", text2: friendlyError(e) });
    } finally {
      setStarting(false);
    }
  }

  async function end() {
    if (!active || ending) return;
    setEnding(true);
    try {
      await endSession(active.id, done);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.activeSession() }),
        qc.invalidateQueries({ queryKey: qk.visited(active.id) }),
        qc.invalidateQueries({ queryKey: qk.today() }),
      ]);
      Toast.show({ type: "success", text1: "Route session ended" });
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Toast.show({ type: "error", text1: "Could not end session", text2: friendlyError(e) });
    } finally {
      setEnding(false);
    }
  }

  function confirmEnd() {
    Alert.alert(
      "End session?",
      `${done} of ${planned} stores visited so far.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "End session", style: "destructive", onPress: () => void end() },
      ],
    );
  }

  if (!active) {
    return (
      <>
        <View style={s.card}>
          <View style={s.idleRow}>
            <View style={s.idleChip}>
              <RouteIcon size={16} color={tokens.color.ink4} />
            </View>
            <View style={s.idleMain}>
              <Text style={s.idleTitle}>No active session</Text>
              <Text style={s.idleMsg}>Start a route to track visits today.</Text>
            </View>
          </View>
          <Pressable
            onPress={openPicker}
            style={({ pressed }) => [s.startBtn, pressed && { opacity: 0.85 }]}
            accessibilityLabel="Start route session"
          >
            <Play size={15} color={tokens.color.surface} />
            <Text style={s.startTxt}>Start route session</Text>
          </Pressable>
        </View>

        <Sheet visible={pickerOpen} onClose={() => setPickerOpen(false)} title="Pick a route">
          {routes.isLoading ? (
            <SkeletonRows rows={3} />
          ) : routesList.length === 0 ? (
            <EmptyState
              icon={RouteIcon}
              title="No routes"
              message="No active routes available yet."
            />
          ) : (
            <>
              {routesList.map((r) => (
                <RouteOption
                  key={r.id}
                  route={r}
                  selected={selectedRouteId === r.id}
                  onSelect={() => setSelectedRouteId(r.id)}
                  disabled={starting}
                />
              ))}
              <Pressable
                onPress={() => void start()}
                disabled={starting || !selectedRouteId}
                style={({ pressed }) => [
                  s.startBtn,
                  { marginTop: tokens.space.md },
                  pressed && { opacity: 0.85 },
                  (starting || !selectedRouteId) && { opacity: 0.5 },
                ]}
                accessibilityLabel="Confirm start route session"
              >
                <Play size={15} color={tokens.color.surface} />
                <Text style={s.startTxt}>{starting ? "Starting..." : "Start session"}</Text>
              </Pressable>
            </>
          )}
        </Sheet>
      </>
    );
  }

  return (
    <View style={s.card}>
      <View style={s.activeRow}>
        <View style={s.pulseWrap}>
          <Animated.View style={[s.pulseDot, pulseStyle]} />
          <View style={s.dot} />
        </View>
        <View style={s.activeMain}>
          <Text style={s.activeTitle} numberOfLines={1}>{activeRouteName}</Text>
          <Text style={s.activeSub}>
            <Text style={s.mono}>{done}</Text>/<Text style={s.mono}>{planned}</Text> stores
          </Text>
        </View>
        <View style={s.elapsed}>
          <Timer size={11} color={tokens.color.ink3} />
          <Text style={s.elapsedTxt}>{formatElapsed(elapsedSec)}</Text>
        </View>
        <Pressable
          onPress={confirmEnd}
          disabled={ending}
          style={({ pressed }) => [s.endBtn, pressed && { opacity: 0.85 }, ending && { opacity: 0.5 }]}
          accessibilityLabel="End route session"
        >
          <Square size={11} color={tokens.color.red} fill={tokens.color.red} />
          <Text style={s.endTxt}>{ending ? "Ending..." : "End"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: "rgba(226,232,240,0.6)",
    padding: tokens.space.lg,
    ...tokens.shadow.card,
  },
  mono: {
    fontFamily: tokens.font.monoBold,
    color: tokens.color.ink2,
    fontVariant: ["tabular-nums"],
  },
  idleRow: { flexDirection: "row", alignItems: "center", gap: tokens.space.md },
  idleChip: {
    width: 34, height: 34, borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.fill, alignItems: "center", justifyContent: "center",
  },
  idleMain: { flex: 1 },
  idleTitle: { color: tokens.color.ink, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.sm },
  idleMsg: { color: tokens.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.xs, marginTop: 1 },
  startBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: tokens.space.sm,
    minHeight: 44, borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.brand,
    marginTop: tokens.space.lg,
  },
  startTxt: { color: tokens.color.surface, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.sm },
  option: { padding: tokens.space.md },
  optionSelected: { borderColor: tokens.color.brand, borderWidth: 1.5 },
  radio: {
    width: 18, height: 18, borderRadius: 9,
    borderWidth: 2, borderColor: tokens.color.line,
    alignItems: "center", justifyContent: "center",
  },
  radioDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: tokens.color.brand },
  optionMain: { flex: 1 },
  optionName: { color: tokens.color.ink, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.sm },
  optionSub: { color: tokens.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.xs, marginTop: 1 },
  activeRow: { flexDirection: "row", alignItems: "center", gap: tokens.space.md },
  pulseWrap: { width: 22, height: 22, alignItems: "center", justifyContent: "center" },
  pulseDot: {
    position: "absolute", width: 22, height: 22, borderRadius: 11,
    backgroundColor: tokens.color.grn,
  },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: tokens.color.grn },
  activeMain: { flex: 1 },
  activeTitle: { color: tokens.color.ink, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.sm },
  activeSub: { color: tokens.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.xs, marginTop: 1 },
  elapsed: { flexDirection: "row", alignItems: "center", gap: 4 },
  elapsedTxt: {
    color: tokens.color.ink3, fontFamily: tokens.font.mono, fontSize: tokens.size.xs,
    fontVariant: ["tabular-nums"],
  },
  endBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    minHeight: 44, paddingHorizontal: tokens.space.md, borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.redWash,
  },
  endTxt: { color: tokens.color.red, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
});
