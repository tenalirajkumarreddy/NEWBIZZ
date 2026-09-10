import { useEffect, useState, useMemo } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import { Check } from "lucide-react-native";
import { Sheet } from "@/components/Sheet";
import { friendlyError } from "@/lib/rpc";
import { submitMyExpense, FIELD_CATEGORIES, type ExpenseCategory } from "@/data/expenses";
import { moneyINR } from "@/lib/format";
import { tokens } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeContext";

const QUICK_AMOUNTS = [100, 200, 500, 1000];

export function ExpenseSheet({
  visible, onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { palette: t } = useTheme();
  const s = useStyles();
  const qc = useQueryClient();
  const [category, setCategory] = useState<ExpenseCategory>("fuel");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setCategory("fuel");
      setAmount("");
      setNote("");
    }
  }, [visible]);

  const n = Number(amount.trim().replace(/,/g, ""));
  const canSubmit = Number.isFinite(n) && n > 0 && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await submitMyExpense({ category, amount: Math.round(n * 100) / 100, note: note.trim() || null });
      await qc.invalidateQueries({ queryKey: ["expenses"] });
      Toast.show({
        type: "success",
        text1: "Expense submitted",
        text2: "Pending manager approval - money leaves custody once approved",
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
          <View style={s.chipWrap}>
            {FIELD_CATEGORIES.map((c) => {
              const active = category === c.value;
              return (
                <Pressable
                  key={c.value}
                  onPress={() => setCategory(c.value)}
                  accessibilityLabel={`Category ${c.label}`}
                  accessibilityState={{ selected: active }}
                  style={({ pressed }) => [
                    s.chip,
                    active && s.chipActive,
                    pressed && !active && { backgroundColor: t.color.fill },
                  ]}
                >
                  {active ? <Check size={13} color="#ffffff" /> : null}
                  <Text style={[s.chipTxt, active && s.chipTxtActive]}>{c.label}</Text>
                </Pressable>
              );
            })}
          </View>
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
    backgroundColor: t.color.brandWash,
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
