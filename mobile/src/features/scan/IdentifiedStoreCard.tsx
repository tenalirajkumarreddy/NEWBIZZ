import { View, Text, StyleSheet, Pressable } from "react-native";
import { TriangleAlert, Link2 } from "lucide-react-native";
import { StatusBadge } from "@/components/StatusBadge";
import { moneyINR } from "@/lib/format";
import { tokens } from "@/theme/tokens";
import { StoreActionsRow } from "./StoreActionsRow";
import type { ResolvedStore } from "@/data/qr";

export function IdentifiedStoreCard({
  store, onAfterVisit,
}: {
  store: ResolvedStore;
  onAfterVisit?: () => void;
}) {
  const outstanding = store.outstanding;
  const hasDues = outstanding != null && outstanding > 0;

  return (
    <View style={s.card}>
      <View style={s.headRow}>
        <View style={s.chip}>
          <Text style={s.chipTxt}>{(store.store_name ?? "S").slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={s.headMain}>
          <Text style={s.name} numberOfLines={1}>{store.store_name}</Text>
          <Text style={s.sub} numberOfLines={1}>
            {[store.customer_name, store.area].filter(Boolean).join(" · ")}
          </Text>
        </View>
        <StatusBadge label="Store identified" tone="grn" dot />
      </View>

      <View style={s.statRow}>
        {outstanding != null ? (
          <View style={s.stat}>
            <Text style={s.statLabel}>Outstanding</Text>
            <Text style={[s.statVal, hasDues ? { color: tokens.color.red } : { color: tokens.color.grn }]}>
              {hasDues ? moneyINR(outstanding) : "No dues"}
            </Text>
          </View>
        ) : null}
        {(store.open_challans ?? 0) > 0 ? (
          <StatusBadge label={`${store.open_challans} open challans`} tone="amb" />
        ) : null}
      </View>

      <View style={s.actionsWrap}>
        <StoreActionsRow store={store} onAfterVisit={onAfterVisit} />
      </View>
    </View>
  );
}

export function UnlinkedCodeCard({
  code, canManage, onLink,
}: {
  code: string;
  canManage: boolean;
  onLink: () => void;
}) {
  return (
    <View style={[s.card, s.amberCard]}>
      <View style={s.amberIcon}>
        <TriangleAlert size={22} color={tokens.color.amb} />
      </View>
      <Text style={s.amberTitle}>Code not linked</Text>
      <Text style={s.amberMsg}>
        This code is not linked to any store yet.
      </Text>
      <Text style={s.amberCode}>{code}</Text>
      {canManage ? (
        <Pressable
          onPress={onLink}
          accessibilityLabel="Link this code to a store"
          style={({ pressed }) => [s.linkBtn, pressed && { opacity: 0.85 }]}
        >
          <View style={s.linkBtnInner}>
            <Link2 size={15} color={tokens.color.surface} />
            <Text style={s.linkBtnTxt}>Link to a store</Text>
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    padding: tokens.space.lg,
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: "rgba(226,232,240,0.6)",
    ...tokens.shadow.card,
  },
  headRow: { flexDirection: "row", alignItems: "center", gap: tokens.space.md },
  chip: {
    width: 40, height: 40, borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.brandWash,
    alignItems: "center", justifyContent: "center",
  },
  chipTxt: { color: tokens.color.brand, fontFamily: tokens.font.sansBold, fontSize: tokens.size.base },
  headMain: { flex: 1 },
  name: { color: tokens.color.ink, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.sm },
  sub: { color: tokens.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.xs, marginTop: 1 },
  statRow: {
    flexDirection: "row", alignItems: "center", gap: tokens.space.md,
    marginTop: tokens.space.md,
  },
  stat: { flex: 1 },
  statLabel: {
    color: tokens.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow,
    textTransform: "uppercase", letterSpacing: 0.5,
  },
  statVal: {
    fontFamily: tokens.font.monoBold, fontSize: tokens.size.base,
    fontVariant: ["tabular-nums"], marginTop: 2,
  },
  actionsWrap: { marginTop: tokens.space.lg },
  amberCard: {
    borderWidth: 1,
    borderColor: tokens.color.ambWash,
    backgroundColor: tokens.color.surface,
    alignItems: "center",
    paddingVertical: tokens.space.xl,
  },
  amberIcon: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: tokens.color.ambWash,
    alignItems: "center", justifyContent: "center",
  },
  amberTitle: {
    color: tokens.color.ink, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.sm,
    marginTop: tokens.space.md,
  },
  amberMsg: {
    color: tokens.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.xs,
    marginTop: tokens.space.xs, textAlign: "center", lineHeight: 17,
  },
  amberCode: {
    color: tokens.color.ink2, fontFamily: tokens.font.mono, fontSize: tokens.size.xs,
    marginTop: tokens.space.sm, fontVariant: ["tabular-nums"],
  },
  linkBtn: { alignSelf: "stretch", marginTop: tokens.space.lg },
  linkBtnInner: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: tokens.space.sm,
    minHeight: 44, borderRadius: tokens.radius.md, backgroundColor: tokens.color.amb,
    paddingHorizontal: tokens.space.lg,
  },
  linkBtnTxt: { color: tokens.color.surface, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.sm },
});
