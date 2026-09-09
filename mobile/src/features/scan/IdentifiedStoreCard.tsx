import { View, Text, StyleSheet, Pressable, Linking, Alert, Image } from "react-native";
import { TriangleAlert, Link2, Store as StoreIcon, Phone, ImageOff } from "lucide-react-native";
import { StatusBadge } from "@/components/StatusBadge";
import { moneyINR } from "@/lib/format";
import { tokens } from "@/theme/tokens";
import { StoreActionsRow } from "./StoreActionsRow";
import type { ResolvedStore } from "@/data/qr";

function StorePhoto({ uri }: { uri: string | null | undefined }) {
  if (uri) {
    return (
      <View style={s.photoWrap}>
        <Pressable
          onPress={() => {
            if (uri) void Linking.openURL(uri);
          }}
          accessibilityLabel="Open store photo"
        >
          <Image source={{ uri }} style={s.photo} resizeMode="cover" accessible accessibilityLabel="Store photo" />
        </Pressable>
      </View>
    );
  }
  return (
    <View style={[s.photoWrap, s.photoFallback]}>
      <ImageOff size={18} color={tokens.color.ink4} />
      <Text style={s.photoFallbackTxt}>No photo</Text>
    </View>
  );
}

export function IdentifiedStoreCard({
  store, onAfterVisit,
}: {
  store: ResolvedStore;
  onAfterVisit?: () => void;
}) {
  const outstanding = store.outstanding;
  const hasDues = outstanding != null && outstanding > 0;
  const phone = store.phone ?? null;

  function call() {
    if (!phone) return;
    void Linking.openURL(`tel:${phone}`);
  }

  function confirmCall() {
    if (!phone) return;
    Alert.alert("Call store", `Call ${store.store_name ?? "store"} at ${phone}?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Call", onPress: call },
    ]);
  }

  return (
    <View style={s.card}>
      <View style={s.headRow}>
        <StorePhoto uri={store.image_url ?? null} />
        <View style={s.headMain}>
          <Text style={s.name} numberOfLines={1}>{store.store_name}</Text>
          <Text style={s.sub} numberOfLines={1}>
            {[store.customer_name, store.area].filter(Boolean).join(" · ")}
          </Text>
          {store.contact_name ? (
            <Text style={s.contact} numberOfLines={1}>Contact: {store.contact_name}</Text>
          ) : null}
          {phone ? (
            <Pressable
              onPress={confirmCall}
              accessibilityLabel={`Call ${phone}`}
              style={({ pressed }) => [s.callBtn, pressed && { opacity: 0.8 }]}
            >
              <Phone size={12} color={tokens.color.grn} />
              <Text style={[s.callTxt, { color: tokens.color.grn }]} numberOfLines={1}>{phone}</Text>
            </Pressable>
          ) : null}
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
  code, canManage, onLink, onCreate,
}: {
  code: string;
  canManage: boolean;
  onLink: () => void;
  onCreate: () => void;
}) {
  return (
    <View style={[s.card, s.amberCard]}>
      <View style={s.amberIcon}>
        <TriangleAlert size={22} color={tokens.color.amb} />
      </View>
      <Text style={s.amberTitle}>No store found</Text>
      <Text style={s.amberMsg}>This QR code is not assigned to any store yet.</Text>
      <Text style={s.amberCode}>{code}</Text>
      {canManage ? (
        <View style={s.amberActions}>
          <Pressable
            onPress={onCreate}
            accessibilityLabel="Create a new store for this code"
            style={({ pressed }) => [s.amberBtn, s.amberBtnPrimary, pressed && { opacity: 0.85 }]}
          >
            <StoreIcon size={15} color="#ffffff" />
            <Text style={s.amberBtnTxtOn}>Create store</Text>
          </Pressable>
          <Pressable
            onPress={onLink}
            accessibilityLabel="Assign this code to an existing store"
            style={({ pressed }) => [s.amberBtn, s.amberBtnGhost, pressed && { opacity: 0.85 }]}
          >
            <Link2 size={15} color={tokens.color.amb} />
            <Text style={s.amberBtnTxtOff}>Assign store</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={s.amberHint}>Ask your manager to link this code.</Text>
      )}
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
  photoWrap: {
    width: 56,
    height: 56,
    borderRadius: tokens.radius.md,
    overflow: "hidden",
    backgroundColor: tokens.color.fill,
  },
  photo: { width: 56, height: 56 },
  photoFallback: { alignItems: "center", justifyContent: "center", gap: 2 },
  photoFallbackTxt: { color: tokens.color.ink4, fontFamily: tokens.font.sans, fontSize: 9 },
  headMain: { flex: 1, minWidth: 0 },
  name: { color: tokens.color.ink, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.sm },
  sub: { color: tokens.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.xs, marginTop: 1 },
  contact: { color: tokens.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow, marginTop: 1 },
  callBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
    alignSelf: "flex-start",
    minHeight: 24,
  },
  callTxt: { fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs, fontVariant: ["tabular-nums"] },
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
  amberActions: {
    alignSelf: "stretch",
    flexDirection: "row",
    gap: tokens.space.sm,
    marginTop: tokens.space.lg,
  },
  amberBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 46,
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.space.sm,
  },
  amberBtnPrimary: { backgroundColor: tokens.color.amb },
  amberBtnGhost: {
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: "rgba(217,119,6,0.4)",
  },
  amberBtnTxtOn: { color: "#ffffff", fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
  amberBtnTxtOff: { color: tokens.color.amb, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
  amberHint: {
    color: tokens.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.xs,
    marginTop: tokens.space.lg, textAlign: "center",
  },
});
