import { View, Text, StyleSheet } from "react-native";
import { ArrowDownLeft, ArrowUpRight, FileText } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { GradientHeader } from "@/components/GradientHeader";
import { HeaderRight } from "@/components/HeaderRight";
import { SkeletonRows } from "@/components/SkeletonRows";
import { EmptyState } from "@/components/EmptyState";
import { useSession } from "@/lib/session";
import { roleLabel } from "@/lib/claims";
import { moneyINR, dateIST } from "@/lib/format";
import { usePortalStatement } from "@/data/portal";
import { tokens } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeContext";

const TXN_LABEL: Record<string, string> = {
  invoice: "Invoice",
  receipt: "Payment received",
  credit_note: "Credit note",
  adjustment: "Adjustment",
  opening: "Opening balance",
};

export default function CustomerStatement() {
  const s = useStyles();
  const t = useTheme().palette;
  const { claims } = useSession();
  const st = usePortalStatement(100);
  const rows = st.data ?? [];

  // Positive balanceAfter = you owe; negative = credit in your favour.
  const latest = rows[0]?.balanceAfter ?? 0;

  return (
    <Screen refreshing={st.isFetching} onRefresh={() => void st.refetch()}>
      <GradientHeader title="Statement" subtitle={roleLabel(claims)} right={<HeaderRight />} />
      <View style={s.body}>
        {st.isLoading ? (
          <SkeletonRows rows={8} />
        ) : st.isError ? (
          <EmptyState title="Could not load statement" message="Pull down to retry." />
        ) : rows.length === 0 ? (
          <EmptyState icon={FileText} title="Statement is empty" message="Invoices, receipts and credits will appear here." />
        ) : (
          <>
            <View style={s.balBar}>
              <Text style={s.balLabel}>CURRENT BALANCE</Text>
              <Text style={[s.balVal, latest > 0 ? s.balRed : s.balGrn]}>{moneyINR(latest)}</Text>
            </View>
            <View style={s.list}>
              {rows.map((r) => {
                const owes = r.balanceAfter > 0;
                return (
                  <View key={r.id} style={s.rowCard}>
                    <View style={[s.icon, { backgroundColor: owes ? t.color.redWash : t.color.grnWash }]}>
                      {owes ? <ArrowUpRight size={14} color={t.color.red} /> : <ArrowDownLeft size={14} color={t.color.grn} />}
                    </View>
                    <View style={s.main}>
                      <Text style={s.type}>{TXN_LABEL[r.txnType] ?? r.txnType}</Text>
                      <Text style={s.sub} numberOfLines={1}>
                        {dateIST(r.createdAt)} {r.invoiceNo ? `· ${r.invoiceNo}` : ""} {r.receiptNo ? `· ${r.receiptNo}` : ""}
                      </Text>
                    </View>
                    <View style={s.right}>
                      <Text style={[s.amt, { color: owes ? t.color.red : t.color.grn }]}>
                        {r.amount < 0 ? "−" : "+"}
                        {moneyINR(Math.abs(r.amount))}
                      </Text>
                      <Text style={s.balAfter}>bal {moneyINR(r.balanceAfter)}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}
      </View>
    </Screen>
  );
}

const useStyles = () => {
  const t = useTheme().palette;
  return StyleSheet.create({
    body: { paddingHorizontal: tokens.space.lg, paddingTop: tokens.space.lg, gap: tokens.space.md },
    balBar: {
      flexDirection: "row",
      alignItems: "baseline",
      justifyContent: "space-between",
      backgroundColor: t.color.fill,
      borderWidth: 1,
      borderColor: t.color.line,
      borderRadius: tokens.radius.md,
      paddingHorizontal: tokens.space.md,
      paddingVertical: tokens.space.sm,
    },
    balLabel: { color: t.color.ink4, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.eyebrow, letterSpacing: 0.6 },
    balVal: { fontFamily: tokens.font.monoBold, fontSize: tokens.size.sm, fontVariant: ["tabular-nums"] },
    balRed: { color: t.color.red },
    balGrn: { color: t.color.grn },
    list: { gap: tokens.space.xs },
    rowCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.space.sm,
      backgroundColor: t.color.surface,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: t.color.line,
      paddingHorizontal: tokens.space.md,
      paddingVertical: tokens.space.sm,
      ...tokens.shadow.card,
    },
    icon: { width: 28, height: 28, borderRadius: tokens.radius.sm, alignItems: "center", justifyContent: "center" },
    main: { flex: 1, minWidth: 0, gap: 2 },
    type: { color: t.color.ink, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
    sub: { color: t.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow },
    right: { alignItems: "flex-end", gap: 2 },
    amt: { fontFamily: tokens.font.monoBold, fontSize: tokens.size.xs, fontVariant: ["tabular-nums"] },
    balAfter: { color: t.color.ink4, fontFamily: tokens.font.mono, fontSize: tokens.size.eyebrow, fontVariant: ["tabular-nums"] },
  });
};
