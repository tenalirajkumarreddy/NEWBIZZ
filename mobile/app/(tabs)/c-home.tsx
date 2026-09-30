import { View, Text, StyleSheet, Pressable } from "react-native";
import { Wallet, Package, FileText, ReceiptText } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { GradientHeader } from "@/components/GradientHeader";
import { HeaderRight } from "@/components/HeaderRight";
import { SkeletonRows } from "@/components/SkeletonRows";
import { EmptyState } from "@/components/EmptyState";
import { useSession } from "@/lib/session";
import { roleLabel } from "@/lib/claims";
import { moneyINR } from "@/lib/format";
import { usePortalProfile, usePortalInvalidate } from "@/data/portal";
import { gotoTab } from "@/lib/tabBus";
import { tokens } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeContext";

export default function CustomerHome() {
  const s = useStyles();
  const t = useTheme().palette;
  const { claims } = useSession();
  const profile = usePortalProfile();
  const invalidate = usePortalInvalidate();

  // Pull-to-refresh on Home refetches everything — the simplest global sync.
  function onRefresh() {
    invalidate();
  }

  const actions: { id: string; label: string; sub: string; icon: typeof Wallet; onPress: () => void }[] = [
    { id: "inv", label: "Invoices", sub: "Bills and dues", icon: ReceiptText, onPress: () => gotoTab("c-invoices") },
    { id: "ord", label: "Orders", sub: "Place and track", icon: Package, onPress: () => gotoTab("c-orders") },
    { id: "st", label: "Statement", sub: "Ledger history", icon: FileText, onPress: () => gotoTab("c-statement") },
    { id: "pay", label: "Pay", sub: "Report a payment", icon: Wallet, onPress: () => gotoTab("c-pay") },
  ];

  return (
    <Screen refreshing={profile.isFetching} onRefresh={onRefresh}>
      <GradientHeader title={profile.data?.name ?? "Portal"} subtitle={roleLabel(claims)} right={<HeaderRight />} />
      <View style={s.body}>
        {profile.isLoading ? (
          <SkeletonRows rows={3} />
        ) : profile.isError ? (
          <EmptyState title="Could not load your account" message="Pull down to retry." />
        ) : !profile.data ? (
          <EmptyState
            title="Portal not activated"
            message="Your account isn't linked to a customer yet. Contact the office to activate portal access."
          />
        ) : (
          <>
            <View style={s.dueCard}>
              <Text style={s.dueLabel}>OUTSTANDING BALANCE</Text>
              <Text style={[s.dueValue, profile.data.outstanding > 0 ? s.dueRed : s.dueOk]}>
                {moneyINR(profile.data.outstanding)}
              </Text>
              <Text style={s.dueSub}>
                {profile.data.outstanding > 0
                  ? `${profile.data.storeCount} store${profile.data.storeCount === 1 ? "" : "s"} · due to NEWBIZZ`
                  : `${profile.data.storeCount} store${profile.data.storeCount === 1 ? "" : "s"} · all settled`}
              </Text>
            </View>

            <View style={s.grid}>
              {actions.map((a) => (
                <Pressable
                  key={a.id}
                  onPress={a.onPress}
                  accessibilityRole="button"
                  accessibilityLabel={a.label}
                  style={({ pressed }) => [s.tile, pressed && { opacity: 0.85 }]}
                >
                  <View style={[s.tileIcon, { backgroundColor: t.color.brandWash }]}>
                    <a.icon size={18} color={t.color.brand} />
                  </View>
                  <Text style={s.tileLabel}>{a.label}</Text>
                  <Text style={s.tileSub}>{a.sub}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={s.footNote}>
              Orders and payment reports go straight to the office — staff confirm them in the main app.
            </Text>
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
    dueValue: { fontFamily: tokens.font.monoBold, fontSize: 32, fontVariant: ["tabular-nums"] },
    dueRed: { color: t.color.red },
    dueOk: { color: t.color.grn },
    dueSub: { color: t.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.xs },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: tokens.space.sm },
    tile: {
      flexBasis: "47%",
      flexGrow: 1,
      backgroundColor: t.color.surface,
      borderRadius: tokens.radius.lg,
      borderWidth: 1,
      borderColor: t.color.line,
      padding: tokens.space.md,
      gap: 6,
      ...tokens.shadow.card,
    },
    tileIcon: {
      width: 34,
      height: 34,
      borderRadius: tokens.radius.sm,
      alignItems: "center",
      justifyContent: "center",
    },
    tileLabel: { color: t.color.ink, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.sm },
    tileSub: { color: t.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow },
    footNote: {
      color: t.color.ink4,
      fontFamily: tokens.font.sans,
      fontSize: tokens.size.eyebrow,
      textAlign: "center",
      lineHeight: 16,
      paddingHorizontal: tokens.space.md,
    },
  });
};
