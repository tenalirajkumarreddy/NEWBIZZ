import { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { Footprints, HandCoins, ShoppingCart } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { Sheet } from "@/components/Sheet";
import { recordVisit } from "@/data/routes";
import { qk } from "@/data/keys";
import { friendlyError } from "@/lib/rpc";
import { tokens } from "@/theme/tokens";

export interface VisitTargetStore {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
}

const REASONS: { type: string; label: string; desc: string; icon: LucideIcon; wash: string; fg: string }[] = [
  { type: "mark_visited", label: "Mark visited", desc: "Checked in at the store", icon: Footprints, wash: tokens.color.brandWash, fg: tokens.color.brand },
  { type: "record_sale", label: "Sale visit", desc: "Order or cash memo placed", icon: ShoppingCart, wash: tokens.color.grnWash, fg: tokens.color.grn },
  { type: "collect_payment", label: "Collect payment visit", desc: "Payment collected at the store", icon: HandCoins, wash: tokens.color.ambWash, fg: tokens.color.amb },
];

async function grabCoords(): Promise<{ lat: number; lng: number } | null> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return null;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    return null;
  }
}

export function VisitReasonSheet({
  visible, onClose, store, sessionId,
}: {
  visible: boolean;
  onClose: () => void;
  store: VisitTargetStore | null;
  sessionId: string;
}) {
  const qc = useQueryClient();
  const [busyType, setBusyType] = useState<string | null>(null);

  async function confirm(type: string) {
    if (!store || busyType) return;
    setBusyType(type);
    try {
      const coords = await grabCoords();
      await recordVisit(store.id, coords?.lat ?? null, coords?.lng ?? null, type);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await qc.invalidateQueries({ queryKey: qk.visited(sessionId) });
      Toast.show({ type: "success", text1: "Visit recorded", text2: store.name });
      onClose();
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Toast.show({ type: "error", text1: "Could not record visit", text2: friendlyError(e) });
    } finally {
      setBusyType(null);
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Record visit">
      {store ? (
        <Text style={s.storeName} numberOfLines={1}>{store.name}</Text>
      ) : null}
      <View style={s.list}>
        {REASONS.map((r) => {
          const Icon = r.icon;
          const busy = busyType === r.type;
          return (
            <Pressable
              key={r.type}
              onPress={() => void confirm(r.type)}
              disabled={busyType != null}
              accessibilityLabel={`Record visit: ${r.label}`}
              style={({ pressed }) => [
                s.row,
                pressed && { opacity: 0.8 },
                busy && { opacity: 0.5 },
              ]}
            >
              <View style={[s.chip, { backgroundColor: r.wash }]}>
                <Icon size={16} color={r.fg} />
              </View>
              <View style={s.rowMain}>
                <Text style={s.rowLabel}>{busy ? "Recording..." : r.label}</Text>
                <Text style={s.rowDesc}>{r.desc}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}

const s = StyleSheet.create({
  storeName: {
    color: tokens.color.ink2,
    fontFamily: tokens.font.sansMed,
    fontSize: tokens.size.xs,
    marginBottom: tokens.space.md,
  },
  list: { gap: tokens.space.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.md,
    minHeight: 56,
    padding: tokens.space.md,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.line,
    backgroundColor: tokens.color.surface,
  },
  chip: {
    width: 36, height: 36, borderRadius: tokens.radius.sm,
    alignItems: "center", justifyContent: "center",
  },
  rowMain: { flex: 1 },
  rowLabel: { color: tokens.color.ink, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.sm },
  rowDesc: { color: tokens.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.xs, marginTop: 1 },
});
