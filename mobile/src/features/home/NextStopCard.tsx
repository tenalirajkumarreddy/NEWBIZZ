import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, Linking, Platform } from "react-native";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import {
  Navigation, Phone, IndianRupee, HandCoins, Footprints, MapPin,
} from "lucide-react-native";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonRows } from "@/components/SkeletonRows";
import { useActiveSession, useRouteStores, useVisitedToday, recordVisit, type RouteStoreRow } from "@/data/routes";
import { qk } from "@/data/keys";
import { useSession } from "@/lib/session";
import { haversineKm } from "@/lib/geo";
import { friendlyError } from "@/lib/rpc";
import { tokens } from "@/theme/tokens";
import type { LucideIcon } from "lucide-react-native";

interface Stop {
  store: { id: string; name: string; area: string | null; phone: string | null; lat: number | null; lng: number | null };
  distanceKm: number | null;
}

type Coords = { lat: number; lng: number } | null;

function useCoords(enabled: boolean): { coords: Coords; locating: boolean } {
  const [coords, setCoords] = useState<Coords>(null);
  const [locating, setLocating] = useState(enabled);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    setLocating(true);
    (async () => {
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (!perm.granted) return;
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (alive) setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      } catch {
        // graceful: selection falls back to first unvisited store
      } finally {
        if (alive) setLocating(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [enabled]);

  return { coords, locating };
}

function ActionBtn({
  icon: Icon, label, onPress, tone = "brand",
}: {
  icon: LucideIcon; label: string; onPress: () => void; tone?: "brand" | "grn" | "amb";
}) {
  const wash = { brand: tokens.color.brandWash, grn: tokens.color.grnWash, amb: tokens.color.ambWash }[tone];
  const fg = { brand: tokens.color.brand, grn: tokens.color.grn, amb: tokens.color.amb }[tone];
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.btn, { backgroundColor: wash }, pressed && { opacity: 0.8 }]}>
      <Icon size={14} color={fg} />
      <Text style={[s.btnTxt, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

export function NextStopCard() {
  const router = useRouter();
  const qc = useQueryClient();
  const { can } = useSession();
  const [marking, setMarking] = useState(false);

  const session = useActiveSession();
  const active = !!session.data;
  const routeId = session.data?.route_id ?? "";
  const routeStores = useRouteStores(routeId);
  const visited = useVisitedToday(session.data?.id ?? "");
  const { coords, locating } = useCoords(active);

  if (session.isLoading || (active && (routeStores.isLoading || visited.isLoading))) {
    return (
      <View style={s.card}>
        <SkeletonRows rows={3} />
      </View>
    );
  }

  if (session.isError || routeStores.isError) {
    return (
      <EmptyState
        icon={MapPin}
        title="Could not load next stop"
        message={friendlyError(session.error ?? routeStores.error)}
      />
    );
  }

  if (!active) {
    return (
      <EmptyState
        icon={MapPin}
        title="No next stop"
        message="Start a route session to get turn-by-turn stops."
      />
    );
  }

  const visitedSet = new Set(visited.data ?? []);
  const unvisited = (routeStores.data ?? []).filter((r) => !visitedSet.has(r.id));
  if (unvisited.length === 0) {
    return (
      <EmptyState
        icon={Footprints}
        title="All stores visited"
        message="Every store on this route is done. Great run."
      />
    );
  }

  let stop: Stop | null = null;
  if (coords) {
    const withCoords = unvisited.filter((r) => r.lat != null && r.lng != null);
    if (withCoords.length > 0) {
      let best: RouteStoreRow | null = null;
      let bestKm = Number.POSITIVE_INFINITY;
      for (const r of withCoords) {
        const km = haversineKm(coords, { lat: r.lat as number, lng: r.lng as number });
        if (km < bestKm) {
          bestKm = km;
          best = r;
        }
      }
      if (best) stop = { store: best, distanceKm: bestKm };
    }
  }
  if (!stop) {
    const first = unvisited[0];
    stop = { store: first, distanceKm: null };
  }

  const { store, distanceKm } = stop;
  const areaLine = store.area ?? "Area not set";

  async function markVisited() {
    setMarking(true);
    try {
      await recordVisit(store.id, coords?.lat ?? null, coords?.lng ?? null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await qc.invalidateQueries({ queryKey: qk.visited(session.data!.id) });
      Toast.show({ type: "success", text1: "Visit recorded", text2: store.name });
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Toast.show({ type: "error", text1: "Could not record visit", text2: friendlyError(e) });
    } finally {
      setMarking(false);
    }
  }

  function navigate() {
    const hasCoords = store.lat != null && store.lng != null;
    const q = hasCoords
      ? `${store.lat},${store.lng}`
      : encodeURIComponent([store.name, store.area].filter(Boolean).join(", "));
    const url = hasCoords
      ? Platform.select({ ios: `maps:0,0?q=${q}`, android: `geo:0,0?q=${q}` })
      : `https://maps.google.com/?q=${q}`;
    if (url) void Linking.openURL(url);
  }

  function call() {
    if (!store.phone) {
      Toast.show({ type: "info", text1: "No phone number on file" });
      return;
    }
    void Linking.openURL(`tel:${store.phone}`);
  }

  return (
    <View style={s.card}>
      <View style={s.head}>
        <View style={s.initial}>
          <Text style={s.initialTxt}>{store.name.slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={s.headTxt}>
          <Text style={s.name} numberOfLines={1}>{store.name}</Text>
          <Text style={s.area} numberOfLines={1}>{areaLine}</Text>
        </View>
        <View style={s.distChip}>
          {distanceKm != null ? (
            <Text style={s.distTxt}>{distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(1)} km`}</Text>
          ) : locating ? (
            <Text style={s.distTxt}>Locating...</Text>
          ) : (
            <Text style={s.distTxt}>Next up</Text>
          )}
        </View>
      </View>

      <View style={s.actions}>
        <ActionBtn icon={Navigation} label="Navigate" onPress={navigate} />
        <ActionBtn icon={Phone} label="Call" onPress={call} />
        {can("cashmemo.create") ? (
          <ActionBtn icon={IndianRupee} label="Sale" tone="grn" onPress={() => router.push(`/record?mode=sale&storeId=${store.id}`)} />
        ) : null}
        {can("receipt.record") ? (
          <ActionBtn icon={HandCoins} label="Collect" tone="amb" onPress={() => router.push(`/record?mode=collect&storeId=${store.id}`)} />
        ) : null}
        {can("field.routes") ? (
          <ActionBtn icon={Footprints} label={marking ? "..." : "Visit"} onPress={() => void markVisited()} />
        ) : null}
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
  head: { flexDirection: "row", alignItems: "center", gap: tokens.space.md },
  initial: {
    width: 40, height: 40, borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.brandWash,
    alignItems: "center", justifyContent: "center",
  },
  initialTxt: { color: tokens.color.brand, fontFamily: tokens.font.sansBold, fontSize: tokens.size.base },
  headTxt: { flex: 1 },
  name: { color: tokens.color.ink, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.sm },
  area: { color: tokens.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.xs, marginTop: 1 },
  distChip: {
    backgroundColor: tokens.color.fill, borderRadius: tokens.radius.sm,
    paddingHorizontal: tokens.space.sm, paddingVertical: 4,
  },
  distTxt: {
    color: tokens.color.ink2, fontFamily: tokens.font.mono, fontSize: tokens.size.eyebrow,
    fontVariant: ["tabular-nums"],
  },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: tokens.space.sm, marginTop: tokens.space.lg },
  btn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    minHeight: 44, paddingHorizontal: tokens.space.md,
    borderRadius: tokens.radius.md,
  },
  btnTxt: { fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
});
