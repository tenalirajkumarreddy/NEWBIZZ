import { useEffect, useState, useMemo } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, Image } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import { Check, Plus, X } from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import { DropdownSelect } from "@/components/DropdownSelect";
import { Sheet } from "@/components/Sheet";
import { friendlyError } from "@/lib/rpc";
import { submitMyExpense, FIELD_CATEGORIES, type ExpenseCategory } from "@/data/expenses";
import { uploadTransactionImages } from "@/data/attachments";
import { moneyINR } from "@/lib/format";
import { tokens } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeContext";

const QUICK_AMOUNTS = [100, 200, 500, 1000];
const MAX_IMAGES = 5;

export function ExpenseSheet({
  visible, onClose, initialImages,
}: {
  visible: boolean;
  onClose: () => void;
  /** Receipts received via the share sheet, pre-attached. */
  initialImages?: string[];
}) {
  const { palette: t } = useTheme();
  const s = useStyles();
  const qc = useQueryClient();
  const [category, setCategory] = useState<ExpenseCategory>("fuel");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [images, setImages] = useState<string[]>([]);

  useEffect(() => {
    if (visible) {
      setCategory("fuel");
      setAmount("");
      setNote("");
      setImages(initialImages ? initialImages.slice(0, MAX_IMAGES) : []);
    }
  }, [visible, initialImages]);

  async function addImages() {
    if (images.length >= MAX_IMAGES) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: MAX_IMAGES - images.length,
      quality: 0.6,
    });
    if (!res.canceled && res.assets?.length) {
      setImages((prev) => [...prev, ...res.assets.map((a) => a.uri)].slice(0, MAX_IMAGES));
    }
  }

  const n = Number(amount.trim().replace(/,/g, ""));
  const canSubmit = Number.isFinite(n) && n > 0 && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const expenseId = await submitMyExpense({ category, amount: Math.round(n * 100) / 100, note: note.trim() || null });
      let attached = 0;
      if (images.length > 0) {
        attached = await uploadTransactionImages(images, "expenses", expenseId);
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["expenses"] }),
        qc.invalidateQueries({ queryKey: ["txnImages", "expenses", expenseId] }),
      ]);
      Toast.show({
        type: "success",
        text1: "Expense submitted",
        text2: attached > 0 ? `${attached} receipt${attached === 1 ? "" : "s"} attached` : "Pending manager approval",
      });
      onClose();
    } catch (e) {
      Toast.show({ type: "error", text1: "Could not submit", text2: friendlyError(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      visible={visible}
      onClose={() => {
        if (!busy) onClose();
      }}
      title="Submit expense"
    >
      <View style={s.content}>
        <View style={s.section}>
          <Text style={s.label}>CATEGORY</Text>
          <DropdownSelect
            label="Category"
            value={category}
            options={FIELD_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))}
            onChange={(v) => setCategory(v as ExpenseCategory)}
          />
        </View>

        <View style={s.section}>
          <Text style={s.label}>AMOUNT</Text>
          <View style={s.amountWrap}>
            <Text style={s.rupee}>{String.fromCharCode(8377)}</Text>
            <TextInput
              style={s.amountInput}
              value={amount}
              onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ""))}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={t.color.ink4}
              accessible
              accessibilityLabel="Amount"
            />
          </View>
          <View style={s.quickRow}>
            {QUICK_AMOUNTS.map((q) => (
              <Pressable
                key={q}
                onPress={() => setAmount(String(q))}
                accessibilityLabel={`Set amount ${q}`}
                style={({ pressed }) => [s.quick, pressed && { backgroundColor: t.color.fill }]}
              >
                <Text style={s.quickTxt}>{moneyINR(q)}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.label}>NOTE (OPTIONAL)</Text>
          <TextInput
            style={s.noteInput}
            value={note}
            onChangeText={setNote}
            placeholder="e.g. Van fuel - Salem trip"
            placeholderTextColor={t.color.ink4}
            maxLength={200}
            accessible
            accessibilityLabel="Note"
          />
        </View>

        <View style={s.section}>
          <Text style={s.label}>RECEIPTS (UPTO {MAX_IMAGES})</Text>
          <View style={s.imageRow}>
            {images.map((uri, i) => (
              <View key={`${uri}-${i}`} style={s.imageWrap}>
                <Image source={{ uri }} style={s.image} />
                <Pressable
                  onPress={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
                  accessibilityLabel={`Remove receipt ${i + 1}`}
                  style={({ pressed }) => [s.imageRemove, pressed && { opacity: 0.7 }]}
                >
                  <X size={11} color="#ffffff" />
                </Pressable>
              </View>
            ))}
            {images.length < MAX_IMAGES ? (
              <Pressable
                onPress={() => void addImages()}
                accessibilityLabel="Add receipt image"
                style={({ pressed }) => [s.imageAdd, pressed && { opacity: 0.8 }]}
              >
                <Plus size={18} color={t.color.ink3} />
              </Pressable>
            ) : null}
          </View>
        </View>

        <View style={s.infoBox}>
          <Text style={s.infoTxt}>
            Deducted from your cash custody only after a manager approves. Spent from your own pocket? Record it anyway
            - the office settles approved amounts with you.
          </Text>
        </View>

        <Pressable
          onPress={() => void submit()}
          disabled={!canSubmit}
          accessibilityLabel="Submit expense"
          style={({ pressed }) => [s.submit, (!canSubmit || pressed) && { opacity: 0.5 }]}
        >
          {busy ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={s.submitTxt}>
              Submit expense{Number.isFinite(n) && n > 0 ? ` - ${moneyINR(n)}` : ""}
            </Text>
          )}
        </Pressable>
      </View>
    </Sheet>
  );
}

const useStyles = () => {
  const { palette } = useTheme();
  return useMemo(() => {
    const t = palette;
    return StyleSheet.create({
  content: {
    gap: tokens.space.lg,
  },
  section: { gap: tokens.space.xs },
  label: {
    color: t.color.ink3,
    fontFamily: tokens.font.sansSemi,
    fontSize: tokens.size.eyebrow,
    letterSpacing: 0.6,
  },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: tokens.space.xs },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minHeight: 44,
    paddingHorizontal: tokens.space.md,
    borderRadius: tokens.radius.full,
    borderWidth: 1,
    borderColor: t.color.line,
    backgroundColor: t.color.surface,
  },
  chipActive: { backgroundColor: t.color.brand, borderColor: t.color.brand },
  chipTxt: { color: t.color.ink2, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
  chipTxtActive: { color: "#ffffff" },
  amountWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.sm,
    minHeight: 52,
    borderWidth: 1,
    borderColor: t.color.line,
    borderRadius: tokens.radius.md,
    backgroundColor: t.color.surface,
    paddingHorizontal: tokens.space.md,
  },
  rupee: { color: t.color.ink3, fontFamily: tokens.font.monoBold, fontSize: tokens.size.lg },
  amountInput: {
    flex: 1,
    color: t.color.ink,
    fontFamily: tokens.font.monoBold,
    fontSize: tokens.size.xl,
    fontVariant: ["tabular-nums"],
    paddingVertical: 0,
  },
  quickRow: { flexDirection: "row", gap: tokens.space.xs, marginTop: tokens.space.xs },
  quick: {
    flex: 1,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: t.color.line,
    backgroundColor: t.color.surface,
  },
  quickTxt: {
    color: t.color.ink2,
    fontFamily: tokens.font.sansSemi,
    fontSize: tokens.size.xs,
    fontVariant: ["tabular-nums"],
  },
  noteInput: {
    minHeight: 52,
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
  infoBox: {
    padding: tokens.space.md,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.brandWash,
  },
  imageRow: { flexDirection: "row", flexWrap: "wrap", gap: tokens.space.sm },
  imageWrap: { width: 56, height: 56 },
  image: { width: 56, height: 56, borderRadius: tokens.radius.md, backgroundColor: tokens.color.fill },
  imageRemove: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(15,23,42,0.75)",
    alignItems: "center",
    justifyContent: "center",
  },
  imageAdd: {
    width: 56,
    height: 56,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.line,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: tokens.color.surface,
  },
  infoTxt: { color: t.color.brandD, fontFamily: tokens.font.sansMed, fontSize: tokens.size.xs },
  submit: {
    minHeight: 48,
    borderRadius: tokens.radius.md,
    backgroundColor: t.color.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  submitTxt: { color: "#ffffff", fontFamily: tokens.font.sansSemi, fontSize: tokens.size.sm },
});
  }, [palette]);
};
