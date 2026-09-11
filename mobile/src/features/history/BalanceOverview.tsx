import { View, Text, Pressable, StyleSheet } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { FileText, ReceiptText, ArrowLeftRight, Wallet, HandCoins, Landmark } from "lucide-react-native";
import { StatTile } from "@/components/StatTile";
import { useSession } from "@/lib/session";
import { useMyCustody } from "@/data/transfers";
import { qk } from "@/data/keys";
import { moneyCompact, todayIST } from "@/lib/format";
import { tokens } from "@/theme/tokens";
import { useMemo } from "react";
import { useTheme } from "@/theme/ThemeContext";

function istDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export function BalanceOverview({
  salesTotal, collectedTotal, onHandover, onDeposit, onExpense,
}: {
  salesTotal: number;
  collectedTotal: number;
  onHandover: () => void;
  onDeposit: () => void;
  onExpense: () => void;
}) {
  const { palette: t } = useTheme();
  const s = useStyles();
  const qc = useQueryClient();
  const { can } = useSession();
  const custody = useMyCustody();
  const rows = custody.data ?? [];
  const today = todayIST();

  const custodyBalance = rows.length ? Number(rows[0].cash_in_hand ?? 0) : 0;
  const transferredToday = rows.reduce(
    (s, r) =>
      r.type === "cash" && r.status === "accepted" && istDay(r.created_at) === today
        ? s + Number(r.amount ?? 0)
        : s,
    0,
  );

  const showHandover = can("cash.transfer");
  const showDeposit = can("cash.deposit");
  const showExpense = can("expense.submit") || can("expense.manage");

  return (
    <View style={s.card}>
      <View style={s.grid}>
        <View style={s.row}>
          <StatTile label="Today sales" value={moneyCompact(salesTotal)} tone="brand" icon={FileText} />
          <StatTile label="Today collections" value={moneyCompact(collectedTotal)} tone="grn" icon={ReceiptText} />
        </View>
        <View style={s.row}>
          <StatTile
            label="Transferred today"
            value={moneyCompact(transferredToday)}
            tone="amb"
            icon={ArrowLeftRight}
          />
          <StatTile
            label="Cash in hand"
            value={custodyBalance > 0 ? `+${moneyCompact(custodyBalance)}` : custodyBalance < 0 ? `-${moneyCompact(Math.abs(custodyBalance))}` : moneyCompact(0)}
            valueColor={custodyBalance > 0 ? tokens.color.red : custodyBalance < 0 ? tokens.color.grn : undefined}
            tone={custodyBalance > 0 ? "red" : "brand"}
            icon={Wallet}
          />
        </View>
      </View>

      {showHandover || showDeposit ? (
        <View style={s.btns}>
          {showHandover ? (
            <Pressable
              onPress={() => {
                void qc.invalidateQueries({ queryKey: qk.custody() });
                onHandover();
              }}
              style={({ pressed }) => [s.btn, { backgroundColor: t.color.brand }, pressed && { opacity: 0.9 }]}
              accessibilityLabel="Hand over cash"
            >
              <HandCoins size={15} color="#ffffff" />
              <Text style={s.btnTxt}>Hand over cash</Text>
            </Pressable>
          ) : null}
          {showDeposit ? (
            <Pressable
              onPress={onDeposit}
              style={({ pressed }) => [s.btn, { backgroundColor: t.color.grn }, pressed && { opacity: 0.9 }]}
              accessibilityLabel="Deposit to bank"
            >
              <Landmark size={15} color="#ffffff" />
              <Text style={s.btnTxt}>Deposit to bank</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {showExpense ? (
        <Pressable
          onPress={onExpense}
          style={({ pressed }) => [s.btn, s.expenseBtn, pressed && { opacity: 0.9 }]}
          accessibilityLabel="Submit expense"
        >
          <Wallet size={15} color={t.color.amb} />
          <Text style={[s.btnTxt, { color: t.color.amb }]}>Submit expense</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const useStyles = () => {
  const { palette } = useTheme();
  return useMemo(() => {
    const t = palette;
    return StyleSheet.create({
  card: {
    backgroundColor: t.color.fill,
    borderRadius: tokens.radius.lg,
    padding: tokens.space.sm,
    gap: tokens.space.sm,
    borderWidth: 1,
    borderColor: t.color.line,
  },
  grid: { gap: tokens.space.sm },
  row: { flexDirection: "row", gap: tokens.space.sm },
  btns: { flexDirection: "row", gap: tokens.space.sm },
  expenseBtn: {
    backgroundColor: t.color.ambWash,
    borderWidth: 1,
    borderColor: "rgba(217,119,6,0.25)",
  },
  btn: {
    flex: 1,
    minHeight: 44,
    borderRadius: tokens.radius.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: tokens.space.xs,
  },
  btnTxt: { color: "#ffffff", fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
});
  }, [palette]);
};
