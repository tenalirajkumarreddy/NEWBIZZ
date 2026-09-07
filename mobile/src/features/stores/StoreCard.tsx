import { useState } from "react";
import {
  View, Text, StyleSheet, Pressable, Platform, Linking,
} from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import {
  Footprints, HandCoins, IndianRupee, Navigation, Phone,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { PressCard } from "@/components/PressCard";
import { recordVisit } from "@/data/routes";
import type { StoreRow } from "@/data/stores";
import { qk } from "@/data/keys";
import { friendlyError } from "@/lib/rpc";
import { tokens } from "@/theme/tokens";

type Tone = "brand" | "grn" | "amb";

function MiniAction({
  icon: Icon, label, onPress, tone = "brand", disabled,
}: {
  icon: LucideIcon; label: string; onPress: () => void; tone?: Tone; disabled?: boolean;
}) {
  const wash = { brand: tokens.color.brandWash, grn: tokens.color.grnWash, amb: tokens.color.ambWash }[tone];
  const fg = { brand: tokens.color.brand, grn: tokens.color.grn, amb: tokens.color.amb }[tone];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      style={({ pressed }) => [
        s.btn, { backgroundColor: wash },
        pressed && { opacity: 0.8 },
        disabled && { opacity: 0.5 },
      ]}
    >
      <Icon size={14} color={fg} />
      <Text style={[s.btnTxt, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

export function StoreCard({
  store, canVisit, canSale, canCollect, sessionId,
}: {
  store: StoreRow;
  canVisit: boolean;
  canSale: boolean;
  canCollect: boolean;
  sessionId: string;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const [visiting, setVisiting] = useState(false);

  async function visit() {
    if (visiting || !sessionId) return;
    setVisiting(true);
    try {
      let lat: number | null = null;
      let lng: number | null = null;
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (perm.granted) {
          const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        }
      } catch {
        // graceful: record the visit without coords
      }
      await recordVisit(store.id, lat, lng);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.visited(sessionId) }),
        qc.invalidateQueries({ queryKey: qk.today() }),
      ]);
      Toast.show({ type: "success", text1: "Visit recorded", text2: store.name });
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Toast.show({ type: "error", text1: "Could not record visit", text2: friendlyError(e) });
    } finally {
      setVisiting(false);
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

  return (
    <PressCard onPress={() => router.push(`/store/${store.id}`)}>
      <View style={s.inner}>
        <View style={s.head}>
          <View style={s.chip}>
            <Text style={s.chipTxt}>{store.name.slice(0, 1).toUpperCase()}</Text>
          </View>
          <View style={s.main}>
            <Text style={s.name} numberOfLines={1}>{store.name}</Text>
            <Text style={s.sub} numberOfLines={1}>
              {[store.customerName, store.area].filter(Boolean).join(" · ") || "—"}
            </Text>
            {store.routeName ? (
              <Text style={s.eyebrow} numberOfLines={1}>
                ROUTE · {store.routeName.toUpperCase()}
              </Text>
            ) : null}
          </View>
          {store.code ? <Text style={s.code}>{store.code}</Text> : null}
        </View>

        <View style={s.actions}>
          {canSale ? (
            <MiniAction
              icon={IndianRupee}
              label="Sale"
              tone="grn"
              onPress={() => router.push(`/record?mode=sale&storeId=${store.id}`)}
            />
          ) : null}
          {canCollect ? (
            <MiniAction
              icon={HandCoins}
              label="Collect"
              tone="amb"
              onPress={() => router.push(`/record?mode=collect&storeId=${store.id}`)}
            />
          ) : null}
          {canVisit && sessionId ? (
            <MiniAction
              icon={Footprints}
              label={visiting ? "..." : "Visit"}
              onPress={() => void visit()}
              disabled={visiting}
            />
          ) : null}
          <MiniAction icon={Navigation} label="Navigate" onPress={navigate} />
          {store.phone ? (
            <MiniAction
              icon={Phone}
              label="Call"
              onPress={() => void Linking.openURL(`tel:${store.phone}`)}
            />
          ) : null}
        </View>
      </View>
    </PressCard>
  );
}

const s = StyleSheet.create({
  inner: { padding: tokens.space.md, gap: tokens.space.md },
  head: { flexDirection: "row", alignItems: "center", gap: tokens.space.md },
  chip: {
    width: 40, height: 40, borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.brandWash,
    alignItems: "center", justifyContent: "center",
  },
  chipTxt: { color: tokens.color.brand, fontFamily: tokens.font.sansBold, fontSize: tokens.size.base },
  main: { flex: 1, minWidth: 0 },
  name: { color: tokens.color.ink, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.sm },
  sub: { color: tokens.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.xs, marginTop: 1 },
  eyebrow: {
    color: tokens.color.ink4, fontFamily: tokens.font.sansSemi,
    fontSize: tokens.size.eyebrow, letterSpacing: 0.5, marginTop: 3,
  },
  code: {
    color: tokens.color.ink4, fontFamily: tokens.font.mono,
    fontSize: tokens.size.xs, fontVariant: ["tabular-nums"],
  },
  actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: tokens.space.xs },
  btn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    minHeight: 44, paddingHorizontal: tokens.space.sm,
    borderRadius: tokens.radius.sm,
  },
  btnTxt: { fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
});
