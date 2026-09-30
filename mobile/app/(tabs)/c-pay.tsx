import { useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput } from "react-native";
import Toast from "react-native-toast-message";
import { Wallet, Clock } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { GradientHeader } from "@/components/GradientHeader";
import { HeaderRight } from "@/components/HeaderRight";
import { SkeletonRows } from "@/components/SkeletonRows";
import { EmptyState } from "@/components/EmptyState";
import { StatusBadge } from "@/components/StatusBadge";
import { useSession } from "@/lib/session";
import { roleLabel } from "@/lib/claims";
import { moneyINR, dateIST } from "@/lib/format";
import { friendlyError } from "@/lib/rpc";
import {
  usePortalProfile, usePortalPayIntents,
  submitPortalPayIntent, usePortalInvalidate,
  type PortalPayMode,
} from "@/data/portal";
import { tokens } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeContext";

const MODES: { id: PortalPayMode; label: string }[] = [
  { id: "upi", label: "UPI" },
  { id: "cash", label: "Cash" },
  { id: "cheque", label: "Cheque" },
  { id: "bank", label: "Bank" },
];

const INTENT_TONE: Record<string, "grn" | "amb" | "red" | "neutral"> = {
  pending: "amb", confirmed: "grn", rejected: "red",
};

export default function CustomerPay() {
  const s = useStyles();
  const t = useTheme().palette;
  const { claims } = useSession();
  const profile = usePortalProfile();
  const intents = usePortalPayIntents();
  const intentRows = intents.data ?? [];
  const invalidate = usePortalInvalidate();

  const [amount, setAmount] = useState<string>("");
  const [mode, setMode] = useState<PortalPayMode>("upi");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);

  const value = Number(amount);
  const valid = Number.isFinite(value) && value > 0;

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    try {
      await submitPortalPayIntent({ amount: value, mode, reference: reference.trim() || undefined });
      Toast.show({
        type: "success",
        text1: "Payment reported",
        text2: "The office will verify and adjust your balance.",
      });
      setAmount("");
      setReference("");
      invalidate();
    } catch (e) {
      Toast.show({ type: "error", text1: "Could not report payment", text2: friendlyError(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen refreshing={intents.isFetching || profile.isFetching} onRefresh={invalidate}>
      <GradientHeader title="Pay" subtitle={roleLabel(claims)} right={<HeaderRight />} />
      <View style={s.body}>
        {profile.isLoading ? (
          <SkeletonRows rows={3} />
        ) : (
          <View style={s.dueCard}>
            <Text style={s.dueLabel}>YOU OWE</Text>
            <Text style={[s.dueVal, (profile.data?.outstanding ?? 0) > 0 ? s.dueRed : s.dueOk]}>
              {moneyINR(profile.data?.outstanding ?? 0)}
            </Text>
            <Text style={s.dueSub}>Report what you paid — staff confirm it against the books.</Text>
          </View>
        )}

        <View style={s.formCard}>
          <Text style={s.label}>AMOUNT (₹)</Text>
          <View style={s.amountRow}>
            <TextInput
              style={s.amountInput}
              value={amount}
              onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, ""))}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={t.color.ink4}
              accessible
              accessibilityLabel="Payment amount"
            />
            {profile.data && profile.data.outstanding > 0 ? (
              <Pressable
                onPress={() => setAmount(String(Math.round(profile.data!.outstanding)))}
                accessibilityRole="button"
                accessibilityLabel="Fill full outstanding"
                style={({ pressed }) => [s.fillBtn, pressed && { opacity: 0.8 }]}
              >
                <Text style={s.fillTxt}>Full due</Text>
              </Pressable>
            ) : null}
          </View>

          <Text style={s.label}>PAID VIA</Text>
          <View style={s.modeRow}>
            {MODES.map((m) => {
              const active = mode === m.id;
              return (
                <Pressable
                  key={m.id}
                  onPress={() => setMode(m.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Paid via ${m.label}`}
                  accessibilityState={{ selected: active }}
                  style={({ pressed }) => [
                    s.modeChip,
                    active && s.modeChipOn,
                    (pressed || active) && { opacity: 1 },
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <Text style={[s.modeTxt, active && s.modeTxtOn]}>{m.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={s.label}>REFERENCE (OPTIONAL)</Text>
          <TextInput
            style={s.input}
            value={reference}
            onChangeText={setReference}
            placeholder="UPI txn id / cheque no…"
            placeholderTextColor={t.color.ink4}
            accessible
            accessibilityLabel="Payment reference"
          />

          <Pressable
            onPress={() => void submit()}
            disabled={!valid || busy}
            accessibilityRole="button"
            accessibilityLabel="Report payment"
            style={({ pressed }) => [s.submitBtn, (!valid || busy || pressed) && { opacity: 0.5 }]}
          >
            <Wallet size={15} color="#ffffff" />
            <Text style={s.submitTxt}>{busy ? "Sending…" : "Report payment"}</Text>
          </Pressable>
        </View>

        <Text style={s.sectionLabel}>REPORTED PAYMENTS</Text>
        {intents.isLoading ? (
          <SkeletonRows rows={3} />
        ) : intents.isError ? (
          <EmptyState title="Could not load history" message="Pull down to retry." />
        ) : intentRows.length === 0 ? (
          <EmptyState icon={Clock} title="Nothing reported yet" message="Payments you report appear here with their status." />
        ) : (
          <View style={s.list}>
            {intentRows.map((p) => (
              <View key={p.id} style={s.intentRow}>
                <View style={s.intentMain}>
                  <View style={s.intentTop}>
                    <Text style={s.intentAmt}>{moneyINR(p.amount)}</Text>
                    <StatusBadge label={p.status} tone={INTENT_TONE[p.status] ?? "neutral"} />
                  </View>
                  <Text style={s.intentSub} numberOfLines={1}>
                    {dateIST(p.createdAt)} · {p.mode.toUpperCase()}
                    {p.reference ? ` · ${p.reference}` : ""}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    </Screen>
  );
}

const useStyles = () => {
  const t = useTheme().palette;
  return StyleSheet.create({
    body: { paddingHorizontal: tokens.space.lg, paddingTop: tokens.space.lg, gap: tokens.space.md },
    dueCard: {
      backgroundColor: t.color.surface,
      borderRadius: tokens.radius.lg,
      borderWidth: 1,
      borderColor: t.color.line,
      padding: tokens.space.lg,
      gap: 4,
      alignItems: "center",
      ...tokens.shadow.card,
    },
    dueLabel: { color: t.color.ink4, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.eyebrow, letterSpacing: 0.6 },
    dueVal: { fontFamily: tokens.font.monoBold, fontSize: 30, fontVariant: ["tabular-nums"] },
    dueRed: { color: t.color.red },
    dueOk: { color: t.color.grn },
    dueSub: { color: t.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow, textAlign: "center" },
    formCard: {
      backgroundColor: t.color.surface,
      borderRadius: tokens.radius.lg,
      borderWidth: 1,
      borderColor: t.color.line,
      padding: tokens.space.md,
      gap: tokens.space.sm,
      ...tokens.shadow.card,
    },
    label: { color: t.color.ink4, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.eyebrow, letterSpacing: 0.6 },
    amountRow: { flexDirection: "row", alignItems: "center", gap: tokens.space.sm },
    amountInput: {
      flex: 1,
      minHeight: 48,
      borderWidth: 1,
      borderColor: t.color.line,
      borderRadius: tokens.radius.md,
      backgroundColor: t.color.surface,
      paddingHorizontal: tokens.space.md,
      color: t.color.ink,
      fontFamily: tokens.font.monoBold,
      fontSize: tokens.size.lg,
      fontVariant: ["tabular-nums"],
    },
    fillBtn: {
      minHeight: 40,
      paddingHorizontal: tokens.space.md,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: t.color.brand,
      backgroundColor: t.color.brandWash,
      alignItems: "center",
      justifyContent: "center",
    },
    fillTxt: { color: t.color.brand, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.eyebrow },
    modeRow: { flexDirection: "row", flexWrap: "wrap", gap: tokens.space.xs },
    modeChip: {
      minHeight: 38,
      paddingHorizontal: tokens.space.md,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: t.color.line,
      backgroundColor: t.color.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    modeChipOn: { backgroundColor: t.color.brandWash, borderColor: t.color.brand },
    modeTxt: { color: t.color.ink3, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.eyebrow },
    modeTxtOn: { color: t.color.brand },
    input: {
      minHeight: 44,
      borderWidth: 1,
      borderColor: t.color.line,
      borderRadius: tokens.radius.md,
      backgroundColor: t.color.surface,
      paddingHorizontal: tokens.space.md,
      color: t.color.ink,
      fontFamily: tokens.font.sans,
      fontSize: tokens.size.sm,
    },
    submitBtn: {
      minHeight: 48,
      borderRadius: tokens.radius.md,
      backgroundColor: t.color.brand,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: tokens.space.xs,
      marginTop: tokens.space.xs,
    },
    submitTxt: { color: "#ffffff", fontFamily: tokens.font.sansSemi, fontSize: tokens.size.sm },
    sectionLabel: {
      color: t.color.ink4,
      fontFamily: tokens.font.sansSemi,
      fontSize: tokens.size.eyebrow,
      letterSpacing: 0.6,
      marginTop: tokens.space.xs,
    },
    list: { gap: tokens.space.xs },
    intentRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: t.color.surface,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: t.color.line,
      paddingHorizontal: tokens.space.md,
      paddingVertical: tokens.space.sm,
      ...tokens.shadow.card,
    },
    intentMain: { flex: 1, minWidth: 0, gap: 2 },
    intentTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: tokens.space.sm },
    intentAmt: { color: t.color.ink, fontFamily: tokens.font.monoBold, fontSize: tokens.size.sm, fontVariant: ["tabular-nums"] },
    intentSub: { color: t.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow },
  });
};
