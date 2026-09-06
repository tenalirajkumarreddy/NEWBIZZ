import { useState } from "react";
import { View, Text, StyleSheet, Pressable, Platform, Linking } from "react-native";
import { useRouter } from "expo-router";
import { ChevronDown, Footprints, HandCoins, IndianRupee, Navigation, Phone, Store } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { PressCard } from "@/components/PressCard";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonRows } from "@/components/SkeletonRows";
import { StatusBadge } from "@/components/StatusBadge";
import { useRouteStores } from "@/data/routes";
import { useSession } from "@/lib/session";
import { friendlyError } from "@/lib/rpc";
import { tokens } from "@/theme/tokens";
import { VisitReasonSheet, type VisitTargetStore } from "./VisitReasonSheet";

const ACCENTS = [tokens.color.brand, tokens.color.grn, tokens.color.amb, tokens.color.ink4];

function MiniAction({
  icon: Icon, label, onPress, tone = "brand",
}: {
  icon: LucideIcon; label: string; onPress: () => void; tone?: "brand" | "grn" | "amb";
}) {
  const wash = { brand: tokens.color.brandWash, grn: tokens.color.grnWash, amb: tokens.color.ambWash }[tone];
  const fg = { brand: tokens.color.brand, grn: tokens.color.grn, amb: tokens.color.amb }[tone];
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      style={({ pressed }) => [s.btn, { backgroundColor: wash }, pressed && { opacity: 0.8 }]}
    >
      <Icon size={14} color={fg} />
      <Text style={[s.btnTxt, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

export function RouteCard({
  index, routeId, name, storeCount, isActive, visitedSet, sessionId,
}: {
  index: number;
  routeId: string;
  name: string;
  storeCount: number;
  isActive: boolean;
  visitedSet: Set<string>;
  sessionId: string;
}) {
  const router = useRouter();
  const { can } = useSession();
  const stores = useRouteStores(routeId);
  const [expanded, setExpanded] = useState(false);
  const [visitTarget, setVisitTarget] = useState<VisitTargetStore | null>(null);
  const accent = ACCENTS[index % ACCENTS.length];

  function navigateTo(store: { name: string; lat: number | null; lng: number | null }) {
    const hasCoords = store.lat != null && store.lng != null;
    const q = hasCoords
      ? `${store.lat},${store.lng}`
      : encodeURIComponent(store.name);
    const url = hasCoords
      ? Platform.select({ ios: `maps:0,0?q=${q}`, android: `geo:0,0?q=${q}` })
      : `https://maps.google.com/?q=${q}`;
    if (url) void Linking.openURL(url);
  }

  return (
    <View>
      <PressCard onPress={() => setExpanded((v) => !v)} style={s.card}>
        <View style={[s.accent, { backgroundColor: accent }]} />
        <View style={s.head}>
          <View style={s.headMain}>
            <Text style={s.name} numberOfLines={1}>{name}</Text>
            <Text style={s.sub}>
              <Text style={s.mono}>{storeCount}</Text> stores
            </Text>
          </View>
          {isActive ? <StatusBadge label="Active" tone="grn" dot /> : null}
          <Pressable
            onPress={() => setExpanded((v) => !v)}
            accessibilityLabel={expanded ? `Collapse ${name}` : `Expand ${name}`}
            style={s.chevBtn}
          >
            <ChevronDown
              size={18}
              color={tokens.color.ink4}
              style={expanded ? { transform: [{ rotate: "180deg" }] } : undefined}
            />
          </Pressable>
        </View>
      </PressCard>

      {expanded ? (
        <View style={s.stores}>
          {stores.isLoading ? (
            <SkeletonRows rows={3} />
          ) : stores.isError ? (
            <EmptyState title="Could not load stores" message={friendlyError(stores.error)} />
          ) : (stores.data?.length ?? 0) === 0 ? (
            <EmptyState icon={Store} title="No stores on this route" />
          ) : (
            stores.data!.map((st) => (
              <View key={st.id} style={s.storeRow}>
                <View style={s.storeTop}>
                  <View
                    style={[
                      s.visitDot,
                      visitedSet.has(st.id) ? { backgroundColor: tokens.color.grn } : { backgroundColor: tokens.color.line },
                    ]}
                  />
                  <View style={s.storeMain}>
                    <Text style={s.storeName} numberOfLines={1}>{st.name}</Text>
                    <Text style={s.storeArea} numberOfLines={1}>{st.area ?? "Area not set"}</Text>
                  </View>
                </View>
                <View style={s.storeActions}>
                  {can("field.routes") && sessionId !== "" ? (
                    <MiniAction icon={Footprints} label="Visit" onPress={() => setVisitTarget(st)} />
                  ) : null}
                  {can("cashmemo.create") ? (
                    <MiniAction icon={IndianRupee} label="Sale" tone="grn" onPress={() => router.push(`/record?mode=sale&storeId=${st.id}`)} />
                  ) : null}
                  {can("receipt.record") ? (
                    <MiniAction icon={HandCoins} label="Collect" tone="amb" onPress={() => router.push(`/record?mode=collect&storeId=${st.id}`)} />
                  ) : null}
                  <MiniAction icon={Navigation} label="Go" onPress={() => navigateTo(st)} />
                  {st.phone ? (
                    <MiniAction icon={Phone} label="Call" onPress={() => void Linking.openURL(`tel:${st.phone}`)} />
                  ) : null}
                </View>
              </View>
            ))
          )}
        </View>
      ) : null}

      <VisitReasonSheet
        visible={visitTarget != null}
        onClose={() => setVisitTarget(null)}
        store={visitTarget}
        sessionId={sessionId}
      />
    </View>
  );
}

const s = StyleSheet.create({
  card: { overflow: "hidden" },
  accent: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4 },
  head: {
    flexDirection: "row", alignItems: "center", gap: tokens.space.md,
    paddingLeft: tokens.space.md,
    minHeight: 56,
  },
  headMain: { flex: 1 },
  name: { color: tokens.color.ink, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.sm },
  sub: { color: tokens.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.xs, marginTop: 1 },
  mono: {
    fontFamily: tokens.font.monoBold, color: tokens.color.ink2,
    fontVariant: ["tabular-nums"],
  },
  chevBtn: {
    width: 44, height: 44, alignItems: "center", justifyContent: "center",
    marginRight: -tokens.space.sm,
  },
  stores: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: "rgba(226,232,240,0.6)",
    paddingHorizontal: tokens.space.md,
    paddingVertical: tokens.space.sm,
    gap: tokens.space.xs,
  },
  storeRow: {
    gap: tokens.space.xs,
    paddingVertical: tokens.space.sm,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.lineSoft,
  },
  storeTop: { flexDirection: "row", alignItems: "center", gap: tokens.space.sm },
  visitDot: { width: 8, height: 8, borderRadius: 4 },
  storeMain: { flex: 1, minWidth: 0 },
  storeName: { color: tokens.color.ink, fontFamily: tokens.font.sansMed, fontSize: tokens.size.sm },
  storeArea: { color: tokens.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.xs, marginTop: 1 },
  storeActions: {
    flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: tokens.space.xs,
  },
  btn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    minHeight: 44, paddingHorizontal: tokens.space.sm,
    borderRadius: tokens.radius.sm,
  },
  btnTxt: { fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
});
