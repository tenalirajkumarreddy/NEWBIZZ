import { useState } from "react";
import { View, Text, StyleSheet, Pressable, Linking, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import {
  Navigation, IndianRupee, HandCoins, Footprints, Store as StoreIcon, Phone,
} from "lucide-react-native";
import { recordVisit, useActiveSession } from "@/data/routes";
import type { ResolvedStore } from "@/data/qr";
import { qk } from "@/data/keys";
import { friendlyError } from "@/lib/rpc";
import { tokens } from "@/theme/tokens";
import type { LucideIcon } from "lucide-react-native";

type Tone = "brand" | "grn" | "amb";

function ActionBtn({
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

export function StoreActionsRow({
  store, onAfterVisit,
}: {
  store: ResolvedStore;
  onAfterVisit?: () => void;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const session = useActiveSession();
  const [busy, setBusy] = useState(false);
  const storeId = store.store_id ?? "";

  async function visit() {
    if (busy || !storeId) return;
    setBusy(true);
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
      await recordVisit(storeId, lat, lng);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      const sessionId = session.data?.id;
      await Promise.all([
        ...(sessionId ? [qc.invalidateQueries({ queryKey: qk.visited(sessionId) })] : []),
        qc.invalidateQueries({ queryKey: qk.today() }),
      ]);
      Toast.show({ type: "success", text1: "Visit recorded", text2: store.store_name });
      onAfterVisit?.();
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Toast.show({ type: "error", text1: "Could not record visit", text2: friendlyError(e) });
    } finally {
      setBusy(false);
    }
  }

  function navigate() {
    const hasCoords = store.lat != null && store.lng != null;
    const q = hasCoords
      ? `${store.lat},${store.lng}`
      : encodeURIComponent([store.store_name, store.area].filter(Boolean).join(", "));
    const url = hasCoords
      ? Platform.select({ ios: `maps:0,0?q=${q}`, android: `geo:0,0?q=${q}` })
      : `https://maps.google.com/?q=${q}`;
    if (url) void Linking.openURL(url);
  }

  return (
    <View style={s.row}>
      {store.can_sell && storeId ? (
        <ActionBtn
          icon={IndianRupee}
          label="Sale"
          tone="grn"
          onPress={() => router.push(`/record?mode=sale&storeId=${storeId}`)}
        />
      ) : null}
      {store.can_collect && storeId ? (
        <ActionBtn
          icon={HandCoins}
          label="Collect"
          tone="amb"
          onPress={() => router.push(`/record?mode=collect&storeId=${storeId}`)}
        />
      ) : null}
      {store.can_visit && storeId ? (
        <ActionBtn icon={Footprints} label={busy ? "..." : "Visit"} onPress={() => void visit()} disabled={busy} />
      ) : null}
      {store.can_manage && storeId ? (
        <ActionBtn icon={StoreIcon} label="Profile" onPress={() => router.push(`/store/${storeId}`)} />
      ) : null}
      {store.phone ? (
        <ActionBtn
          icon={Phone}
          label="Call"
          tone="grn"
          onPress={() => void Linking.openURL(`tel:${store.phone}`)}
        />
      ) : null}
      <ActionBtn icon={Navigation} label="Navigate" onPress={navigate} />
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: tokens.space.sm },
  btn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    minHeight: 44, paddingHorizontal: tokens.space.md,
    borderRadius: tokens.radius.md,
  },
  btnTxt: { fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
});
