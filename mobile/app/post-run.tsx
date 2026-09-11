import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import { Factory } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { GradientHeader } from "@/components/GradientHeader";
import { HeaderRight } from "@/components/HeaderRight";
import { DropdownSelect } from "@/components/DropdownSelect";
import { SkeletonRows } from "@/components/SkeletonRows";
import { postProductionRun, useOutputItems, type StageRow } from "@/data/production";
import { friendlyError } from "@/lib/rpc";
import { todayIST } from "@/lib/format";
import { useTheme } from "@/theme/ThemeContext";
import { tokens } from "@/theme/tokens";

type Stage = 1 | 2;

export default function PostRunScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { palette: t } = useTheme();
  const s = useStyles();
  const items = useOutputItems();
  const [stage, setStage] = useState<Stage>(1);
  const [itemId, setItemId] = useState<string | null>(null);
  const [qty, setQty] = useState("");
  const [wastage, setWastage] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const n = Number(qty.replace(/[^0-9.]/g, ""));
  const canPost = !!itemId && Number.isFinite(n) && n > 0 && !busy;

  async function submit() {
    if (!canPost || !itemId) return;
    setBusy(true);
    try {
      const runId = await postProductionRun({
        outputItemId: itemId,
        outputQty: Math.round(n * 100) / 100,
        stage,
        runDate: todayIST(),
        abnormalWastageValue: wastage ? Number(wastage) : null,
        notes: notes.trim() || null,
      });
      await qc.invalidateQueries({ queryKey: ["jobCards"] });
      await qc.invalidateQueries({ queryKey: ["stockLevels"] });
      Toast.show({ type: "success", text1: "Run posted", text2: `Run ${runId.slice(0, 8)}…` });
      router.back();
    } catch (e) {
      Toast.show({ type: "error", text1: "Could not post run", text2: friendlyError(e) });
    } finally {
      setBusy(false);
    }
  }

  const itemOpts: { value: string; label: string; sub?: string }[] = (items.data ?? []).map(
    (i: StageRow) => ({ value: i.id, label: i.name, sub: i.unit || undefined }),
  );

  return (
    <Screen>
      <GradientHeader title="Post production run" subtitle={stage === 1 ? "Stage 1 - Blowing" : "Stage 2 - Filling"} right={<HeaderRight />} />
      <View style={s.body}>
        <View style={s.stageRow}>
          <Pressable
            onPress={() => setStage(1)}
            accessibilityRole="button"
            accessibilityState={{ selected: stage === 1 }}
            style={({ pressed }) => [s.stageBtn, stage === 1 && s.stageBtnOn, pressed && { opacity: 0.9 }]}
          >
            <Factory size={15} color={stage === 1 ? "#ffffff" : t.color.ink3} />
            <Text style={[s.stageTxt, stage === 1 && s.stageTxtOn]}>Blowing</Text>
          </Pressable>
          <Pressable
            onPress={() => setStage(2)}
            accessibilityRole="button"
            accessibilityState={{ selected: stage === 2 }}
            style={({ pressed }) => [s.stageBtn, stage === 2 && s.stageBtnOn, pressed && { opacity: 0.9 }]}
          >
            <Factory size={15} color={stage === 2 ? "#ffffff" : t.color.ink3} />
            <Text style={[s.stageTxt, stage === 2 && s.stageTxtOn]}>Filling</Text>
          </Pressable>
        </View>

        {items.isLoading ? (
          <SkeletonRows rows={2} />
        ) : (
          <View style={s.section}>
            <Text style={s.label}>OUTPUT ITEM</Text>
            <DropdownSelect
              label="Output item"
              value={itemId}
              options={itemOpts}
              onChange={setItemId}
              placeholder="Select the output item"
            />
          </View>
        )}

        <View style={s.section}>
          <Text style={s.label}>OUTPUT QUANTITY</Text>
          <View style={s.amountWrap}>
            <TextInput
              style={s.amountInput}
              value={qty}
              onChangeText={(v) => setQty(v.replace(/[^0-9.]/g, ""))}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={t.color.ink4}
              accessible
              accessibilityLabel="Output quantity"
            />
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.label}>ABNORMAL WASTAGE VALUE (RUPEES, OPTIONAL)</Text>
          <View style={s.amountWrap}>
            <TextInput
              style={[s.amountInput, { fontSize: tokens.size.sm, fontFamily: tokens.font.sansSemi }]}
              value={wastage}
              onChangeText={(v) => setWastage(v.replace(/[^0-9.]/g, ""))}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={t.color.ink4}
              accessible
              accessibilityLabel="Abnormal wastage value"
            />
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.label}>NOTES (OPTIONAL)</Text>
          <TextInput
            style={s.notesInput}
            value={notes}
            onChangeText={setNotes}
            placeholder="Anything worth noting about this run"
            placeholderTextColor={t.color.ink4}
            multiline
            accessible
            accessibilityLabel="Run notes"
          />
        </View>

        <Pressable
          onPress={() => void submit()}
          disabled={!canPost}
          accessibilityRole="button"
          accessibilityLabel="Post production run"
          style={({ pressed }) => [s.postBtn, (!canPost || pressed) && { opacity: 0.6 }]}
        >
          {busy ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <Text style={s.postBtnTxt}>Post run</Text>
          )}
        </Pressable>
      </View>
    </Screen>
  );
}

const useStyles = () => {
  const { palette: t } = useTheme();
  return StyleSheet.create({
    body: {
      paddingHorizontal: tokens.space.lg,
      paddingTop: tokens.space.lg,
      gap: tokens.space.md,
    },
    stageRow: { flexDirection: "row", gap: tokens.space.sm },
    stageBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      minHeight: 48,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: t.color.line,
      backgroundColor: t.color.surface,
    },
    stageBtnOn: { backgroundColor: t.color.brand, borderColor: t.color.brand },
    stageTxt: { color: t.color.ink3, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
    stageTxtOn: { color: "#ffffff" },
    section: { gap: tokens.space.xs },
    label: {
      color: t.color.ink3,
      fontFamily: tokens.font.sansSemi,
      fontSize: tokens.size.eyebrow,
      letterSpacing: 0.6,
    },
    amountWrap: {
      minHeight: 52,
      borderWidth: 1,
      borderColor: t.color.line,
      borderRadius: tokens.radius.md,
      backgroundColor: t.color.surface,
      paddingHorizontal: tokens.space.md,
      justifyContent: "center",
    },
    amountInput: {
      color: t.color.ink,
      fontFamily: tokens.font.monoBold,
      fontSize: tokens.size.lg,
      fontVariant: ["tabular-nums"],
      paddingVertical: 0,
    },
    notesInput: {
      minHeight: 72,
      textAlignVertical: "top",
      borderWidth: 1,
      borderColor: t.color.line,
      borderRadius: tokens.radius.md,
      backgroundColor: t.color.surface,
      paddingHorizontal: tokens.space.md,
      paddingVertical: tokens.space.sm,
      color: t.color.ink,
      fontFamily: tokens.font.sans,
      fontSize: tokens.size.sm,
    },
    postBtn: {
      minHeight: 48,
      borderRadius: tokens.radius.md,
      backgroundColor: t.color.grn,
      alignItems: "center",
      justifyContent: "center",
    },
    postBtnTxt: { color: "#ffffff", fontFamily: tokens.font.sansSemi, fontSize: tokens.size.sm },
  });
};
