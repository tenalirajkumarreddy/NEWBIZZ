import { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Store as StoreIcon } from "lucide-react-native";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonRows } from "@/components/SkeletonRows";
import { StoreCard } from "./StoreCard";
import { useStores } from "@/data/stores";
import { useRoutes, useActiveSession } from "@/data/routes";
import { useSession } from "@/lib/session";
import { friendlyError } from "@/lib/rpc";
import { tokens } from "@/theme/tokens";

export function StoresTabBody({ showRouteFilter }: { showRouteFilter: boolean }) {
  const { can } = useSession();
  const [search, setSearch] = useState("");
  const [routeId, setRouteId] = useState<string | undefined>(undefined);

  const routes = useRoutes();
  const stores = useStores(showRouteFilter ? routeId : undefined);
  const session = useActiveSession();
  const sessionId = session.data?.id ?? "";

  const rows = useMemo(() => {
    const all = stores.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter((st) =>
      [st.name, st.area, st.customerName, st.code].some((v) =>
        (v ?? "").toLowerCase().includes(q),
      ),
    );
  }, [stores.data, search]);

  return (
    <View style={s.body}>
      <View style={s.searchBox}>
        <Search size={15} color={tokens.color.ink4} />
        <TextInput
          style={s.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search stores, areas, customers"
          placeholderTextColor={tokens.color.ink4}
          accessible
          accessibilityLabel="Search stores"
        />
      </View>

      {showRouteFilter ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chipsRow}
        >
          <Pressable
            onPress={() => setRouteId(undefined)}
            accessibilityLabel="All routes filter"
            accessibilityState={{ selected: routeId === undefined }}
            style={({ pressed }) => [s.chip, routeId === undefined && s.chipOn, pressed && { opacity: 0.85 }]}
          >
            <Text style={[s.chipTxt, routeId === undefined && s.chipTxtOn]}>All routes</Text>
          </Pressable>
          {(routes.data ?? []).map((r) => {
            const on = routeId === r.id;
            return (
              <Pressable
                key={r.id}
                onPress={() => setRouteId(on ? undefined : r.id)}
                accessibilityLabel={`${r.name} filter`}
                accessibilityState={{ selected: on }}
                style={({ pressed }) => [s.chip, on && s.chipOn, pressed && { opacity: 0.85 }]}
              >
                <Text style={[s.chipTxt, on && s.chipTxtOn]} numberOfLines={1}>{r.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {stores.isLoading ? (
        <SkeletonRows rows={5} />
      ) : stores.isError ? (
        <EmptyState title="Could not load stores" message={friendlyError(stores.error)} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={StoreIcon}
          title={search ? "No stores found" : "No stores yet"}
          message={search ? "Try a different search." : "Stores will appear here once added."}
        />
      ) : (
        <View style={s.list}>
          {rows.map((st) => (
            <StoreCard
              key={st.id}
              store={st}
              canVisit={can("field.routes")}
              sessionId={sessionId}
            />
          ))}
        </View>
      )}
    </View>
  );
}

export function useStoresRefresh() {
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  async function onRefresh() {
    setRefreshing(true);
    try {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["stores"] }),
        qc.invalidateQueries({ queryKey: ["routes"] }),
      ]);
    } finally {
      setRefreshing(false);
    }
  }
  return { refreshing, onRefresh };
}

export function AddStoreFab({ onPress }: { onPress: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel="Add store"
      style={({ pressed }) => [
        s.fab,
        { bottom: 62 + insets.bottom + 12 },
        pressed && { opacity: 0.9 },
      ]}
    >
      <Plus size={24} color="#ffffff" />
    </Pressable>
  );
}

const s = StyleSheet.create({
  body: {
    paddingHorizontal: tokens.space.lg,
    paddingTop: tokens.space.lg,
    gap: tokens.space.md,
  },
  searchBox: {
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
  chipsRow: { gap: tokens.space.sm, paddingVertical: 2 },
  chip: {
    minHeight: 44,
    paddingHorizontal: tokens.space.md,
    borderRadius: tokens.radius.full,
    borderWidth: 1,
    borderColor: tokens.color.line,
    backgroundColor: tokens.color.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  chipOn: { backgroundColor: tokens.color.brand, borderColor: tokens.color.brand },
  chipTxt: { color: tokens.color.ink2, fontFamily: tokens.font.sansMed, fontSize: tokens.size.xs },
  chipTxtOn: { color: tokens.color.surface, fontFamily: tokens.font.sansSemi },
  list: { gap: tokens.space.md },
  fab: {
    position: "absolute",
    right: tokens.space.lg,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: tokens.color.brand,
    alignItems: "center",
    justifyContent: "center",
    ...tokens.shadow.fab,
  },
});
