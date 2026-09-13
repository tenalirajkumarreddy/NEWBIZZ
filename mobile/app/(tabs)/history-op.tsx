import { useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, Alert } from "react-native";
import { useQueryClient, useIsFetching } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import {
  ArrowDown, ArrowLeftRight, ArrowUp, Ban, Check, Factory, History, PackagePlus, X,
} from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { GradientHeader } from "@/components/GradientHeader";
import { HeaderRight } from "@/components/HeaderRight";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonRows } from "@/components/SkeletonRows";
import { useSession } from "@/lib/session";
import { friendlyError } from "@/lib/rpc";
import { roleLabel } from "@/lib/claims";
import { moneyINR, dateIST } from "@/lib/format";
import { qk } from "@/data/keys";
import { useMyActivity } from "@/data/activity";
import { useMyRuns, useStaff } from "@/data/operator";
import { respondTransfer, cancelTransfer, useMyCustody, type CustodyRow } from "@/data/transfers";
import { mergeOperatorActivity, type OpActivityRow } from "@/lib/opHistory";
import { StockHandoverSheet } from "@/features/history/StockHandoverSheet";
import { tokens } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeContext";

type Segment = "activity" | "handovers";

interface DayGroup {
  day: string;
  rows: OpActivityRow[];
}

function groupByDay(rows: OpActivityRow[]): DayGroup[] {
  const groups = new Map<string, DayGroup>();
  for (const r of rows) {
    const day = dateIST(r.createdAt);
    let g = groups.get(day);
    if (!g) {
      g = { day, rows: [] };
      groups.set(day, g);
    }
    g.rows.push(r);
  }
  return [...groups.values()];
}

const STATUS_TONE: Record<string, "amb" | "grn" | "red" | "neutral"> = {
  pending: "amb", accepted: "grn", rejected: "red", cancelled: "neutral",
};

function CustodyRowItem({
  row, fromName, toName, uid, busy, onRespond, onCancel,
}: {
  row: CustodyRow;
  fromName: string;
  toName: string;
  uid: string;
  busy: boolean;
  onRespond: (id: string, accept: boolean) => void;
  onCancel: (id: string) => void;
}) {
  const { palette: t } = useTheme();
  const s = useStyles();
  const incoming = row.to_user_id === uid;
  const outgoing = row.from_user_id === uid;
  const isPending = row.status === "pending";
  return (
    <View style={s.trCard}>
      <View style={s.trHead}>
        <View style={[s.trDir, { backgroundColor: row.type === "stock" ? t.color.brandWash : t.color.fill }]}>
          {row.type === "stock" ? (
            <Factory size={14} color={t.color.brand} />
          ) : (
            <ArrowLeftRight size={14} color={t.color.ink3} />
          )}
        </View>
        <View style={s.trMain}>
          <Text style={s.trNo}>{row.transfer_no}</Text>
          <Text style={s.trParty} numberOfLines={1}>{fromName} → {toName}</Text>
        </View>
        <StatusBadge label={row.type === "stock" ? "Stock" : "Cash"} tone={row.type === "stock" ? "brand" : "neutral"} />
      </View>
      <View style={s.trFoot}>
        <StatusBadge label={row.status} tone={STATUS_TONE[row.status] ?? "neutral"} />
        {row.note ? <Text style={s.trNote} numberOfLines={1}>"{row.note}"</Text> : <View style={{ flex: 1 }} />}
        <Text style={s.trTime}>{dateIST(row.created_at)}</Text>
      </View>
      {isPending && incoming ? (
        <View style={s.trActions}>
          <Pressable
            onPress={() => onRespond(row.transfer_id, true)}
            disabled={busy}
            accessibilityLabel={`Accept ${row.transfer_no}`}
            style={({ pressed }) => [s.actBtn, s.actGrn, (pressed || busy) && { opacity: 0.8 }]}
          >
            <Check size={14} color="#ffffff" />
            <Text style={s.actTxt}>Accept</Text>
          </Pressable>
          <Pressable
            onPress={() => onRespond(row.transfer_id, false)}
            disabled={busy}
            accessibilityLabel={`Reject ${row.transfer_no}`}
            style={({ pressed }) => [s.actBtn, s.actRed, (pressed || busy) && { opacity: 0.8 }]}
          >
            <X size={14} color="#ffffff" />
            <Text style={s.actTxt}>Reject</Text>
          </Pressable>
        </View>
      ) : null}
      {isPending && outgoing ? (
        <View style={s.trActions}>
          <Pressable
            onPress={() => onCancel(row.transfer_id)}
            disabled={busy}
            accessibilityLabel={`Cancel ${row.transfer_no}`}
            style={({ pressed }) => [s.actBtn, s.actNeutral, (pressed || busy) && { opacity: 0.8 }]}
          >
            <Ban size={14} color={t.color.ink2} />
            <Text style={[s.actTxt, { color: t.color.ink2 }]}>Cancel</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

export default function HistoryOpScreen() {
  const s = useStyles();
  const { palette: t } = useTheme();
  const { user, claims } = useSession();
  const qc = useQueryClient();
  const uid = user?.id ?? "";
  const fetching = useIsFetching();
  const [seg, setSeg] = useState<Segment>("activity");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const activity = useMyActivity();
  const runs = useMyRuns();
  const custody = useMyCustody();
  const staff = useStaff();

  const nameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const w of staff.data ?? []) m.set(w.id, w.name);
    return m;
  }, [staff.data]);

  const dayGroups = useMemo(
    () => groupByDay(mergeOperatorActivity(activity.data ?? [], runs.data ?? [])),
    [activity.data, runs.data],
  );

  const actLoading = activity.isLoading || runs.isLoading;
  const actError = activity.isError ? activity.error : runs.isError ? runs.error : null;

  async function onRespond(id: string, accept: boolean) {
    if (busyId) return;
    setBusyId(id);
    try {
      await respondTransfer(id, accept);
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.custody() }),
        qc.invalidateQueries({ queryKey: qk.stockLevels() }),
        qc.invalidateQueries({ queryKey: qk.opTodayProduction() }),
      ]);
      Toast.show({ type: "success", text1: accept ? "Handover accepted" : "Transfer rejected" });
    } catch (e) {
      Toast.show({ type: "error", text1: "Could not respond", text2: friendlyError(e) });
    } finally {
      setBusyId(null);
    }
  }

  function onCancel(id: string) {
    if (busyId) return;
    Alert.alert("Cancel handover", "Cancel this pending handover?", [
      { text: "Keep", style: "cancel" },
      {
        text: "Cancel it",
        style: "destructive",
        onPress: () => {
          void (async () => {
            setBusyId(id);
            try {
              await cancelTransfer(id);
              await Promise.all([
                qc.invalidateQueries({ queryKey: qk.custody() }),
                qc.invalidateQueries({ queryKey: qk.stockLevels() }),
                qc.invalidateQueries({ queryKey: qk.opTodayProduction() }),
              ]);
              Toast.show({ type: "success", text1: "Transfer cancelled" });
            } catch (e) {
              Toast.show({ type: "error", text1: "Could not cancel", text2: friendlyError(e) });
            } finally {
              setBusyId(null);
            }
          })();
        },
      },
    ]);
  }

  async function onRefresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: qk.activity() }),
      qc.invalidateQueries({ queryKey: qk.myRuns() }),
      qc.invalidateQueries({ queryKey: qk.custody() }),
      qc.invalidateQueries({ queryKey: qk.stockLevels() }),
      qc.invalidateQueries({ queryKey: qk.opTodayProduction() }),
    ]);
  }

  return (
    <Screen refreshing={fetching > 0} onRefresh={onRefresh}>
      <GradientHeader title="History" subtitle={roleLabel(claims)} right={<HeaderRight />} />

      <View style={s.body}>
        <View style={s.segRow}>
          {(["activity", "handovers"] as Segment[]).map((k) => (
            <Pressable
              key={k}
              onPress={() => setSeg(k)}
              accessibilityRole="tab"
              accessibilityState={{ selected: seg === k }}
              style={[s.segBtn, seg === k && s.segBtnOn]}
            >
              <Text style={[s.segTxt, seg === k && s.segTxtOn]}>
                {k === "activity" ? "Activity" : "Handovers"}
              </Text>
            </Pressable>
          ))}
        </View>

        {seg === "activity" ? (
          actLoading ? (
            <SkeletonRows rows={4} />
          ) : actError ? (
            <EmptyState title="Could not load activity" message={friendlyError(actError)} />
          ) : dayGroups.length === 0 ? (
            <EmptyState
              icon={History}
              title="No recent activity"
              message="Sales, collections and production runs from the last 7 days will appear here."
            />
          ) : (
            <View style={s.list}>
              {dayGroups.map((g) => (
                <View key={g.day} style={s.dayGroup}>
                  <Text style={s.dayLabel}>{g.day}</Text>
                  <View style={s.dayCard}>
                    {g.rows.map((r) => (
                      <View key={`${r.kind}-${r.id}`} style={s.actRow}>
                        <View
                          style={[
                            s.actChip,
                            {
                              backgroundColor:
                                r.kind === "run" ? t.color.ambWash : r.kind === "sale" ? t.color.brandWash : t.color.grnWash,
                            },
                          ]}
                        >
                          {r.kind === "run" ? (
                            <Factory size={13} color={t.color.amb} />
                          ) : r.kind === "sale" ? (
                            <ArrowUp size={13} color={t.color.brand} />
                          ) : (
                            <ArrowDown size={13} color={t.color.grn} />
                          )}
                        </View>
                        <View style={s.actMain}>
                          <View style={s.actDocRow}>
                            <StatusBadge
                              label={r.kind === "run" ? "Run" : r.kind === "sale" ? "Sale" : "Payment"}
                              tone={r.kind === "run" ? "amb" : r.kind === "sale" ? "brand" : "grn"}
                            />
                            <Text style={s.actDocNo}>{r.docNo}</Text>
                          </View>
                          <Text style={s.actName} numberOfLines={1}>{r.name ?? "—"}</Text>
                        </View>
                        <Text
                          style={[
                            s.actAmount,
                            { color: r.kind === "run" ? t.color.ink2 : r.kind === "sale" ? t.color.brand : t.color.grn },
                          ]}
                          numberOfLines={1}
                        >
                          {r.kind === "run"
                            ? `${r.amount.toLocaleString("en-IN")} units`
                            : moneyINR(r.amount)}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          )
        ) : (
          <>
            <View style={s.handoverBar}>
              <Pressable
                onPress={() => setSheetOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Create stock handover"
                style={({ pressed }) => [s.handoverBtn, pressed && { opacity: 0.8 }]}
              >
                <PackagePlus size={14} color={t.color.brand} />
                <Text style={s.handoverBtnTxt}>+ Stock handover</Text>
              </Pressable>
            </View>
            {custody.isLoading ? (
              <SkeletonRows rows={4} />
            ) : custody.isError ? (
              <EmptyState title="Could not load handovers" message={friendlyError(custody.error)} />
            ) : (custody.data?.length ?? 0) === 0 ? (
              <EmptyState
                icon={ArrowLeftRight}
                title="No handovers yet"
                message="Stock and cash handovers you send or receive will appear here."
              />
            ) : (
              <View style={s.list}>
                {(custody.data ?? []).map((tr) => (
                  <CustodyRowItem
                    key={tr.transfer_id}
                    row={tr}
                    fromName={tr.from_user_id ? nameMap.get(tr.from_user_id) ?? shortId(tr.from_user_id) : "Warehouse"}
                    toName={tr.to_user_id ? nameMap.get(tr.to_user_id) ?? shortId(tr.to_user_id) : "Warehouse"}
                    uid={uid}
                    busy={busyId != null}
                    onRespond={(id, accept) => void onRespond(id, accept)}
                    onCancel={onCancel}
                  />
                ))}
              </View>
            )}
          </>
        )}
      </View>

      <StockHandoverSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} />
    </Screen>
  );
}

function shortId(id: string): string {
  return id ? `…${id.slice(0, 6)}` : "Warehouse";
}

const useStyles = () => {
  const { palette } = useTheme();
  return useMemo(() => {
    const t = palette;
    return StyleSheet.create({
      body: {
        paddingHorizontal: tokens.space.lg,
        paddingTop: tokens.space.md,
        gap: tokens.space.md,
      },
      segRow: { flexDirection: "row", gap: tokens.space.sm },
      segBtn: {
        flex: 1,
        minHeight: 36,
        borderRadius: tokens.radius.md,
        borderWidth: 1,
        borderColor: t.color.line,
        backgroundColor: t.color.surface,
        alignItems: "center",
        justifyContent: "center",
      },
      segBtnOn: { backgroundColor: t.color.ink, borderColor: t.color.ink },
      segTxt: { color: t.color.ink3, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
      segTxtOn: { color: t.color.surface },
      list: { gap: tokens.space.sm },
      dayGroup: { gap: tokens.space.xs },
      dayLabel: {
        color: t.color.ink4,
        fontFamily: tokens.font.sansSemi,
        fontSize: tokens.size.eyebrow,
        letterSpacing: 0.6,
        textTransform: "uppercase",
        paddingHorizontal: tokens.space.xs,
      },
      dayCard: {
        backgroundColor: t.color.surface,
        borderRadius: tokens.radius.lg,
        borderWidth: 1,
        borderColor: t.color.line,
        ...t.shadow.card,
      },
      actRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: tokens.space.md,
        minHeight: 56,
        paddingHorizontal: tokens.space.md,
        paddingVertical: tokens.space.xs,
      },
      actChip: {
        width: 28,
        height: 28,
        borderRadius: tokens.radius.sm,
        alignItems: "center",
        justifyContent: "center",
      },
      actMain: { flex: 1, minWidth: 0 },
      actDocRow: { flexDirection: "row", alignItems: "center", gap: tokens.space.xs },
      actDocNo: {
        color: t.color.ink,
        fontFamily: tokens.font.mono,
        fontSize: tokens.size.xs,
        fontVariant: ["tabular-nums"],
      },
      actName: {
        color: t.color.ink3,
        fontFamily: tokens.font.sans,
        fontSize: tokens.size.xs,
        marginTop: 1,
      },
      actAmount: {
        fontFamily: tokens.font.monoBold,
        fontSize: tokens.size.xs,
        fontVariant: ["tabular-nums"],
        maxWidth: 110,
      },
      handoverBar: { flexDirection: "row" },
      handoverBtn: {
        flex: 1,
        minHeight: 44,
        borderRadius: tokens.radius.md,
        borderWidth: 1,
        borderColor: t.color.line,
        backgroundColor: t.color.surface,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
      },
      handoverBtnTxt: { fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs, color: t.color.ink },
      trCard: {
        backgroundColor: t.color.surface,
        borderRadius: tokens.radius.lg,
        borderWidth: 1,
        borderColor: t.color.line,
        padding: tokens.space.md,
        gap: tokens.space.sm,
        ...t.shadow.card,
      },
      trHead: { flexDirection: "row", alignItems: "center", gap: tokens.space.md },
      trDir: {
        width: 30,
        height: 30,
        borderRadius: tokens.radius.sm,
        alignItems: "center",
        justifyContent: "center",
      },
      trMain: { flex: 1, minWidth: 0 },
      trNo: {
        color: t.color.ink,
        fontFamily: tokens.font.monoBold,
        fontSize: tokens.size.xs,
        fontVariant: ["tabular-nums"],
      },
      trParty: {
        color: t.color.ink3,
        fontFamily: tokens.font.sans,
        fontSize: tokens.size.xs,
        marginTop: 1,
      },
      trFoot: { flexDirection: "row", alignItems: "center", gap: tokens.space.sm },
      trNote: {
        flex: 1,
        color: t.color.ink3,
        fontFamily: tokens.font.sans,
        fontSize: tokens.size.xs,
        fontStyle: "italic",
      },
      trTime: {
        color: t.color.ink4,
        fontFamily: tokens.font.sans,
        fontSize: tokens.size.eyebrow,
      },
      trActions: { flexDirection: "row", gap: tokens.space.sm },
      actBtn: {
        flex: 1,
        minHeight: 44,
        borderRadius: tokens.radius.md,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: tokens.space.xs,
      },
      actGrn: { backgroundColor: t.color.grn },
      actRed: { backgroundColor: t.color.red },
      actNeutral: {
        backgroundColor: t.color.fill,
        borderWidth: 1,
        borderColor: t.color.line,
      },
      actTxt: { color: "#ffffff", fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
    });
  }, [palette]);
};
