import { View, Text, StyleSheet, TextInput } from "react-native";
import { Banknote, Smartphone, TriangleAlert } from "lucide-react-native";
import { moneyINR } from "@/lib/format";
import { tokens } from "@/theme/tokens";

function AmountField({
  label, icon: Icon, fg, wash, value, onChange,
}: {
  label: string;
  icon: typeof Banknote;
  fg: string;
  wash: string;
  value: string;
  onChange: (t: string) => void;
}) {
  return (
    <View style={s.field}>
      <View style={s.labelRow}>
        <View style={[s.chip, { backgroundColor: wash }]}>
          <Icon size={13} color={fg} />
        </View>
        <Text style={s.label}>{label}</Text>
      </View>
      <View style={s.inputRow}>
        <Text style={s.prefix}>₹</Text>
        <LocalInput value={value} onChange={onChange} label={label} />
      </View>
    </View>
  );
}

function LocalInput({
  value, onChange, label,
}: {
  value: string;
  onChange: (t: string) => void;
  label: string;
}) {
  return (
    <TextInput
      style={s.input}
      value={value}
      onChangeText={(t) => onChange(t.replace(/[^0-9.]/g, ""))}
      keyboardType="decimal-pad"
      inputMode="decimal"
      placeholder="0"
      placeholderTextColor={tokens.color.ink4}
      accessible
      accessibilityLabel={label}
    />
  );
}

export function PaymentSplit({
  cash, upi, onChangeCash, onChangeUpi, total,
}: {
  cash: string;
  upi: string;
  onChangeCash: (t: string) => void;
  onChangeUpi: (t: string) => void;
  total: number;
}) {
  const c = Number(cash);
  const u = Number(upi);
  const collected = (Number.isFinite(c) && c > 0 ? c : 0) + (Number.isFinite(u) && u > 0 ? u : 0);
  const over = collected > total + 0.005;
  const credit = total - collected;

  return (
    <View style={s.wrap}>
      <View style={s.row}>
        <AmountField
          label="Cash collected"
          icon={Banknote}
          fg={tokens.color.grn}
          wash={tokens.color.grnWash}
          value={cash}
          onChange={onChangeCash}
        />
        <AmountField
          label="UPI collected"
          icon={Smartphone}
          fg={tokens.color.brand}
          wash={tokens.color.brandWash}
          value={upi}
          onChange={onChangeUpi}
        />
      </View>
      <View style={s.footRow}>
        <Text style={s.footLabel}>On credit</Text>
        <Text style={[s.footVal, credit > 0 && { color: tokens.color.red }]}>{moneyINR(credit)}</Text>
      </View>
      {over ? (
        <View style={s.warn}>
          <TriangleAlert size={14} color={tokens.color.amb} />
          <Text style={s.warnTxt}>
            Cash + UPI ({moneyINR(collected)}) exceed the invoice total. Collection cannot exceed the invoice.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: tokens.space.md },
  row: { flexDirection: "row", gap: tokens.space.md },
  field: { flex: 1, gap: 6 },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  chip: {
    width: 22, height: 22, borderRadius: 6,
    alignItems: "center", justifyContent: "center",
  },
  label: { color: tokens.color.ink3, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.eyebrow },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 44,
    borderWidth: 1,
    borderColor: tokens.color.line,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.surface,
    paddingHorizontal: tokens.space.md,
    gap: 2,
  },
  prefix: { color: tokens.color.ink3, fontFamily: tokens.font.mono, fontSize: tokens.size.sm },
  input: {
    flex: 1,
    color: tokens.color.ink,
    fontFamily: tokens.font.mono,
    fontSize: tokens.size.sm,
    fontVariant: ["tabular-nums"],
    paddingVertical: 0,
  },
  footRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footLabel: { color: tokens.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.xs },
  footVal: {
    color: tokens.color.ink,
    fontFamily: tokens.font.monoBold,
    fontSize: tokens.size.sm,
    fontVariant: ["tabular-nums"],
  },
  warn: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: tokens.space.sm,
    backgroundColor: tokens.color.ambWash,
    borderRadius: tokens.radius.md,
    padding: tokens.space.md,
  },
  warnTxt: {
    flex: 1,
    color: tokens.color.amb,
    fontFamily: tokens.font.sansMed,
    fontSize: tokens.size.xs,
    lineHeight: 17,
  },
});
