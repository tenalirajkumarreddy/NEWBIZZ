import { useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useIsFetching } from "@tanstack/react-query";
import {
  Boxes, ChevronRight, Factory, IndianRupee, ClipboardList, Users, Cart, ReceiptText,
} from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { GradientHeader } from "@/components/GradientHeader";
import { HeaderRight } from "@/components/HeaderRight";
import { StatTile } from "@/components/StatTile";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonRows } from "@/components/SkeletonRows";
import { PressCard } from "@/components/PressCard";
import { useSession } from "@/lib/session";
import { roleLabel } from "@/lib/claims";
import { friendlyError } from "@/lib/rpc";
import { moneyCompact } from "@/lib/format";
import { useRouter } from "expo-router";
import { useTodayProduction, useAttendanceToday } from "@/data/production";
import { useStockLevels } from "@/data/production";
import { useTodayKpis } from "@/data/sales";
import { tokens } from "@/theme/tokens";

export default function OperatorDashboard() {
  const { claims } = useSession();
  const { palette: t } = useTheme();
  const s = useStyles();
  const fetching = useIsFetching();
  const prod = useTodayProduction();
  const attendance = useAttendanceToday();
  const stock = useStockLevels();
  const kpis = useTodayKpis();
  const [staffOpen, setStaffOpen] = useState(false);

  const stages = prod.data?.stages ?? [];
  const lowStock = (stock.data ?? []).filter((r) => r.reorderLevel > 0 && r.qtyOnHand <= r.reorderLevel).length;
  const present = (attendance.data ?? []).length;
  const pendingJobs = stages.reduce((sum, st) => sum + st.jobs, 0);

  const links: { label: string; sub: string; href: string; icon: typeof Boxes }[] = [
    { label: "Inventory", sub: "Stock levels and reorder alerts", href: "/inv-op", icon: Boxes },
    { label: "Stores & Orders", sub: "Orders, challans and delivery", href: "/stores-orders", icon: Cart },
    { label: "Staff", sub: "Workers, attendance and payroll", href: "/staff", icon: Users },
  ];

  return (
    <Screen
      refreshing={fetching > 0}
      onRefresh={() => {
        void prod.refetch();
        void attendance.refetch();
        void stock.refetch();
      }}
    >
      <GradientHeader title="Dashboard" subtitle={roleLabel(claims)} right={<HeaderRight />} />

      <View style={s.body}>
        {/* production vs target */}
        <View style={s.card}>
          <View style={s.cardHead}>
            <View style={s.chip}>
              <Factory size={14} color={t.color.brand} />
            </View>
            <Text style={s.cardTitle}>Production today</Text>
          </View>
          {prod.isLoading ? (
            <SkeletonRows rows={3} />
          ) : prod.isError ? (
            <EmptyState title="Could not load production" message={friendlyError(prod.error)} />
          ) : (
            <>
              {stages.map((st) => {
                const pct = st.targetQty > 0 ? Math.min(100, Math.round((st.producedQty / st.targetQty) * 100)) : 0;
                return (
                  <View key={st.stage} style={s.stageBlock}>
                    <View style={s.stageHead}>
                      <Text style={s.stageName}>{st.stage === 1 ? "Blowing" : "Filling"}</Text>
                      <Text style={s.stageNums}>
                        {st.producedQty.toLocaleString("en-IN")} / {st.targetQty.toLocaleString("en-IN")}
                      </Text>
                    </View>
                    <View style={s.barTrack}>
                      <View style={[s.barFill, { width: `${pct}%` }]} />
                    </View>
                    <Text style={s.stageSub}>{st.jobs} job{st.jobs === 1 ? "" : "s"} · {pct}%</Text>
                  </View>
                );
              })}
              {(prod.data?.recent ?? []).slice(0, 3).map((r) => (
                <View key={r.runNo} style={s.runRow}>
                  <Text style={s.runNo}>{r.runNo}</Text>
                  <Text style={s.runName} numberOfLines={1}>{r.name}</Text>
                  <Text style={s.runQty}>{r.qty.toLocaleString("en-IN")}</Text>
                </View>
              ))}
            </>
          )}
        </View>

        {/* quick stats */}
        <View style={s.tiles}>
          <StatTile label="Sales today" value={moneyCompact(kpis.data?.salesTotal ?? 0)} tone="brand" icon={IndianRupee} />
          <StatTile label="Collected" value={moneyCompact(kpis.data?.collectedTotal ?? 0)} tone="grn" icon={ReceiptText} />
        </View>
        <View style={s.tiles}>
          <StatTile label="Open jobs" value={String(pendingJobs)} tone="amb" icon={ClipboardList} />
          <StatTile label="Low stock" value={String(lowStock)} tone={lowStock > 0 ? "red" : "brand"} icon={Boxes} />
        </View>

        {/* attendance today */}
        <PressCard onPress={() => setStaffOpen((v) => !v)} style={s.attCard}>
          <View style={s.attRow}>
            <Users size={15} color={t.color.brand} />
            <Text style={s.attTitle}>Attendance today</Text>
            <Text style={s.attCount}>{present} marked</Text>
            <ChevronRight size={15} color={t.color.ink4} />
          </View>
          {staffOpen ? (
            attendance.isLoading ? (
              <Text style={s.attSub}>Loading…</Text>
            ) : (attendance.data?.length ?? 0) === 0 ? (
              <Text style={s.attSub}>Nobody marked yet — open Staff to mark attendance.</Text>
            ) : (
              (attendance.data ?? []).map((a) => (
                <View key={a.id} style={s.attLine}>
                  <Text style={s.attName} numberOfLines={1}>{a.name}</Text>
                  <Text style={s.attStatus}>{a.status.replace("_", " ")}{a.hours > 0 ? ` · ${a.hours}h` : ""}</Text>
                </View>
              ))
            )
          ) : null}
        </PressCard>

        {/* quick links */}
        {links.map((l) => {
          const Icon = l.icon;
          return (
            <PressCard key={l.href} onPress={() => router.push(l.href as never)} style={s.linkCard}>
              <View style={s.linkRow}>
                <View style={s.linkChip}>
                  <Icon size={15} color={t.color.brand} />
                </View>
                <View style={s.linkTexts}>
                  <Text style={s.linkLabel}>{l.label}</Text>
                  <Text style={s.linkSub} numberOfLines={1}>{l.sub}</Text>
                </View>
                <ChevronRight size={15} color={t.color.ink4} />
              </View>
            </PressCard>
          );
        })}
      </View>
    </Screen>
  );
}

const useStyles = () => {
  const { palette: t } = useTheme();
  return StyleSheet.create({
    body: {
      paddingHorizontal: tokens.space.lg,
      paddingTop: tokens.space.lg,
      gap: tokens.space.md,
    },
    card: {
      backgroundColor: t.color.surface,
      borderRadius: tokens.radius.lg,
      borderWidth: 1,
      borderColor: t.color.line,
      padding: tokens.space.md,
      gap: tokens.space.xs,
      ...tokens.shadow.card,
    },
    cardHead: { flexDirection: "row", alignItems: "center", gap: tokens.space.sm, marginBottom: tokens.space.xs },
    chip: {
      width: 28,
      height: 28,
      borderRadius: tokens.radius.sm,
      backgroundColor: t.color.brandWash,
      alignItems: "center",
      justifyContent: "center",
    },
    cardTitle: { color: t.color.ink, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.sm },
    stageBlock: { gap: 3, marginTop: tokens.space.xs },
    stageHead: { flexDirection: "row", justifyContent: "space-between" },
    stageName: { color: t.color.ink2, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
    stageNums: {
      color: t.color.ink,
      fontFamily: tokens.font.monoBold,
      fontSize: tokens.size.xs,
      fontVariant: ["tabular-nums"],
    },
    barTrack: {
      height: 8,
      borderRadius: 4,
      backgroundColor: t.color.fill,
      overflow: "hidden",
    },
    barFill: { height: "100%", backgroundColor: t.color.brand, borderRadius: 4 },
    stageSub: { color: t.color.ink4, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow },
    runRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.space.sm,
      minHeight: 30,
      marginTop: 2,
    },
    runNo: {
      color: t.color.ink3,
      fontFamily: tokens.font.mono,
      fontSize: tokens.size.eyebrow,
      fontVariant: ["tabular-nums"],
    },
    runName: { flex: 1, color: t.color.ink2, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow },
    runQty: {
      color: t.color.ink,
      fontFamily: tokens.font.monoBold,
      fontSize: tokens.size.eyebrow,
      fontVariant: ["tabular-nums"],
    },
    tiles: { flexDirection: "row", gap: tokens.space.sm },
    attCard: { padding: tokens.space.md },
    attRow: { flexDirection: "row", alignItems: "center", gap: tokens.space.sm },
    attTitle: { flex: 1, color: t.color.ink, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
    attCount: {
      color: t.color.ink3,
      fontFamily: tokens.font.monoBold,
      fontSize: tokens.size.xs,
      fontVariant: ["tabular-nums"],
    },
    attSub: { color: t.color.ink4, fontFamily: tokens.font.sans, fontSize: tokens.size.xs, marginTop: tokens.space.xs },
    attLine: {
      flexDirection: "row",
      justifyContent: "space-between",
      minHeight: 30,
      alignItems: "center",
      marginTop: 2,
    },
    attName: { flex: 1, color: t.color.ink2, fontFamily: tokens.font.sans, fontSize: tokens.size.xs },
    attStatus: {
      color: t.color.ink3,
      fontFamily: tokens.font.mono,
      fontSize: tokens.size.eyebrow,
      fontVariant: ["tabular-nums"],
    },
    linkCard: { padding: tokens.space.sm },
    linkRow: { flexDirection: "row", alignItems: "center", gap: tokens.space.md },
    linkChip: {
      width: 34,
      height: 34,
      borderRadius: tokens.radius.md,
      backgroundColor: t.color.brandWash,
      alignItems: "center",
      justifyContent: "center",
    },
    linkInner: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      minHeight: 44,
    },
    linkTexts: { flex: 1, minWidth: 0 },
    linkLabel: { color: t.color.ink, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
    linkSub: { color: t.color.ink4, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow, marginTop: 1 },
  });
};
