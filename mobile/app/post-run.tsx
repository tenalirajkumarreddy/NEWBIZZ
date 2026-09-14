import { useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import { Factory, Boxes } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { GradientHeader } from "@/components/GradientHeader";
import { HeaderRight } from "@/components/HeaderRight";
import { DropdownSelect } from "@/components/DropdownSelect";
import { SkeletonRows } from "@/components/SkeletonRows";
import { postProductionRun, useOutputItems, useStockLevels, type StageRow } from "@/data/production";
import { qk } from "@/data/keys";
import { checkCountPost } from "@/lib/opBuilders";
import { friendlyError } from "@/lib/rpc";
import { todayIST, timeAgoIST } from "@/lib/format";
import { useTheme } from "@/theme/ThemeContext";
import { tokens } from "@/theme/tokens";

type Stage = 1 | 2;
type QtyMode = "produced" | "count";

export default function PostRunScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { palette: t } = useTheme();
  const s = useStyles();
  const items = useOutputItems();
  const stock = useStockLevels();
  const [stage, setStage] = useState<Stage>(1);
  const [mode, setMode] = useState<QtyMode>("produced");
  const [itemId, setItemId] = useState<string | null>(null);
  const [qty, setQty] = useState("");
  const [wastage, setWastage] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const book = useMemo(() => {
    if (!itemId || !stock.data) return null;
    return stock.data
      .filter((r) => r.itemId === itemId)
      .reduce((sum, r) => sum + r.qtyOnHand, 0);
  }, [itemId, stock.data]);

  const n = Number(qty.replace(/[^0-9.]/g, ""));
  const counted = qty.trim() === "" ? null : n;
  const check = mode === "count" ? checkCountPost(counted, book) : "post";
  const canPost =
    !!itemId && !busy && (mode === "produced" ? Number.isFinite(n) && n > 0 : check === "post");

  function liveBook(): number | null {
    if (!itemId) return null;
    const rows = qc.getQueryData<{ itemId: string; qtyOnHand: number }[]>(qk.stockLevels());
    if (!rows) return book;
    return rows.filter((r) => r.itemId === itemId).reduce((sum, r) => sum + r.qtyOnHand, 0);
  }

  function warnShort(countedVal: number, bookVal: number) {
    Alert.alert(
      "Counted less than system stock",
      `You counted ${countedVal.toLocaleString("en-IN")}, but the system already has ${bookVal.toLocaleString("en-IN")} of this item across all locations. Some stock may have been sold or issued without being posted - post it via Orders / Record collection, or ask the office to reconcile. A negative run cannot be posted.`,
    );
  }

  function warnZero() {
    Alert.alert(
      "Nothing to post",
      "Counted stock matches the system stock exactly - there is no production increase to post.",
    );
  }

  async function submit() {
    if (!itemId || busy) return;
    let postQty = 0;
    if (mode === "produced") {
      if (!Number.isFinite(n) || n <= 0) return;
      postQty = n;
    } else {
      if (counted == null) return;
      // Re-check against the freshest balance so a sale/run posted since the
      // count cannot sneak into (or vanish from) this delta.
      await qc.refetchQueries({ queryKey: qk.stockLevels() });
      const bookNow = liveBook();
      const fresh = checkCountPost(counted, bookNow);
      if (fresh === "short" && bookNow != null) return warnShort(counted, bookNow);
      if (fresh === "zero") return warnZero();
      if (fresh !== "post" || bookNow == null) return;
      postQty = counted - bookNow;
    }
    setBusy(true);
    try {
      const runId = await postProductionRun({
        outputItemId: itemId,
        outputQty: Math.round(postQty * 100) / 100,
        stage,
        runDate: todayIST(),
        abnormalWastageValue: wastage ? Number(wastage) : null,
        notes: notes.trim() || null,
      });
      await qc.invalidateQueries({ queryKey: qk.jobCards() });
      await qc.invalidateQueries({ queryKey: qk.stockLevels() });
      await qc.invalidateQueries({ queryKey: qk.opTodayProduction() });
      await qc.invalidateQueries({ queryKey: qk.opRunHistory() });
      await qc.invalidateQueries({ queryKey: qk.myRuns() });
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
          <Text style={s.label}>HOW TO ENTER QUANTITY</Text>
          <View style={s.stageRow}>
            <Pressable
              onPress={() => { setMode("produced"); setQty(""); }}
              accessibilityRole="button"
              accessibilityState={{ selected: mode === "produced" }}
              style={({ pressed }) => [s.stageBtn, mode === "produced" && s.stageBtnOn, pressed && { opacity: 0.9 }]}
            >
              <Factory size={15} color={mode === "produced" ? "#ffffff" : t.color.ink3} />
              <Text style={[s.stageTxt, mode === "produced" && s.stageTxtOn]}>Produced</Text>
            </Pressable>
            <Pressable
              onPress={() => { setMode("count"); setQty(""); }}
              accessibilityRole="button"
              accessibilityState={{ selected: mode === "count" }}
              style={({ pressed }) => [s.stageBtn, mode === "count" && s.stageBtnOn, pressed && { opacity: 0.9 }]}
            >
              <Boxes size={15} color={mode === "count" ? "#ffffff" : t.color.ink3} />
              <Text style={[s.stageTxt, mode === "count" && s.stageTxtOn]}>Closing stock</Text>
            </Pressable>
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.label}>{mode === "count" ? "COUNTED CLOSING STOCK (ALL LOCATIONS)" : "OUTPUT QUANTITY"}</Text>
          <View style={s.amountWrap}>
            <TextInput
              style={s.amountInput}
              value={qty}
              onChangeText={(v) => setQty(v.replace(/[^0-9.]/g, ""))}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={t.color.ink4}
              accessible
              accessibilityLabel={mode === "count" ? "Counted closing stock" : "Output quantity"}
            />
          </View>
          {mode === "count" && itemId ? (
            book == null ? (
              <Text style={s.hint}>Reading the current system stock…</Text>
            ) : (
              <>
                <Text style={[s.hint, check === "short" && { color: t.color.red }]}>
                  {check === "post" && counted != null
                    ? `Counted ${counted.toLocaleString("en-IN")} − system ${book.toLocaleString("en-IN")} = this run ${(counted - book).toLocaleString("en-IN")}`
                    : check === "zero"
                      ? `Counted stock matches the system (${book.toLocaleString("en-IN")}) - nothing to post`
                      : check === "short" && counted != null
                        ? `Counted ${counted.toLocaleString("en-IN")} is less than the system ${book.toLocaleString("en-IN")} - check for unposted sales or issues`
                        : `System stock: ${book.toLocaleString("en-IN")} - enter what you counted`}
                </Text>
                <Text style={s.hintSmall}>
                  System figure covers all locations · {stock.isFetching ? "updating…" : `updated ${timeAgoIST(new Date(stock.dataUpdatedAt).toISOString())}`}
                </Text>
              </>
            )
          ) : null}
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
            placeholder={mode === "count" ? "e.g. closing count after shift" : "Anything worth noting about this run"}
            placeholderTextColor={t.color.ink4}
            multiline
            accessible
            accessibilityLabel="Run notes"
          />
        </View>

        <Pressable
          onPress={() => void submit()}
          disabled={busy || (mode === "produced" && !canPost) || (mode === "count" && (!itemId || counted == null))}
          accessibilityRole="button"
          accessibilityLabel="Post production run"
          style={({ pressed }) => [
            s.postBtn,
            mode === "count" && check === "short" && { backgroundColor: t.color.red },
            (busy || pressed) && { opacity: 0.6 },
          ]}
        >
          {busy ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <Text style={s.postBtnTxt}>
              {mode === "count" && check === "short" ? "Check unposted stock" : "Post run"}
            </Text>
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
    hint: { color: t.color.grn, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.eyebrow },
    hintSmall: { color: t.color.ink4, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow },
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
