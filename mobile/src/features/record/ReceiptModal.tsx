import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { AlertTriangle, CheckCircle2 } from "lucide-react-native";
import { Sheet } from "@/components/Sheet";
import { moneyINR } from "@/lib/format";
import { tokens } from "@/theme/tokens";

export interface ReceiptResult {
  kind: "sale" | "collect";
  invoiceRef: string | null;
  invoiceTotal: number;
  collected: number;
  balance: number;
  receiptFailed: boolean;
  receiptError: string | null;
  advanceNote: string | null;
}

export function ReceiptModal({
  result, onClose,
}: {
  result: ReceiptResult | null;
  onClose: () => void;
}) {
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
          <AlertTriangle size={26} color={tokens.color.amb} />
        ) : (
          <CheckCircle2 size={26} color={tokens.color.grn} />
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
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text
        style={[
          s.rowVal,
          mono && s.mono,
          tone === "red" && { color: tokens.color.red },
          tone === "grn" && { color: tokens.color.grn },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  iconWrap: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: "center", justifyContent: "center",
    alignSelf: "center",
  },
  iconWrapOk: { backgroundColor: tokens.color.grnWash },
  iconWrapWarn: { backgroundColor: tokens.color.ambWash },
  title: {
    color: tokens.color.ink,
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
    borderBottomColor: tokens.color.lineSoft,
  },
  rowLabel: { color: tokens.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.sm },
  rowVal: { color: tokens.color.ink, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.sm },
  mono: { fontFamily: tokens.font.mono, fontVariant: ["tabular-nums"] },
  note: {
    color: tokens.color.ink3,
    fontFamily: tokens.font.sans,
    fontSize: tokens.size.xs,
    marginTop: tokens.space.sm,
    lineHeight: 17,
  },
  warn: {
    backgroundColor: tokens.color.ambWash,
    borderRadius: tokens.radius.md,
    padding: tokens.space.md,
    marginTop: tokens.space.md,
  },
  warnTxt: { color: tokens.color.amb, fontFamily: tokens.font.sansMed, fontSize: tokens.size.xs, lineHeight: 17 },
  done: {
    minHeight: 44,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.brand,
    alignItems: "center",
    justifyContent: "center",
    marginTop: tokens.space.lg,
  },
  doneTxt: { color: tokens.color.surface, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.sm },
});
