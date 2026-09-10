import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import * as Location from "expo-location";
import { MapPinOff, Store as StoreIcon } from "lucide-react-native";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonRows } from "@/components/SkeletonRows";
import { PressCard } from "@/components/PressCard";
import { useStores } from "@/data/stores";
import { useSession } from "@/lib/session";
import { haversineKm } from "@/lib/geo";
import { friendlyError } from "@/lib/rpc";
import { tokens } from "@/theme/tokens";
import type { StoreRow } from "@/data/stores";
import type { ResolvedStore } from "@/data/qr";
import { useTheme } from "@/theme/ThemeContext";

type Coords = { lat: number; lng: number } | null;

function distanceLabel(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

export function NearbyStores({
  onOpen, refreshKey,
}: {
  onOpen: (store: ResolvedStore) => void;
  refreshKey: number;
}) {
  const s = useStyles();
  const { can } = useSession();
  const stores = useStores();

  const [coords, setCoords] = useState<Coords>(null);
  const [locating, setLocating] = useState(true);
  const [denied, setDenied] = useState(false);

  const locate = useCallback(async () => {
    setLocating(true);
    setDenied(false);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        setDenied(true);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    } catch {
      setDenied(true);
    } finally {
      setLocating(false);
    }
  }, []);

  useEffect(() => {
    void locate();
  }, [locate, refreshKey]);

  const nearby: { store: StoreRow; km: number }[] = useMemo(() => {
    const list = stores.data ?? [];
    if (!coords) return [];
    return list
      .filter((st) => st.lat != null && st.lng != null)
      .map((st) => ({
        store: st,
        km: haversineKm(coords, { lat: st.lat as number, lng: st.lng as number }),
      }))
      .sort((a, b) => a.km - b.km)
      .slice(0, 5);
  }, [stores.data, coords]);

  function open(st: StoreRow) {
    onOpen({
      found: true,
      code: st.code ?? st.id,
      store_id: st.id,
      store_name: st.name,
      customer_name: st.customerName ?? undefined,
      area: st.area ?? undefined,
      lat: st.lat,
      lng: st.lng,
      outstanding: undefined,
      can_sell: can("cashmemo.create"),
      can_collect: can("receipt.record"),
      can_visit: can("field.routes"),
      can_manage: can("customer.manage"),
    });
  }

  if (denied) {
    return (
      <EmptyState
        icon={MapPinOff}
        title="Location needed for nearby stores"
        message="Allow location access so we can sort stores by distance."
        actionLabel="Retry"
        onAction={() => void locate()}
      />
    );
  }

  if (stores.isLoading || locating) {
    return <SkeletonRows rows={5} />;
  }

  if (stores.isError) {
    return <EmptyState title="Could not load stores" message={friendlyError(stores.error)} />;
  }

  if (nearby.length === 0) {
    return (
      <EmptyState
        icon={StoreIcon}
        title="No nearby stores"
        message="Stores with saved GPS coordinates will show here, sorted by distance."
      />
    );
  }

  return (
    <View style={s.list}>
      {nearby.map(({ store, km }) => (
        <PressCard key={store.id} onPress={() => open(store)} style={s.rowCard}>
          <View style={s.rowInner}>
            <View style={s.chip}>
              <Text style={s.chipTxt}>{store.name.slice(0, 1).toUpperCase()}</Text>
            </View>
            <View style={s.rowMain}>
              <Text style={s.rowName} numberOfLines={1}>{store.name}</Text>
              <Text style={s.rowSub} numberOfLines={1}>
                {[store.customerName, store.area].filter(Boolean).join(" · ")}
              </Text>
            </View>
            <Text style={s.dist}>{distanceLabel(km)}</Text>
          </View>
        </PressCard>
      ))}
    </View>
  );
}

const useStyles = () => {
  const { palette } = useTheme();
  return useMemo(() => {
    const t = palette;
    return StyleSheet.create({
  list: { gap: tokens.space.sm },
  rowCard: {},
  rowInner: { flexDirection: "row", alignItems: "center", gap: tokens.space.md, padding: tokens.space.md },
  chip: {
    width: 40, height: 40, borderRadius: tokens.radius.md,
    backgroundColor: t.color.brandWash,
    alignItems: "center", justifyContent: "center",
  },
  chipTxt: { color: t.color.brand, fontFamily: tokens.font.sansBold, fontSize: tokens.size.base },
  rowMain: { flex: 1 },
  rowName: { color: t.color.ink, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.sm },
  rowSub: { color: t.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.xs, marginTop: 1 },
  dist: {
    color: t.color.ink2, fontFamily: tokens.font.mono, fontSize: tokens.size.xs,
    fontVariant: ["tabular-nums"],
  },
});
  }, [palette]);
};
