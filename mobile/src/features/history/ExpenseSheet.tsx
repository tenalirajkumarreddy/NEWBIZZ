import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import { Check } from "lucide-react-native";
import { Sheet } from "@/components/Sheet";
import { friendlyError } from "@/lib/rpc";
import { submitMyExpense, FIELD_CATEGORIES, type ExpenseCategory } from "@/data/expenses";
import { moneyINR } from "@/lib/format";
import { tokens } from "@/theme/tokens";

const QUICK_AMOUNTS = [100, 200, 500, 1000];

export function ExpenseSheet({
  visible, onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
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
                    pressed && !active && { backgroundColor: tokens.color.fill },
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
              placeholderTextColor={tokens.color.ink4}
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
                style={({ pressed }) => [s.quick, pressed && { backgroundColor: tokens.color.fill }]}
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
            placeholderTextColor={tokens.color.ink4}
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

const s = StyleSheet.create({
  content: {
    gap: tokens.space.lg,
  },
  section: { gap: tokens.space.xs },
  label: {
    color: tokens.color.ink3,
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
    borderColor: tokens.color.line,
    backgroundColor: tokens.color.surface,
  },
  chipActive: { backgroundColor: tokens.color.brand, borderColor: tokens.color.brand },
  chipTxt: { color: tokens.color.ink2, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
  chipTxtActive: { color: "#ffffff" },
  amountWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.sm,
    minHeight: 52,
    borderWidth: 1,
    borderColor: tokens.color.line,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.surface,
    paddingHorizontal: tokens.space.md,
  },
  rupee: { color: tokens.color.ink3, fontFamily: tokens.font.monoBold, fontSize: tokens.size.lg },
  amountInput: {
    flex: 1,
    color: tokens.color.ink,
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
    borderColor: tokens.color.line,
    backgroundColor: tokens.color.surface,
  },
  quickTxt: {
    color: tokens.color.ink2,
    fontFamily: tokens.font.sansSemi,
    fontSize: tokens.size.xs,
    fontVariant: ["tabular-nums"],
  },
  noteInput: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: tokens.color.line,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.surface,
    paddingHorizontal: tokens.space.md,
    paddingVertical: tokens.space.sm,
    color: tokens.color.ink,
    fontFamily: tokens.font.sans,
    fontSize: tokens.size.sm,
  },
  infoBox: {
    padding: tokens.space.md,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.brandWash,
  },
  infoTxt: { color: tokens.color.brandD, fontFamily: tokens.font.sansMed, fontSize: tokens.size.xs },
  submit: {
    minHeight: 48,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  submitTxt: { color: "#ffffff", fontFamily: tokens.font.sansSemi, fontSize: tokens.size.sm },
});
