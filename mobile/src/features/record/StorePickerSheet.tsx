import { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput } from "react-native";
import * as Location from "expo-location";
import Toast from "react-native-toast-message";
import { MapPin, Search } from "lucide-react-native";
import { Sheet } from "@/components/Sheet";
import { PressCard } from "@/components/PressCard";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonRows } from "@/components/SkeletonRows";
import { useStores } from "@/data/stores";
import { haversineKm } from "@/lib/geo";
import { friendlyError } from "@/lib/rpc";
import { tokens } from "@/theme/tokens";

export interface PickedStore {
  id: string;
  name: string;
  area: string | null;
  customerName: string | null;
}

type Coords = { lat: number; lng: number } | null;

function distanceLabel(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

export function StorePickerSheet({
  visible, onClose, onSelect, accent = "brand",
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (store: PickedStore) => void;
  accent?: "brand" | "grn";
}) {
  const storesQ = useStores();
  const [search, setSearch] = useState("");
  const [nearest, setNearest] = useState(false);
  const [coords, setCoords] = useState<Coords>(null);
  const [locating, setLocating] = useState(false);

  const wash = accent === "grn" ? tokens.color.grnWash : tokens.color.brandWash;
  const fg = accent === "grn" ? tokens.color.grn : tokens.color.brand;

  async function toggleNearest() {
    if (nearest) {
      setNearest(false);
      return;
    }
    setNearest(true);
    if (coords) return;
    setLocating(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        setNearest(false);
        Toast.show({ type: "info", text1: "Location unavailable", text2: "Showing stores alphabetically" });
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    } catch {
      setNearest(false);
      Toast.show({ type: "info", text1: "Location unavailable", text2: "Showing stores alphabetically" });
    } finally {
      setLocating(false);
    }
  }

  const rows = useMemo(() => {
    const all = storesQ.data ?? [];
    const q = search.trim().toLowerCase();
    const filtered = q
      ? all.filter((st) =>
          [st.name, st.area, st.customerName, st.code].some((v) => (v ?? "").toLowerCase().includes(q)),
        )
      : all;
    if (nearest && coords) {
      return filtered
        .filter((st) => st.lat != null && st.lng != null)
        .map((st) => ({
          store: st,
          km: haversineKm(coords, { lat: st.lat as number, lng: st.lng as number }),
        }))
        .sort((a, b) => a.km - b.km);
    }
    return filtered.map((store) => ({ store, km: null as number | null }));
  }, [storesQ.data, search, nearest, coords]);

  return (
    <Sheet visible={visible} onClose={onClose} title="Select store">
      <View style={s.searchRow}>
        <View style={s.searchBox}>
          <Search size={15} color={tokens.color.ink4} />
          <TextInput
            style={s.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search name, area, customer"
            placeholderTextColor={tokens.color.ink4}
            accessible
            accessibilityLabel="Search stores"
          />
        </View>
        <Pressable
          onPress={() => void toggleNearest()}
          disabled={locating}
          accessibilityLabel="Sort stores by distance"
          accessibilityState={{ selected: nearest && !!coords }}
          style={({ pressed }) => [
            s.nearestBtn,
            { backgroundColor: nearest && coords ? wash : tokens.color.fill },
            pressed && { opacity: 0.85 },
            locating && { opacity: 0.6 },
          ]}
        >
          <MapPin size={14} color={nearest && coords ? fg : tokens.color.ink3} />
          <Text style={[s.nearestTxt, nearest && coords && { color: fg }]}>
            {locating ? "Locating..." : "Nearest"}
          </Text>
        </Pressable>
      </View>

      {nearest && coords ? (
        <Text style={s.hint}>Sorted by distance. Stores without GPS are hidden.</Text>
      ) : null}

      {storesQ.isLoading ? (
        <SkeletonRows rows={6} />
      ) : storesQ.isError ? (
        <EmptyState title="Could not load stores" message={friendlyError(storesQ.error)} />
      ) : rows.length === 0 ? (
        <EmptyState title="No stores found" message="Try a different search." />
      ) : (
        <View style={s.list}>
          {rows.map(({ store, km }) => (
            <PressCard
              key={store.id}
              onPress={() =>
                onSelect({
                  id: store.id,
                  name: store.name,
                  area: store.area,
                  customerName: store.customerName,
                })
              }
            >
              <View style={s.rowInner}>
                <View style={[s.chip, { backgroundColor: wash }]}>
                  <Text style={[s.chipTxt, { color: fg }]}>{store.name.slice(0, 1).toUpperCase()}</Text>
                </View>
                <View style={s.rowMain}>
                  <Text style={s.rowName} numberOfLines={1}>{store.name}</Text>
                  <Text style={s.rowSub} numberOfLines={1}>
                    {[store.customerName, store.area].filter(Boolean).join(" · ")}
                  </Text>
                </View>
                {km != null ? <Text style={s.dist}>{distanceLabel(km)}</Text> : null}
              </View>
            </PressCard>
          ))}
        </View>
      )}
    </Sheet>
  );
}

const s = StyleSheet.create({
  searchRow: { flexDirection: "row", gap: tokens.space.sm },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.sm,
    minHeight: 44,
    borderWidth: 1,
    borderColor: tokens.color.line,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.surface,
    paddingHorizontal: tokens.space.md,
  },
  searchInput: {
    flex: 1,
    color: tokens.color.ink,
    fontFamily: tokens.font.sansMed,
    fontSize: tokens.size.sm,
    paddingVertical: 0,
  },
  nearestBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minHeight: 44,
    paddingHorizontal: tokens.space.md,
    borderRadius: tokens.radius.md,
  },
  nearestTxt: { color: tokens.color.ink3, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
  hint: {
    color: tokens.color.ink4,
    fontFamily: tokens.font.sans,
    fontSize: tokens.size.eyebrow,
    marginTop: tokens.space.sm,
  },
  list: { gap: tokens.space.sm, marginTop: tokens.space.md },
  rowInner: { flexDirection: "row", alignItems: "center", gap: tokens.space.md, padding: tokens.space.md },
  chip: {
    width: 40, height: 40, borderRadius: tokens.radius.md,
    alignItems: "center", justifyContent: "center",
  },
  chipTxt: { fontFamily: tokens.font.sansBold, fontSize: tokens.size.base },
  rowMain: { flex: 1 },
  rowName: { color: tokens.color.ink, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.sm },
  rowSub: { color: tokens.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.xs, marginTop: 1 },
  dist: {
    color: tokens.color.ink2,
    fontFamily: tokens.font.mono,
    fontSize: tokens.size.xs,
    fontVariant: ["tabular-nums"],
  },
});
