import { View, Text, StyleSheet } from "react-native";
import { Screen } from "@/components/Screen";
import { GradientHeader } from "@/components/GradientHeader";
import { HeaderRight } from "@/components/HeaderRight";
import { SkeletonRows } from "@/components/SkeletonRows";
import { EmptyState } from "@/components/EmptyState";
import { StatusBadge } from "@/components/StatusBadge";
import { useSession } from "@/lib/session";
import { roleLabel } from "@/lib/claims";
import { moneyINR, dateIST } from "@/lib/format";
import { usePortalInvoices } from "@/data/portal";
import { tokens } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeContext";

function invoiceTone(status: string): "grn" | "amb" | "red" | "neutral" {
  if (status === "paid") return "grn";
  if (status === "partial") return "amb";
  if (status === "unpaid" || status === "overdue") return "red";
  return "neutral";
}

export default function CustomerInvoices() {
  const s = useStyles();
  const t = useTheme().palette;
  const { claims } = useSession();
  const inv = usePortalInvoices();
  const rows = inv.data ?? [];

  const totalDue = rows.reduce((sum, i) => sum + Math.max(0, i.due), 0);

  return (
    <Screen refreshing={inv.isFetching} onRefresh={() => void inv.refetch()}>
      <GradientHeader title="Invoices" subtitle={roleLabel(claims)} right={<HeaderRight />} />
      <View style={s.body}>
        {inv.isLoading ? (
          <SkeletonRows rows={6} />
        ) : inv.isError ? (
          <EmptyState title="Could not load invoices" message="Pull down to retry." />
        ) : rows.length === 0 ? (
          <EmptyState title="No invoices yet" message="Bills raised for your stores will appear here." />
        ) : (
          <>
            <View style={s.dueBar}>
              <Text style={s.dueBarLabel}>TOTAL DUE</Text>
              <Text style={s.dueBarValue}>{moneyINR(totalDue)}</Text>
            </View>
            <View style={s.list}>
              {rows.map((i) => (
                <View key={i.id} style={s.card}>
                  <View style={s.row}>
                    <View style={s.main}>
                      <Text style={s.docNo}>{i.invoiceNo}</Text>
                      <Text style={s.sub} numberOfLines={1}>
                        {dateIST(i.invoiceDate)} · {i.storeName}
                      </Text>
                    </View>
                    <View style={s.right}>
                      <Text style={s.amount}>{moneyINR(i.grandTotal)}</Text>
                      <StatusBadge label={i.status} tone={invoiceTone(i.status)} />
                    </View>
                  </View>
                  {i.due > 0 ? (
                    <Text style={s.dueLine}>
                      Paid {moneyINR(i.amountPaid)} · Due{" "}
                      <Text style={s.dueAmber}>{moneyINR(i.due)}</Text>
                    </Text>
                  ) : (
                    <Text style={s.dueLine}>Fully paid</Text>
                  )}
                </View>
              ))}
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
    dueBar: {
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
    dueBarLabel: { color: t.color.ink4, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.eyebrow, letterSpacing: 0.6 },
    dueBarValue: { color: t.color.red, fontFamily: tokens.font.monoBold, fontSize: tokens.size.sm, fontVariant: ["tabular-nums"] },
    list: { gap: tokens.space.sm },
    card: {
      backgroundColor: t.color.surface,
      borderRadius: tokens.radius.lg,
      borderWidth: 1,
      borderColor: t.color.line,
      padding: tokens.space.md,
      gap: 6,
      ...tokens.shadow.card,
    },
    row: { flexDirection: "row", alignItems: "flex-start", gap: tokens.space.sm },
    main: { flex: 1, minWidth: 0, gap: 2 },
    docNo: { color: t.color.ink, fontFamily: tokens.font.monoBold, fontSize: tokens.size.xs, fontVariant: ["tabular-nums"] },
    sub: { color: t.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow },
    right: { alignItems: "flex-end", gap: 4 },
    amount: { color: t.color.ink, fontFamily: tokens.font.monoBold, fontSize: tokens.size.sm, fontVariant: ["tabular-nums"] },
    dueLine: { color: t.color.ink4, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow },
    dueAmber: { color: t.color.amb, fontFamily: tokens.font.mono, fontSize: tokens.size.eyebrow },
  });
};
