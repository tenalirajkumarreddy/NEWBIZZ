import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import { Check, Info } from "lucide-react-native";
import { Sheet } from "@/components/Sheet";
import { SkeletonRows } from "@/components/SkeletonRows";
import { useSession } from "@/lib/session";
import { friendlyError } from "@/lib/rpc";
import { createCashTransfer } from "@/data/transfers";
import { useActiveUsers } from "@/data/users";
import { qk } from "@/data/keys";
import { tokens } from "@/theme/tokens";

export type HandoverMode = "handover" | "deposit";

export function HandoverSheet({
  visible, onClose, mode,
}: {
  visible: boolean;
  onClose: () => void;
  mode: HandoverMode;
}) {
  const qc = useQueryClient();
  const { user } = useSession();
  const users = useActiveUsers();
  const [toUserId, setToUserId] = useState<string | null>(null);
  const [amount, setAmount] = useState("0");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setToUserId(null);
      setAmount("0");
      setNote("");
    }
  }, [visible, mode]);

  const recipients = (users.data ?? []).filter((u) => u.id !== user?.id);

  async function submit() {
    if (busy) return;
    const n = Number(amount.trim().replace(/,/g, ""));
    if (!Number.isFinite(n) || n <= 0) {
      Toast.show({ type: "error", text1: "Enter an amount greater than zero" });
      return;
    }
    if (mode === "handover" && !toUserId) {
      Toast.show({ type: "error", text1: "Select who will receive the cash" });
      return;
    }
    setBusy(true);
    try {
      await createCashTransfer(mode === "deposit" ? null : toUserId, Math.round(n * 100) / 100, note.trim() || null);
      await qc.invalidateQueries({ queryKey: qk.custody() });
      Toast.show({
        type: "success",
        text1: mode === "deposit" ? "Deposit posted" : "Handover created",
        text2: mode === "deposit" ? "Cash will be posted to the bank account" : "Waiting for the recipient to confirm",
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
      title={mode === "deposit" ? "Deposit to bank" : "Hand over cash"}
    >
      <View style={s.body}>
        {mode === "handover" ? (
          <View style={s.section}>
            <Text style={s.label}>RECIPIENT</Text>
            {users.isLoading ? (
              <SkeletonRows rows={3} />
            ) : recipients.length === 0 ? (
              <Text style={s.hint}>No other active users found.</Text>
            ) : (
              <View style={s.people}>
                {recipients.map((u) => {
                  const active = toUserId === u.id;
                  return (
                    <Pressable
                      key={u.id}
                      onPress={() => setToUserId(u.id)}
                      accessibilityLabel={`Select ${u.full_name}`}
                      accessibilityState={{ selected: active }}
                      style={({ pressed }) => [
                        s.person,
                        active && s.personActive,
                        pressed && { backgroundColor: tokens.color.fill },
                      ]}
                    >
                      <View style={s.avatar}>
                        <Text style={s.avatarTxt}>{initials(u.full_name)}</Text>
                      </View>
                      <Text style={s.personName} numberOfLines={1}>{u.full_name}</Text>
                      {active ? <Check size={16} color={tokens.color.brand} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        ) : (
          <View style={s.infoBox}>
            <Info size={14} color={tokens.color.brand} />
            <Text style={s.infoTxt}>Cash will be posted to the bank account (1120).</Text>
          </View>
        )}

        <View style={s.section}>
          <Text style={s.label}>AMOUNT</Text>
          <View style={s.amountWrap}>
            <Text style={s.rupee}>{String.fromCharCode(8377)}</Text>
            <TextInput
              style={s.amountInput}
              value={amount}
              onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ""))}
              keyboardType="decimal-pad"
              accessible
              accessibilityLabel="Amount"
            />
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.label}>NOTE (OPTIONAL)</Text>
          <TextInput
            style={s.noteInput}
            value={note}
            onChangeText={setNote}
            placeholder="Add a note for the recipient"
            placeholderTextColor={tokens.color.ink4}
            multiline
            accessible
            accessibilityLabel="Note"
          />
        </View>

        <Pressable
          onPress={() => void submit()}
          disabled={busy}
          accessibilityLabel="Submit"
          style={({ pressed }) => [s.submit, (pressed || busy) && { opacity: 0.85 }]}
        >
          {busy ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={s.submitTxt}>{mode === "deposit" ? "Deposit to bank" : "Create handover"}</Text>
          )}
        </Pressable>
      </View>
    </Sheet>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

const s = StyleSheet.create({
  body: { gap: tokens.space.lg },
  section: { gap: tokens.space.xs },
  label: {
    color: tokens.color.ink3,
    fontFamily: tokens.font.sansSemi,
    fontSize: tokens.size.eyebrow,
    letterSpacing: 0.6,
  },
  hint: { color: tokens.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.xs },
  people: { gap: tokens.space.xs },
  person: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.md,
    minHeight: 52,
    paddingHorizontal: tokens.space.md,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.line,
    backgroundColor: tokens.color.surface,
  },
  personActive: { borderColor: tokens.color.brand, backgroundColor: tokens.color.brandWash },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: tokens.color.brandWash,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarTxt: { color: tokens.color.brand, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
  personName: { flex: 1, color: tokens.color.ink, fontFamily: tokens.font.sansMed, fontSize: tokens.size.sm },
  infoBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.sm,
    padding: tokens.space.md,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.brandWash,
  },
  infoTxt: {
    flex: 1,
    color: tokens.color.brandD,
    fontFamily: tokens.font.sansMed,
    fontSize: tokens.size.xs,
  },
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
  rupee: {
    color: tokens.color.ink3,
    fontFamily: tokens.font.monoBold,
    fontSize: tokens.size.lg,
  },
  amountInput: {
    flex: 1,
    color: tokens.color.ink,
    fontFamily: tokens.font.monoBold,
    fontSize: tokens.size.xl,
    fontVariant: ["tabular-nums"],
    paddingVertical: 0,
  },
  noteInput: {
    minHeight: 72,
    textAlignVertical: "top",
    borderWidth: 1,
    borderColor: tokens.color.line,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.surface,
    paddingHorizontal: tokens.space.md,
    paddingVertical: tokens.space.sm,
    color: tokens.color.ink,
    fontFamily: tokens.font.sansMed,
    fontSize: tokens.size.sm,
  },
  submit: {
    minHeight: 48,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  submitTxt: { color: "#ffffff", fontFamily: tokens.font.sansSemi, fontSize: tokens.size.sm },
});
