import { useMemo } from "react";
import {
  View, Text, StyleSheet, Pressable, Platform, Linking, ScrollView, Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, FileText, HandCoins, IndianRupee, Navigation, Phone, Receipt,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { GradientHeader } from "@/components/GradientHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { StatTile } from "@/components/StatTile";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonRows } from "@/components/SkeletonRows";
import { useStoreDetail } from "@/data/stores";
import { supabase } from "@/lib/supabase";
import { qk } from "@/data/keys";
import { useSession } from "@/lib/session";
import { friendlyError } from "@/lib/rpc";
import { moneyINR, todayIST } from "@/lib/format";
import { tokens, type Palette } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeContext";

interface ActivityRow {
  kind: string;
  ref_no: string;
  ref_id: string;
  event_date: string;
  event_ts: string;
  debit: number;
  credit: number;
  description: string;
  store_id: string;
  store_name: string;
  status: string;
}

function kindIcon(kind: string, t: Palette): { icon: LucideIcon; color: string } {
  if (kind === "sale") return { icon: IndianRupee, color: t.color.brand };
  if (kind === "payment" || kind === "receipt") return { icon: HandCoins, color: t.color.grn };
  return { icon: FileText, color: t.color.ink3 };
}

function ActivityCard({ row }: { row: ActivityRow }) {
  const { palette: t } = useTheme();
  const s = useStyles();
  const { icon: Icon, color } = kindIcon(row.kind, t);
  const credit = Number(row.credit ?? 0);
  const debit = Number(row.debit ?? 0);
  const amountTxt =
    credit > 0 ? `+${moneyINR(credit)}` : debit > 0 ? `-${moneyINR(debit)}` : "—";
  const amountColor = credit > 0 ? t.color.grn : debit > 0 ? t.color.red : t.color.ink4;
  return (
    <View style={s.actRow}>
      <View style={[s.actChip, { backgroundColor: t.color.fill }]}>
        <Icon size={14} color={color} />
      </View>
      <View style={s.actMain}>
        <View style={s.actTop}>
          <Text style={s.actRef} numberOfLines={1}>{row.ref_no || row.kind}</Text>
          <Text style={[s.actAmount, { color: amountColor }]}>{amountTxt}</Text>
        </View>
        {row.description ? (
          <Text style={s.actDesc} numberOfLines={1}>{row.description}</Text>
        ) : null}
        <Text style={s.actDate}>{row.event_date}</Text>
      </View>
    </View>
  );
}

export default function StoreProfileScreen() {
  const { palette: t } = useTheme();
  const s = useStyles();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { can } = useSession();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const storeId = typeof id === "string" ? id : "";

  const detail = useStoreDetail(storeId);
  const store = detail.data?.store as
    | (Record<string, unknown> & {
        id: string; name: string; code: string; kind: string; status: string;
        area: string | null; address_line: string | null; city: string | null;
        lat: number | null; lng: number | null; phone: string | null;
        customer: { id: string; name: string; phone: string | null; credit_limit: number } | null;
      })
    | undefined;
  const outstanding = detail.data?.outstanding ?? 0;

  const from = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  }, []);

  const activity = useQuery({
    queryKey: qk.ledger(`${store?.customer?.id ?? ""}:${storeId}`),
    enabled: !!store?.customer?.id,
    queryFn: async (): Promise<ActivityRow[]> => {
      const { data, error } = await supabase.rpc("customer_activity", {
        p_customer: store!.customer!.id,
        p_from: from,
        p_to: todayIST(),
        p_store: storeId,
      });
      if (error) throw error;
      return (data ?? []) as ActivityRow[];
    },
  });

  function navigate() {
    const hasCoords = store?.lat != null && store?.lng != null;
    const q = hasCoords
      ? `${store!.lat},${store!.lng}`
      : encodeURIComponent([store?.name, store?.area].filter(Boolean).join(", "));
    const url = hasCoords
      ? Platform.select({ ios: `maps:0,0?q=${q}`, android: `geo:0,0?q=${q}` })
      : `https://maps.google.com/?q=${q}`;
    if (url) void Linking.openURL(url);
  }

  if (!storeId) {
    return (
      <View style={s.root}>
        <GradientHeader title="Store" />
        <View style={s.body}>
          <EmptyState title="Store not found" message="No store id was provided." />
        </View>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <GradientHeader
        title={store?.name ?? "Store"}
        subtitle={[store?.customer?.name, store?.area].filter(Boolean).join(" · ") || "Store profile"}
        right={
          <Pressable
            onPress={() => router.back()}
            accessibilityLabel="Go back"
            style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.85 }]}
          >
            <ArrowLeft size={16} color="#ffffff" />
          </Pressable>
        }
      />

      {detail.isLoading ? (
        <View style={s.body}>
          <SkeletonRows rows={6} />
        </View>
      ) : detail.isError || !store ? (
        <View style={s.body}>
          <EmptyState
            title="Could not load store"
            message={detail.isError ? friendlyError(detail.error) : "Store not found."}
          />
        </View>
      ) : (
        <ScrollView
          style={s.flex}
          contentContainerStyle={[s.body, { paddingBottom: 24 + insets.bottom }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={s.hero}>
            {(store as any).image_url ? (
              <Pressable
                onPress={() => void Linking.openURL((store as any).image_url as string)}
                accessibilityLabel="Open store photo"
              >
                <Image source={{ uri: (store as any).image_url as string }} style={s.heroPhoto} />
              </Pressable>
            ) : null}
            <View style={s.heroTop}>
              <View style={s.chip}>
                <Text style={s.chipTxt}>{store.name.slice(0, 1).toUpperCase()}</Text>
              </View>
              <View style={s.heroMain}>
                <Text style={s.heroName} numberOfLines={1}>{store.name}</Text>
                <Text style={s.heroSub} numberOfLines={1}>
                  {store.customer?.name ?? "—"}
                  {store.phone ? ` · ${store.phone}` : ""}
                </Text>
                <Text style={s.heroCode}>{store.code}</Text>
              </View>
              <StatusBadge label={store.kind} tone="brand" />
            </View>
            <View style={s.heroActions}>
              <Pressable
                onPress={navigate}
                accessibilityLabel="Navigate to store"
                style={({ pressed }) => [s.heroBtn, { backgroundColor: t.color.brandWash }, pressed && { opacity: 0.85 }]}
              >
                <Navigation size={14} color={t.color.brand} />
                <Text style={[s.heroBtnTxt, { color: t.color.brand }]}>Navigate</Text>
              </Pressable>
              {store.phone ? (
                <Pressable
                  onPress={() => void Linking.openURL(`tel:${store.phone}`)}
                  accessibilityLabel="Call store"
                  style={({ pressed }) => [s.heroBtn, { backgroundColor: t.color.grnWash }, pressed && { opacity: 0.85 }]}
                >
                  <Phone size={14} color={t.color.grn} />
                  <Text style={[s.heroBtnTxt, { color: t.color.grn }]}>Call</Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          <View style={s.tiles}>
            <StatTile
              label="Outstanding"
              value={moneyINR(outstanding)}
              tone={outstanding > 0 ? "red" : "grn"}
            />
            <StatTile
              label="Credit limit"
              value={
                store.customer?.credit_limit != null && Number(store.customer.credit_limit) > 0
                  ? moneyINR(Number(store.customer.credit_limit))
                  : "No limit"
              }
              tone="brand"
            />
          </View>

          <View style={s.quickRow}>
            {can("cashmemo.create") ? (
              <Pressable
                onPress={() => router.push(`/record?mode=sale&storeId=${storeId}`)}
                accessibilityLabel="Record sale for this store"
                style={({ pressed }) => [s.quickBtn, pressed && { opacity: 0.9 }]}
              >
                <Receipt size={16} color={t.color.grn} />
                <Text style={[s.quickTxt, { color: t.color.grn }]}>Record Sale</Text>
              </Pressable>
            ) : null}
            {can("receipt.record") ? (
              <Pressable
                onPress={() => router.push(`/record?mode=collect&storeId=${storeId}`)}
                accessibilityLabel="Collect payment for this store"
                style={({ pressed }) => [s.quickBtn, pressed && { opacity: 0.9 }]}
              >
                <HandCoins size={16} color={t.color.amb} />
                <Text style={[s.quickTxt, { color: t.color.amb }]}>Collect</Text>
              </Pressable>
            ) : null}
          </View>

          <Text style={s.sectionTitle}>Recent activity</Text>
          {activity.isLoading ? (
            <SkeletonRows rows={4} />
          ) : activity.isError ? (
            <EmptyState title="Could not load activity" message={friendlyError(activity.error)} />
          ) : (activity.data?.length ?? 0) === 0 ? (
            <EmptyState icon={FileText} title="No recent activity" message="Sales and payments from the last 90 days will appear here." />
          ) : (
            <View style={[s.actCard, s.actList]}>
              {activity.data!.map((row, i) => (
                <ActivityCard key={`${row.ref_id}-${i}`} row={row} />
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const useStyles = () => {
  const { palette } = useTheme();
  return useMemo(() => {
    const t = palette;
    return StyleSheet.create({
  root: { flex: 1, backgroundColor: t.color.bg },
  flex: { flex: 1 },
  body: {
    paddingHorizontal: tokens.space.lg,
    paddingTop: tokens.space.lg,
    gap: tokens.space.md,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    margin: -tokens.space.sm,
  },
  hero: {
    backgroundColor: t.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: t.color.line,
    padding: tokens.space.md,
    gap: tokens.space.md,
    ...t.shadow.card,
  },
  heroPhoto: {
    width: "100%",
    height: 170,
    borderRadius: tokens.radius.md,
    backgroundColor: t.color.fill,
  },
  heroTop: { flexDirection: "row", alignItems: "center", gap: tokens.space.md },
  chip: {
    width: 44, height: 44, borderRadius: tokens.radius.md,
    backgroundColor: t.color.brandWash,
    alignItems: "center", justifyContent: "center",
  },
  chipTxt: { color: t.color.brand, fontFamily: tokens.font.sansBold, fontSize: tokens.size.lg },
  heroMain: { flex: 1, minWidth: 0 },
  heroName: { color: t.color.ink, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.base },
  heroSub: { color: t.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.xs, marginTop: 1 },
  heroCode: {
    color: t.color.ink4, fontFamily: tokens.font.mono, fontSize: tokens.size.xs,
    marginTop: 2, fontVariant: ["tabular-nums"],
  },
  heroActions: { flexDirection: "row", gap: tokens.space.sm },
  heroBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minHeight: 44,
    paddingHorizontal: tokens.space.md,
    borderRadius: tokens.radius.md,
  },
  heroBtnTxt: { fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
  tiles: { flexDirection: "row", gap: tokens.space.sm },
  quickRow: { flexDirection: "row", gap: tokens.space.sm },
  quickBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: tokens.space.sm,
    minHeight: 48,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: t.color.line,
    backgroundColor: t.color.surface,
    ...t.shadow.card,
  },
  quickTxt: { fontFamily: tokens.font.sansSemi, fontSize: tokens.size.sm },
  sectionTitle: {
    color: t.color.ink,
    fontFamily: tokens.font.sansSemi,
    fontSize: tokens.size.sm,
    marginTop: tokens.space.xs,
  },
  actCard: {
    backgroundColor: t.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: t.color.line,
    ...t.shadow.card,
  },
  actList: { padding: tokens.space.sm, gap: 2 },
  actRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.md,
    paddingVertical: tokens.space.sm,
    paddingHorizontal: tokens.space.sm,
    borderBottomWidth: 1,
    borderBottomColor: t.color.lineSoft,
  },
  actChip: {
    width: 32, height: 32, borderRadius: tokens.radius.sm,
    alignItems: "center", justifyContent: "center",
  },
  actMain: { flex: 1, minWidth: 0 },
  actTop: { flexDirection: "row", alignItems: "center", gap: tokens.space.sm },
  actRef: {
    flex: 1, color: t.color.ink, fontFamily: tokens.font.mono,
    fontSize: tokens.size.xs,
  },
  actAmount: {
    fontFamily: tokens.font.monoBold, fontSize: tokens.size.xs,
    fontVariant: ["tabular-nums"],
  },
  actDesc: { color: t.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow, marginTop: 1 },
  actDate: {
    color: t.color.ink4, fontFamily: tokens.font.sans,
    fontSize: tokens.size.eyebrow, marginTop: 1,
  },
});
  }, [palette]);
};
