import { useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { Footprints, MapPin, Navigation2 } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { GradientHeader } from "@/components/GradientHeader";
import { HeaderRight } from "@/components/HeaderRight";
import { StorePickerSheet, type PickedStore } from "@/features/record/StorePickerSheet";
import { recordVisit, useActiveSession } from "@/data/routes";
import { qk } from "@/data/keys";
import { friendlyError } from "@/lib/rpc";
import { tokens } from "@/theme/tokens";

export default function MarkVisitScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const session = useActiveSession();
  const [pickerOpen, setPickerOpen] = useState(true);
  const [picked, setPicked] = useState<PickedStore | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    if (!picked || busy) return;
    setBusy(true);
    try {
      let lat: number | null = null;
      let lng: number | null = null;
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (perm.granted) {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        }
      } catch {
        // record without coords
      }
      await recordVisit(picked.id, lat, lng);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      const sessionId = session.data?.id;
      await Promise.all([
        ...(sessionId ? [qc.invalidateQueries({ queryKey: qk.visited(sessionId) })] : []),
        qc.invalidateQueries({ queryKey: qk.today() }),
        qc.invalidateQueries({ queryKey: qk.activeSession() }),
      ]);
      Toast.show({ type: "success", text1: "Visit recorded", text2: picked.name });
      router.back();
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Toast.show({ type: "error", text1: "Could not record visit", text2: friendlyError(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <GradientHeader title="Mark visit" subtitle="Log a stop at a store" right={<HeaderRight />} />
      <View style={s.body}>
        {picked ? (
          <>
            <View style={s.card}>
              <View style={s.row}>
                <View style={s.chip}>
                  <MapPin size={16} color={tokens.color.brand} />
                </View>
                <View style={s.main}>
                  <Text style={s.name} numberOfLines={1}>{picked.name}</Text>
                  <Text style={s.sub} numberOfLines={1}>
                    {[picked.customerName, picked.area].filter(Boolean).join(" · ") || "—"}
                  </Text>
                </View>
              </View>
            </View>
            <Pressable onPress={() => setPickerOpen(true)} style={({ pressed }) => [s.changeWrap, pressed && { opacity: 0.8 }]}>
              <Text style={s.changeTxt}>Change store</Text>
            </Pressable>
            <View style={s.actions}>
              <Pressable
                onPress={() => void confirm()}
                disabled={busy}
                accessibilityLabel="Confirm visit"
                style={({ pressed }) => [s.confirm, (pressed || busy) && { opacity: 0.85 }]}
              >
                {busy ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <Footprints size={16} color="#ffffff" />
                    <Text style={s.confirmTxt}>Mark as visited</Text>
                  </>
                )}
              </Pressable>
            </View>
            <View style={s.hintWrap}>
              <Navigation2 size={13} color={tokens.color.ink4} />
              <Text style={s.hint}>Your GPS position is attached when location permission is granted.</Text>
            </View>
          </>
        ) : (
          <Pressable onPress={() => setPickerOpen(true)} style={({ pressed }) => [s.card, s.pickCard, pressed && { opacity: 0.85 }]}>
            <View style={s.row}>
              <View style={s.chip}>
                <MapPin size={16} color={tokens.color.brand} />
              </View>
              <View style={s.main}>
                <Text style={s.name}>Select a store</Text>
                <Text style={s.sub}>Tap to search or pick the nearest stop</Text>
              </View>
            </View>
          </Pressable>
        )}
      </View>

      <StorePickerSheet
        visible={pickerOpen}
        onClose={() => {
          if (picked) {
            setPickerOpen(false);
          } else {
            router.back();
          }
        }}
        onSelect={(st) => {
          setPicked(st);
          setPickerOpen(false);
        }}
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  body: {
    paddingHorizontal: tokens.space.lg,
    paddingTop: tokens.space.lg,
    gap: tokens.space.md,
  },
  card: {
    padding: tokens.space.md,
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: "rgba(226,232,240,0.6)",
    ...tokens.shadow.card,
  },
  pickCard: { minHeight: 72, justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: tokens.space.md },
  chip: {
    width: 36,
    height: 36,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.brandWash,
    alignItems: "center",
    justifyContent: "center",
  },
  main: { flex: 1, minWidth: 0 },
  name: { color: tokens.color.ink, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.sm },
  sub: { color: tokens.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.xs, marginTop: 1 },
  changeWrap: { alignItems: "center", paddingVertical: tokens.space.sm },
  changeTxt: { color: tokens.color.brand, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
  actions: { marginTop: tokens.space.sm },
  confirm: {
    minHeight: 48,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.brand,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: tokens.space.xs,
  },
  confirmTxt: { color: "#ffffff", fontFamily: tokens.font.sansSemi, fontSize: tokens.size.sm },
  hintWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.xs,
    paddingHorizontal: tokens.space.xs,
  },
  hint: { flex: 1, color: tokens.color.ink4, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow },
});
