import { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator } from "react-native";
import { Banknote, Landmark, Smartphone, FileText, Wand2 } from "lucide-react-native";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonRows } from "@/components/SkeletonRows";
import { parseMoney, round2 } from "./fields";
import { moneyINR, dateIST, todayIST } from "@/lib/format";
import { friendlyError } from "@/lib/rpc";
import { recordReceipt, useOpenInvoices, type JsonHeader, type OpenInvoice } from "@/data/sales";
import { useStoreDetail, useCustomerOutstanding } from "@/data/stores";
import { useSession } from "@/lib/session";
import Toast from "react-native-toast-message";
import { tokens } from "@/theme/tokens";
import type { ReceiptResult } from "./ReceiptModal";
import { useTheme } from "@/theme/ThemeContext";

type CollectMode = "cash" | "upi" | "bank" | "cheque";

const MODES: { key: CollectMode; label: string; deposit: string; icon: typeof Banknote }[] = [
  { key: "cash", label: "Cash", deposit: "2140", icon: Banknote },
  { key: "upi", label: "UPI", deposit: "2140", icon: Smartphone },
  { key: "bank", label: "Bank", deposit: "1120", icon: Landmark },
  { key: "cheque", label: "Cheque", deposit: "1120", icon: FileText },
];

export function CollectForm({
  storeId, accent, onDone,
}: {
  storeId: string;
  accent: "brand" | "grn";
  onDone: (result: ReceiptResult) => void;
}) {
  const { palette: t } = useTheme();
  const s = useStyles();
  const { user } = useSession();
  const detail = useStoreDetail(storeId);
  const customer = detail.data?.store?.customer as
    | { id?: string; name?: string | null }
    | null | undefined;
  const customerId = customer?.id ?? null;

  const outstandingQ = useCustomerOutstanding(customerId);
  const invoicesQ = useOpenInvoices(customerId);

  const [mode, setMode] = useState<CollectMode>("cash");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [alloc, setAlloc] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const fg = accent === "grn" ? t.color.grn : t.color.brand;
  const wash = accent === "grn" ? t.color.grnWash : t.color.brandWash;

  const amountNum = useMemo(() => {
    const n = parseMoney(amount);
    return Number.isNaN(n) ? 0 : n;
  }, [amount]);

  const invoices = invoicesQ.data ?? [];

  const totalAllocated = useMemo(
    () =>
      round2(
        invoices.reduce((sum, inv) => {
          const n = parseMoney(alloc[inv.id] ?? "");
          return sum + (Number.isNaN(n) ? 0 : n);
        }, 0),
      ),
    [invoices, alloc],
  );
  const unallocated = round2(amountNum - totalAllocated);

  function autoAllocate() {
    if (amountNum <= 0) {
      Toast.show({ type: "info", text1: "Enter an amount first" });
      return;
    }
    if (invoices.length === 0) return;
    let left = amountNum;
    const next: Record<string, string> = {};
    for (const inv of invoices) {
      const take = round2(Math.max(0, Math.min(inv.balance, left)));
      next[inv.id] = take > 0 ? String(take) : "";
      left = round2(left - take);
    }
    setAlloc(next);
  }

  function setAllocValue(id: string, txt: string) {
    setAlloc((prev) => ({ ...prev, [id]: txt.replace(/[^0-9.]/g, "") }));
  }

  async function submit() {
    if (busy) return;
    if (!customerId) {
      Toast.show({ type: "error", text1: "This store has no linked customer" });
      return;
    }
    if (amountNum <= 0) {
      Toast.show({ type: "error", text1: "Enter a valid amount" });
      return;
    }
    const allocations: { invoice_id: string; amount: number }[] = [];
    let sum = 0;
    for (const inv of invoices) {
      const raw = (alloc[inv.id] ?? "").trim();
      if (!raw) continue;
      const n = parseMoney(raw);
      if (Number.isNaN(n)) {
        Toast.show({ type: "error", text1: `Invalid allocation for ${inv.invoiceNo}` });
        return;
      }
      if (n === 0) continue;
      if (n > inv.balance + 0.005) {
        Toast.show({
          type: "error",
          text1: "Allocation exceeds balance",
          text2: `${inv.invoiceNo} balance is ${moneyINR(inv.balance)}`,
        });
        return;
      }
      allocations.push({ invoice_id: inv.id, amount: n });
      sum = round2(sum + n);
    }
    if (sum > amountNum + 0.005) {
      Toast.show({ type: "error", text1: "Allocated more than the receipt amount" });
      return;
    }

    setBusy(true);
    try {
      const def = MODES.find((m) => m.key === mode)!;
      const header: JsonHeader = {
        customer_id: customerId,
        amount: amountNum,
        mode: def.key,
        deposit_account: def.deposit,
        collected_by: user?.id,
        store_id: storeId,
        receipt_date: todayIST(),
      };
      if (reference.trim()) header.reference = reference.trim();
      if (notes.trim()) header.notes = notes.trim();
      const receiptId = await recordReceipt(header, allocations);
      onDone({
        kind: "collect",
        invoiceRef: receiptId,
        invoiceTotal: amountNum,
        collected: sum,
        balance: round2(amountNum - sum),
        receiptFailed: false,
        receiptError: null,
        advanceNote:
          amountNum - sum > 0.005
            ? `${moneyINR(round2(amountNum - sum))} was not matched to an invoice and is kept as advance.`
            : null,
      });
    } catch (e) {
      Toast.show({ type: "error", text1: "Could not record payment", text2: friendlyError(e) });
    } finally {
      setBusy(false);
    }
  }

  if (detail.isLoading) return <SkeletonRows rows={5} />;
  if (detail.isError) {
    return <EmptyState title="Could not load store" message={friendlyError(detail.error)} />;
  }
  if (!customerId) {
    return (
      <EmptyState
        title="No customer linked"
        message="This store has no customer attached, so receipts cannot be recorded."
      />
    );
  }

  return (
    <View style={s.wrap}>
      <View style={[s.outstandingCard, { borderLeftColor: fg }]}>
        <View>
          <Text style={s.outstandingLabel}>Outstanding</Text>
          <Text style={s.outstandingCustomer}>{customer?.name ?? ""}</Text>
        </View>
        <Text style={s.outstandingVal}>{moneyINR(outstandingQ.data ?? 0)}</Text>
      </View>

      <View style={s.chipsRow}>
        {MODES.map((m) => {
          const Icon = m.icon;
          const on = m.key === mode;
          return (
            <Pressable
              key={m.key}
              onPress={() => setMode(m.key)}
              accessibilityLabel={`${m.label} mode`}
              accessibilityState={{ selected: on }}
              style={({ pressed }) => [
                s.chip,
                { backgroundColor: on ? wash : t.color.surface },
                on && { borderColor: fg },
                pressed && { opacity: 0.85 },
              ]}
            >
              <Icon size={14} color={on ? fg : t.color.ink3} />
              <Text style={[s.chipTxt, on && { color: fg }]}>{m.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={s.amountRow}>
        <View style={s.amountField}>
          <Text style={s.label}>Amount</Text>
          <View style={s.moneyInputWrap}>
            <Text style={s.prefix}>₹</Text>
            <TextInput
              style={s.moneyInput}
              value={amount}
              onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ""))}
              keyboardType="decimal-pad"
              inputMode="decimal"
              placeholder="0"
              placeholderTextColor={t.color.ink4}
              accessible
              accessibilityLabel="Receipt amount"
            />
          </View>
        </View>
        <Pressable
          onPress={() => setAmount(String(round2(Math.max(0, outstandingQ.data ?? 0))))}
          disabled={(outstandingQ.data ?? 0) <= 0}
          accessibilityLabel="Fill full outstanding amount"
          style={({ pressed }) => [
            s.fillBtn,
            { backgroundColor: wash },
            pressed && { opacity: 0.85 },
            (outstandingQ.data ?? 0) <= 0 && { opacity: 0.4 },
          ]}
        >
          <Text style={[s.fillTxt, { color: fg }]}>Full</Text>
        </Pressable>
      </View>

      <Text style={s.label}>Reference</Text>
      <TextInput
        style={s.textInput}
        value={reference}
        onChangeText={setReference}
        placeholder="UTR / cheque no / transaction id"
        placeholderTextColor={t.color.ink4}
        accessible
        accessibilityLabel="Reference"
      />

      <Text style={s.label}>Notes</Text>
      <TextInput
        style={[s.textInput, s.notesInput]}
        value={notes}
        onChangeText={setNotes}
        placeholder="Optional note"
        placeholderTextColor={t.color.ink4}
        multiline
        accessible
        accessibilityLabel="Notes"
      />

      <View style={s.sectionHead}>
        <Text style={s.sectionTitle}>Open invoices</Text>
        {invoices.length > 0 ? (
          <Pressable
            onPress={autoAllocate}
            accessibilityLabel="Auto allocate oldest first"
            style={({ pressed }) => [s.autoBtn, { backgroundColor: wash }, pressed && { opacity: 0.85 }]}
          >
            <Wand2 size={13} color={fg} />
            <Text style={[s.autoTxt, { color: fg }]}>Auto-allocate oldest-first</Text>
          </Pressable>
        ) : null}
      </View>

      {invoicesQ.isLoading ? (
        <SkeletonRows rows={3} />
      ) : invoicesQ.isError ? (
        <EmptyState title="Could not load invoices" message={friendlyError(invoicesQ.error)} />
      ) : invoices.length === 0 ? (
        <EmptyState title="No open invoices" message="Any amount collected will be kept as advance." />
      ) : (
        <View style={s.invList}>
          {invoices.map((inv) => (
            <InvoiceAllocRow
              key={inv.id}
              invoice={inv}
              value={alloc[inv.id] ?? ""}
              onChange={(t) => setAllocValue(inv.id, t)}
            />
          ))}
        </View>
      )}

      {invoices.length > 0 ? (
        <View style={s.allocSummary}>
          <View style={s.allocRow}>
            <Text style={s.allocLabel}>Allocated</Text>
            <Text style={[s.allocVal, totalAllocated > 0 && { color: fg }]}>{moneyINR(totalAllocated)}</Text>
          </View>
          <View style={s.allocRow}>
            <Text style={s.allocLabel}>Unallocated (advance)</Text>
            <Text
              style={[
                s.allocVal,
                unallocated > 0.005 && { color: t.color.amb },
                unallocated < -0.005 && { color: t.color.red },
              ]}
            >
              {moneyINR(unallocated)}
            </Text>
          </View>
          {unallocated > 0.005 ? (
            <Text style={s.advanceNote}>Remaining amount will be kept as advance with the customer.</Text>
          ) : null}
        </View>
      ) : null}

      <Pressable
        onPress={() => void submit()}
        disabled={busy || amountNum <= 0}
        accessibilityLabel="Record payment"
        style={({ pressed }) => [
          s.submit,
          { backgroundColor: fg },
          (busy || amountNum <= 0) && { opacity: 0.55 },
          pressed && { opacity: 0.85 },
        ]}
      >
        {busy ? (
          <ActivityIndicator color="#ffffff" size="small" />
        ) : (
          <Text style={s.submitTxt}>Record payment · {moneyINR(amountNum)}</Text>
        )}
      </Pressable>
    </View>
  );
}

function InvoiceAllocRow({
  invoice, value, onChange,
}: {
  invoice: OpenInvoice;
  value: string;
  onChange: (t: string) => void;
}) {
  const { palette: t } = useTheme();
  const s = useStyles();
  const over = parseMoney(value) > invoice.balance + 0.005;
  return (
    <View style={s.invRow}>
      <View style={s.invMain}>
        <Text style={s.invNo}>{invoice.invoiceNo}</Text>
        <Text style={s.invDate}>{dateIST(invoice.invoiceDate)}</Text>
      </View>
      <Text style={s.invBalance}>{moneyINR(invoice.balance)}</Text>
      <View style={[s.allocInputWrap, over && { borderColor: t.color.red }]}>
        <Text style={s.prefix}>₹</Text>
        <TextInput
          style={s.allocInput}
          value={value}
          onChangeText={onChange}
          keyboardType="decimal-pad"
          inputMode="decimal"
          placeholder="0"
          placeholderTextColor={t.color.ink4}
          accessible
          accessibilityLabel={`Allocate to ${invoice.invoiceNo}`}
        />
      </View>
    </View>
  );
}

const useStyles = () => {
  const { palette } = useTheme();
  return useMemo(() => {
    const t = palette;
    return StyleSheet.create({
  wrap: { gap: tokens.space.md },
  outstandingCard: {
    backgroundColor: t.color.surface,
    borderRadius: tokens.radius.md,
    borderLeftWidth: 3,
    padding: tokens.space.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: tokens.space.md,
    ...t.shadow.card,
  },
  outstandingLabel: {
    color: t.color.ink4,
    fontFamily: tokens.font.sansSemi,
    fontSize: tokens.size.eyebrow,
    letterSpacing: 0.6,
  },
  outstandingCustomer: {
    color: t.color.ink3,
    fontFamily: tokens.font.sans,
    fontSize: tokens.size.xs,
    marginTop: 2,
  },
  outstandingVal: {
    color: t.color.red,
    fontFamily: tokens.font.monoBold,
    fontSize: tokens.size.xl,
    fontVariant: ["tabular-nums"],
  },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: tokens.space.sm },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 44,
    paddingHorizontal: tokens.space.md,
    borderRadius: tokens.radius.full,
    borderWidth: 1,
    borderColor: t.color.line,
  },
  chipTxt: { color: t.color.ink2, fontFamily: tokens.font.sansMed, fontSize: tokens.size.xs },
  amountRow: { flexDirection: "row", alignItems: "flex-end", gap: tokens.space.sm },
  amountField: { flex: 1, gap: 6 },
  label: {
    color: t.color.ink3,
    fontFamily: tokens.font.sansSemi,
    fontSize: tokens.size.eyebrow,
    letterSpacing: 0.4,
  },
  moneyInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 44,
    borderWidth: 1,
    borderColor: t.color.line,
    borderRadius: tokens.radius.md,
    backgroundColor: t.color.surface,
    paddingHorizontal: tokens.space.md,
    gap: 2,
  },
  prefix: { color: t.color.ink3, fontFamily: tokens.font.mono, fontSize: tokens.size.sm },
  moneyInput: {
    flex: 1,
    color: t.color.ink,
    fontFamily: tokens.font.mono,
    fontSize: tokens.size.sm,
    fontVariant: ["tabular-nums"],
    paddingVertical: 0,
  },
  fillBtn: {
    minHeight: 44,
    paddingHorizontal: tokens.space.lg,
    borderRadius: tokens.radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  fillTxt: { fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
  textInput: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: t.color.line,
    borderRadius: tokens.radius.md,
    backgroundColor: t.color.surface,
    paddingHorizontal: tokens.space.md,
    paddingVertical: 10,
    color: t.color.ink,
    fontFamily: tokens.font.sansMed,
    fontSize: tokens.size.sm,
  },
  notesInput: { minHeight: 72, textAlignVertical: "top" },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: tokens.space.md,
    marginTop: tokens.space.xs,
  },
  sectionTitle: {
    color: t.color.ink,
    fontFamily: tokens.font.sansSemi,
    fontSize: tokens.size.sm,
    flex: 1,
  },
  autoBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minHeight: 44,
    paddingHorizontal: tokens.space.md,
    borderRadius: tokens.radius.md,
  },
  autoTxt: { fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
  invList: { gap: tokens.space.sm },
  invRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.md,
    backgroundColor: t.color.surface,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: t.color.line,
    padding: tokens.space.md,
    ...t.shadow.card,
  },
  invMain: { flex: 1 },
  invNo: {
    color: t.color.ink,
    fontFamily: tokens.font.monoBold,
    fontSize: tokens.size.xs,
    fontVariant: ["tabular-nums"],
  },
  invDate: { color: t.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow, marginTop: 2 },
  invBalance: {
    color: t.color.ink2,
    fontFamily: tokens.font.mono,
    fontSize: tokens.size.xs,
    fontVariant: ["tabular-nums"],
  },
  allocInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    width: 110,
    minHeight: 44,
    borderWidth: 1,
    borderColor: t.color.line,
    borderRadius: tokens.radius.md,
    backgroundColor: t.color.surface,
    paddingHorizontal: tokens.space.sm,
    gap: 2,
  },
  allocInput: {
    flex: 1,
    color: t.color.ink,
    fontFamily: tokens.font.mono,
    fontSize: tokens.size.xs,
    fontVariant: ["tabular-nums"],
    paddingVertical: 0,
  },
  allocSummary: {
    backgroundColor: t.color.fill,
    borderRadius: tokens.radius.md,
    padding: tokens.space.md,
    gap: 6,
  },
  allocRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  allocLabel: { color: t.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.xs },
  allocVal: {
    color: t.color.ink,
    fontFamily: tokens.font.mono,
    fontSize: tokens.size.xs,
    fontVariant: ["tabular-nums"],
  },
  advanceNote: {
    color: t.color.ink4,
    fontFamily: tokens.font.sans,
    fontSize: tokens.size.eyebrow,
    lineHeight: 15,
  },
  submit: {
    minHeight: 48,
    borderRadius: tokens.radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: tokens.space.xs,
  },
  submitTxt: { color: t.color.surface, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.sm },
});
  }, [palette]);
};
