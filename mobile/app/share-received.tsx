import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, Image, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { HandCoins, ReceiptText, X } from "lucide-react-native";
import { useTheme } from "@/theme/ThemeContext";
import { tokens } from "@/theme/tokens";
import { shareInbox, type InboxImage } from "@/data/shareInbox";
import { ExpenseSheet } from "@/features/history/ExpenseSheet";
import { HandoverSheet } from "@/features/history/HandoverSheet";
import { gotoTab } from "@/lib/tabBus";

/**
 * Android share-sheet target: receives receipt image(s) from payment apps
 * (or anything image-sharing), then offers "Create expense" / "Create
 * handover" with the images pre-attached.
 *
 * The raw intent is consumed by ShareIntentBridge (_layout) which populates
 * the inbox and navigates here — this screen only renders what was received.
 */
export default function ShareReceivedScreen() {
  const router = useRouter();
  const { palette: t } = useTheme();
  const s = useStyles();
  const [images, setImages] = useState<InboxImage[]>(shareInbox.peek());
  const [mode, setMode] = useState<"expense" | "handover" | null>(null);

  useEffect(() => {
    const unsub = shareInbox.subscribe(() => setImages(shareInbox.peek()));
    return unsub;
  }, []);

  const done = useCallback(() => {
    shareInbox.clear();
    setMode(null);
    gotoTab("history");
    router.back();
  }, [router]);

  const dismiss = useCallback(() => {
    shareInbox.clear();
    router.back();
  }, [router]);

  if (mode === "expense") {
    return <ExpenseSheet visible initialImages={images.map((i) => i.uri)} onClose={done} />;
  }
  if (mode === "handover") {
    return <HandoverSheet visible mode="handover" initialImages={images.map((i) => i.uri)} onClose={done} />;
  }

  return (
    <View style={[s.wrap, { backgroundColor: t.color.bg }]}>
      <View style={s.card}>
        <Pressable onPress={dismiss} accessibilityLabel="Close" style={s.close} hitSlop={8}>
          <X size={18} color={t.color.ink3} />
        </Pressable>
        <Text style={s.title}>Receipt received</Text>
        {images.length === 0 ? (
          <>
            <Text style={s.sub}>No image found in the share.</Text>
            <Pressable onPress={dismiss} style={[s.choice, { backgroundColor: t.color.fill }]}>
              <Text style={[s.choiceTxt, { color: t.color.ink2 }]}>Close</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={s.sub}>
              {images.length} image{images.length === 1 ? "" : "s"} shared with NEWBIZZ. Attach them to:
            </Text>
            <View style={s.thumbRow}>
              {images.slice(0, 5).map((img, i) => (
                <Image key={i} source={{ uri: img.uri }} style={s.thumb} />
              ))}
              {images.length > 5 ? (
                <View style={[s.thumb, s.more]}>
                  <Text style={s.moreTxt}>+{images.length - 5}</Text>
                </View>
              ) : null}
            </View>
            <Pressable
              onPress={() => setMode("expense")}
              accessibilityLabel="Create expense with this receipt"
              style={({ pressed }) => [s.choice, { backgroundColor: t.color.ambWash }, pressed && { opacity: 0.85 }]}
            >
              <ReceiptText size={16} color={t.color.amb} />
              <Text style={[s.choiceTxt, { color: t.color.amb }]}>Create expense</Text>
            </Pressable>
            <Pressable
              onPress={() => setMode("handover")}
              accessibilityLabel="Create handover with this receipt"
              style={({ pressed }) => [s.choice, { backgroundColor: t.color.grnWash }, pressed && { opacity: 0.85 }]}
            >
              <HandCoins size={16} color={t.color.grn} />
              <Text style={[s.choiceTxt, { color: t.color.grn }]}>Create handover</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const useStyles = () => {
  const { palette: t } = useTheme();
  return StyleSheet.create({
    wrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: tokens.space.xl },
    card: {
      alignSelf: "stretch",
      backgroundColor: t.color.surface,
      borderRadius: tokens.radius.lg,
      borderWidth: 1,
      borderColor: t.color.line,
      padding: tokens.space.lg,
      gap: tokens.space.md,
      ...tokens.shadow.pop,
    },
    close: { position: "absolute", top: tokens.space.md, right: tokens.space.md, width: 36, height: 36, alignItems: "center", justifyContent: "center" },
    title: { color: t.color.ink, fontFamily: tokens.font.sansBold, fontSize: tokens.size.base },
    sub: { color: t.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.xs, lineHeight: 17 },
    thumbRow: { flexDirection: "row", gap: tokens.space.sm },
    thumb: {
      width: 56,
      height: 56,
      borderRadius: tokens.radius.md,
      backgroundColor: t.color.fill,
    },
    more: { alignItems: "center", justifyContent: "center" },
    moreTxt: { color: t.color.ink3, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
    choice: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: tokens.space.sm,
      minHeight: 52,
      borderRadius: tokens.radius.md,
    },
    choiceTxt: { fontFamily: tokens.font.sansSemi, fontSize: tokens.size.sm },
  });
};
