import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { AlertTriangle, CheckCircle2 } from "lucide-react-native";
import { Sheet } from "@/components/Sheet";
import { moneyINR } from "@/lib/format";
import { tokens } from "@/theme/tokens";
import { useMemo } from "react";
import { useTheme } from "@/theme/ThemeContext";

export interface ReceiptResult {
  kind: "sale" | "collect";
  invoiceRef: string | null;
  invoiceTotal: number;
  collected: number;
  balance: number;
  receiptFailed: boolean;
  receiptError: string | null;
  advanceNote: string | null;
  estimateNote?: string | null;
}

export function ReceiptModal({
  result, onClose,
}: {
  result: ReceiptResult | null;
  onClose: () => void;
}) {
  const { palette: t } = useTheme();
  const s = useStyles();
  if (!result) return null;
  const success = result.kind === "sale" ? "Sale recorded" : "Payment recorded";

  return (
    <Sheet
      visible
      onClose={() => {
        /* non-dismissable: backdrop does nothing, Done is the only exit */
      }}
    >
      <View style={[s.iconWrap, result.receiptFailed ? s.iconWrapWarn : s.iconWrapOk]}>
        {result.receiptFailed ? (
          <AlertTriangle size={26} color={t.color.amb} />
        ) : (
          <CheckCircle2 size={26} color={t.color.grn} />
        )}
      </View>
      <Text style={s.title}>{result.receiptFailed ? "Recorded with warning" : success}</Text>
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollIn} keyboardShouldPersistTaps="handled">
        {result.invoiceRef ? <Row label="Invoice ref" value={result.invoiceRef} mono /> : null}
        {result.kind === "sale" ? <Row label="Invoice total" value={moneyINR(result.invoiceTotal)} mono /> : null}
        <Row label="Collected" value={moneyINR(result.collected)} mono />
        <Row
          label={result.kind === "sale" ? "Balance on credit" : "Unallocated (advance)"}
          value={moneyINR(result.balance)}
          mono
          tone={result.balance > 0 ? "red" : "grn"}
        />
        {result.advanceNote ? <Text style={s.note}>{result.advanceNote}</Text> : null}
        {result.estimateNote ? <Text style={s.note}>{result.estimateNote}</Text> : null}
        {result.receiptFailed ? (
          <View style={s.warn}>
            <Text style={s.warnTxt}>
              Receipt failed: {result.receiptError ?? "unknown error"}. Record the receipt from Collect.
            </Text>
          </View>
        ) : null}
      </ScrollView>
      <Pressable
        onPress={onClose}
        accessibilityLabel="Done"
        style={({ pressed }) => [s.done, pressed && { opacity: 0.9 }]}
      >
        <Text style={s.doneTxt}>Done</Text>
      </Pressable>
    </Sheet>
  );
}

function Row({
  label, value, mono, tone,
}: {
  label: string; value: string; mono?: boolean; tone?: "red" | "grn";
}) {
  const { palette: t } = useTheme();
  const s = useStyles();
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text
        style={[
          s.rowVal,
          mono && s.mono,
          tone === "red" && { color: t.color.red },
          tone === "grn" && { color: t.color.grn },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const useStyles = () => {
  const { palette } = useTheme();
  return useMemo(() => {
    const t = palette;
    return StyleSheet.create({
  iconWrap: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: "center", justifyContent: "center",
    alignSelf: "center",
  },
  iconWrapOk: { backgroundColor: t.color.grnWash },
  iconWrapWarn: { backgroundColor: t.color.ambWash },
  title: {
    color: t.color.ink,
    fontFamily: tokens.font.sansBold,
    fontSize: tokens.size.lg,
    textAlign: "center",
    marginTop: tokens.space.md,
  },
  scroll: { marginTop: tokens.space.lg },
  scrollIn: { paddingBottom: tokens.space.xs },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: tokens.space.md,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: t.color.lineSoft,
  },
  rowLabel: { color: t.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.sm },
  rowVal: { color: t.color.ink, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.sm },
  mono: { fontFamily: tokens.font.mono, fontVariant: ["tabular-nums"] },
  note: {
    color: t.color.ink3,
    fontFamily: tokens.font.sans,
    fontSize: tokens.size.xs,
    marginTop: tokens.space.sm,
    lineHeight: 17,
  },
  warn: {
    backgroundColor: t.color.ambWash,
    borderRadius: tokens.radius.md,
    padding: tokens.space.md,
    marginTop: tokens.space.md,
  },
  warnTxt: { color: t.color.amb, fontFamily: tokens.font.sansMed, fontSize: tokens.size.xs, lineHeight: 17 },
  done: {
    minHeight: 44,
    borderRadius: tokens.radius.md,
    backgroundColor: t.color.brand,
    alignItems: "center",
    justifyContent: "center",
    marginTop: tokens.space.lg,
  },
  doneTxt: { color: t.color.surface, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.sm },
});
  }, [palette]);
};
