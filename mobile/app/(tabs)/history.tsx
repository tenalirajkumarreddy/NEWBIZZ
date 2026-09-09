import { useMemo, useState } from "react";
import { View, Text, Pressable, Alert, StyleSheet } from "react-native";
import { useQueryClient, useIsFetching } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import {
  ArrowDown, ArrowLeftRight, ArrowUp, Ban, Check, FileText, ReceiptText, Wallet, X,
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
import { respondTransfer, cancelTransfer, useMyCustody, type CustodyRow } from "@/data/transfers";
import { useMyActivity } from "@/data/activity";
import { useMyExpenses, type MyExpenseRow } from "@/data/expenses";
import { useActiveUsers } from "@/data/users";
import { qk } from "@/data/keys";
import { moneyINR, dateIST, timeAgoIST } from "@/lib/format";
import { BalanceOverview } from "@/features/history/BalanceOverview";
import { HandoverSheet, type HandoverMode } from "@/features/history/HandoverSheet";
import { ExpenseSheet } from "@/features/history/ExpenseSheet";
import { useTodayKpis } from "@/data/sales";
import { tokens } from "@/theme/tokens";

type Segment = "activity" | "handovers" | "expenses";

interface DayGroup {
  day: string;
  rows: {
    key: string;
    kind: "sale" | "payment";
    docNo: string;
    name: string | null;
    amount: number;
    createdAt: string;
  }[];
}

function groupByDay(rows: ReturnType<typeof useMyActivity>["data"]): DayGroup[] {
  const groups = new Map<string, DayGroup>();
  for (const r of rows ?? []) {
    const day = dateIST(r.createdAt);
    let g = groups.get(day);
    if (!g) {
      g = { day, rows: [] };
      groups.set(day, g);
    }
    g.rows.push({
      key: r.id,
      kind: r.kind,
      docNo: r.docNo,
      name: r.name,
      amount: r.amount,
      createdAt: r.createdAt,
    });
  }
  return [...groups.values()];
}

function TransferRowItem({
  t, fromName, toName, uid, busy, onRespond, onCancel,
}: {
  t: CustodyRow;
  fromName: string;
  toName: string;
  uid: string;
  busy: boolean;
  onRespond: (id: string, accept: boolean) => void;
  onCancel: (id: string) => void;
}) {
  const incoming = t.to_user_id === uid;
  const outgoing = t.from_user_id === uid;
  const isPending = t.status === "pending";
  const DirIcon = incoming && !outgoing ? ArrowDown : ArrowUp;
  const dirTone = incoming && !outgoing ? tokens.color.grn : tokens.color.brand;
  const dirLabel = incoming && !outgoing ? `from ${fromName}` : `to ${toName}`;

  const statusTone =
    t.status === "accepted" ? "grn" : t.status === "rejected" ? "red" : t.status === "pending" ? "amb" : "neutral";

  return (
    <View style={s.trCard}>
      <View style={s.trHead}>
        <View style={[s.trDir, { backgroundColor: incoming && !outgoing ? tokens.color.grnWash : tokens.color.brandWash }]}>
          <DirIcon size={14} color={dirTone} />
        </View>
        <View style={s.trMain}>
          <Text style={s.trNo}>{t.transfer_no}</Text>
          <Text style={s.trParty} numberOfLines={1}>{dirLabel}</Text>
        </View>
        <Text style={s.trAmount} numberOfLines={1}>{moneyINR(Number(t.amount ?? 0))}</Text>
      </View>
      <View style={s.trFoot}>
        <StatusBadge label={t.status} tone={statusTone} />
        {t.note ? <Text style={s.trNote} numberOfLines={1}>"{t.note}"</Text> : <View style={{ flex: 1 }} />}
        <Text style={s.trTime}>{timeAgoIST(t.created_at)}</Text>
      </View>
      {isPending && incoming ? (
        <View style={s.trActions}>
          <Pressable
            onPress={() => onRespond(t.transfer_id, true)}
            disabled={busy}
            accessibilityLabel={`Accept ${t.transfer_no}`}
            style={({ pressed }) => [s.actBtn, s.actGrn, (pressed || busy) && { opacity: 0.8 }]}
          >
            <Check size={14} color="#ffffff" />
            <Text style={s.actTxt}>Confirm</Text>
          </Pressable>
          <Pressable
            onPress={() => onRespond(t.transfer_id, false)}
            disabled={busy}
            accessibilityLabel={`Reject ${t.transfer_no}`}
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
            onPress={() => onCancel(t.transfer_id)}
            disabled={busy}
            accessibilityLabel={`Cancel ${t.transfer_no}`}
            style={({ pressed }) => [s.actBtn, s.actNeutral, (pressed || busy) && { opacity: 0.8 }]}
          >
            <Ban size={14} color={tokens.color.ink2} />
            <Text style={[s.actTxt, { color: tokens.color.ink2 }]}>Cancel</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function ExpenseRowItem({ e }: { e: MyExpenseRow }) {
  const tone = e.status === "approved" ? "grn" : e.status === "rejected" ? "red" : "amb";
  return (
    <View style={s.trCard}>
      <View style={s.trHead}>
        <View style={[s.trDir, { backgroundColor: tokens.color.ambWash }]}>
          <Wallet size={14} color={tokens.color.amb} />
        </View>
        <View style={s.trMain}>
          <Text style={s.trNo}>{e.expenseNo}</Text>
          <Text style={s.trParty} numberOfLines={1}>
            {e.category.replace("_", " ")}{e.note ? ` - ${e.note}` : ""}
          </Text>
        </View>
        <Text style={s.trAmount} numberOfLines={1}>{moneyINR(e.amount)}</Text>
      </View>
      <View style={s.trFoot}>
        <StatusBadge label={e.status} tone={tone} />
        <View style={{ flex: 1 }} />
        <Text style={s.trTime}>{dateIST(e.expenseDate)}</Text>
      </View>
    </View>
  );
}

export default function HistoryScreen() {
  const { user, claims } = useSession();
  const qc = useQueryClient();
  const uid = user?.id ?? "";
  const [seg, setSeg] = useState<Segment>("activity");
  const [sheetMode, setSheetMode] = useState<HandoverMode | null>(null);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const fetching = useIsFetching();

  const kpis = useTodayKpis();
  const activity = useMyActivity();
  const custody = useMyCustody();
  const expenses = useMyExpenses();
  const users = useActiveUsers();

  const nameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of users.data ?? []) m.set(u.id, u.full_name);
    return m;
  }, [users.data]);

  const dayGroups = useMemo(() => groupByDay(activity.data), [activity.data]);

  async function onRespond(id: string, accept: boolean) {
    if (busyId) return;
    setBusyId(id);
    try {
      await respondTransfer(id, accept);
      await qc.invalidateQueries({ queryKey: qk.custody() });
      Toast.show({ type: "success", text1: accept ? "Cash received" : "Transfer rejected" });
    } catch (e) {
      Toast.show({ type: "error", text1: "Could not respond", text2: friendlyError(e) });
    } finally {
      setBusyId(null);
    }
  }

  function onCancel(id: string) {
    if (busyId) return;
    Alert.alert("Cancel transfer", "Cancel this pending cash handover?", [
      { text: "Keep", style: "cancel" },
      {
        text: "Cancel transfer",
        style: "destructive",
        onPress: () => {
          void (async () => {
            setBusyId(id);
            try {
              await cancelTransfer(id);
              await qc.invalidateQueries({ queryKey: qk.custody() });
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
      qc.invalidateQueries({ queryKey: qk.today() }),
      qc.invalidateQueries({ queryKey: qk.activity() }),
      qc.invalidateQueries({ queryKey: qk.custody() }),
      qc.invalidateQueries({ queryKey: qk.expenses() }),
    ]);
  }

  return (
    <Screen refreshing={fetching > 0} onRefresh={onRefresh}>
      <GradientHeader title="History" subtitle={roleLabel(claims)} right={<HeaderRight />} />

      <View style={s.body}>
        <BalanceOverview
          salesTotal={kpis.data?.salesTotal ?? 0}
          collectedTotal={kpis.data?.collectedTotal ?? 0}
          onHandover={() => openSheet("handover")}
          onDeposit={() => openSheet("deposit")}
          onExpense={() => setExpenseOpen(true)}
        />

        <View style={s.segWrap}>
          <SegmentBtn label="Activity" active={seg === "activity"} onPress={() => setSeg("activity")} />
          <SegmentBtn label="Handovers" active={seg === "handovers"} onPress={() => setSeg("handovers")} />
          <SegmentBtn label="Expenses" active={seg === "expenses"} onPress={() => setSeg("expenses")} />
        </View>

        {seg === "activity" ? (
          activity.isLoading ? (
            <SkeletonRows rows={4} />
          ) : activity.isError ? (
            <EmptyState title="Could not load activity" message={friendlyError(activity.error)} />
          ) : dayGroups.length === 0 ? (
            <EmptyState
              icon={ReceiptText}
              title="No recent activity"
              message="Sales and collections from the last 7 days will appear here."
            />
          ) : (
            <View style={s.list}>
              {dayGroups.map((g) => (
                <View key={g.day} style={s.dayGroup}>
                  <Text style={s.dayLabel}>{g.day}</Text>
                  <View style={s.dayCard}>
                    {g.rows.map((r) => (
                      <View key={r.key} style={s.actRow}>
                        <View
                          style={[
                            s.actChip,
                            { backgroundColor: r.kind === "sale" ? tokens.color.brandWash : tokens.color.grnWash },
                          ]}
                        >
                          {r.kind === "sale" ? (
                            <FileText size={13} color={tokens.color.brand} />
                          ) : (
                            <ReceiptText size={13} color={tokens.color.grn} />
                          )}
                        </View>
                        <View style={s.actMain}>
                          <View style={s.actDocRow}>
                            <StatusBadge label={r.kind === "sale" ? "Sale" : "Payment"} tone={r.kind === "sale" ? "brand" : "grn"} />
                            <Text style={s.actDocNo}>{r.docNo}</Text>
                          </View>
                          <Text style={s.actName} numberOfLines={1}>{r.name ?? "—"}</Text>
                        </View>
                        <Text
                          style={[
                            s.actAmount,
                            { color: r.kind === "sale" ? tokens.color.brand : tokens.color.grn },
                          ]}
                          numberOfLines={1}
                        >
                          {moneyINR(r.amount)}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          )
        ) : seg === "handovers" ? (
          custody.isLoading ? (
            <SkeletonRows rows={4} />
          ) : custody.isError ? (
            <EmptyState title="Could not load handovers" message={friendlyError(custody.error)} />
          ) : (custody.data?.length ?? 0) === 0 ? (
            <EmptyState
              icon={ArrowLeftRight}
              title="No handovers yet"
              message="Cash handovers and bank deposits you send or receive will appear here."
            />
          ) : (
            <View style={s.list}>
              {(custody.data ?? []).map((t) => (
                <TransferRowItem
                  key={t.transfer_id}
                  t={t}
                  fromName={nameMap.get(t.from_user_id) ?? shortId(t.from_user_id)}
                  toName={t.to_user_id ? nameMap.get(t.to_user_id) ?? shortId(t.to_user_id) : "Bank"}
                  uid={uid}
                  busy={busyId != null}
                  onRespond={(id, accept) => void onRespond(id, accept)}
                  onCancel={onCancel}
                />
              ))}
            </View>
          )
        ) : expenses.isLoading ? (
          <SkeletonRows rows={4} />
        ) : expenses.isError ? (
          <EmptyState title="Could not load expenses" message={friendlyError(expenses.error)} />
        ) : (expenses.data?.length ?? 0) === 0 ? (
          <EmptyState
            icon={Wallet}
            title="No expenses yet"
            message="Fuel, repairs and other field spends you submit will appear here with their approval status."
          />
        ) : (
          <View style={s.list}>
            {(expenses.data ?? []).map((e) => (
              <ExpenseRowItem key={e.id} e={e} />
            ))}
          </View>
        )}
      </View>

      <HandoverSheet visible={sheetMode != null} mode={sheetMode ?? "handover"} onClose={() => setSheetMode(null)} />
      <ExpenseSheet visible={expenseOpen} onClose={() => setExpenseOpen(false)} />
    </Screen>
  );

  function openSheet(mode: HandoverMode) {
    setSheetMode(mode);
  }
}

function shortId(id: string): string {
  return id ? `…${id.slice(0, 6)}` : "Unknown";
}

function SegmentBtn({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={[s.segBtn, active && s.segBtnActive]}
    >
      <Text style={[s.segTxt, active && s.segTxtActive]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  body: {
    paddingHorizontal: tokens.space.lg,
    paddingTop: tokens.space.lg,
    gap: tokens.space.md,
  },
  segWrap: {
    flexDirection: "row",
    backgroundColor: tokens.color.fill,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.line,
    padding: 3,
    gap: 3,
  },
  segBtn: {
    flex: 1,
    minHeight: 40,
    borderRadius: tokens.radius.sm,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  segBtnActive: { backgroundColor: tokens.color.surface, ...tokens.shadow.card },
  segTxt: { color: tokens.color.ink3, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
  segTxtActive: { color: tokens.color.brand },
  list: { gap: tokens.space.sm },
  dayGroup: { gap: tokens.space.xs },
  dayLabel: {
    color: tokens.color.ink4,
    fontFamily: tokens.font.sansSemi,
    fontSize: tokens.size.eyebrow,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    paddingHorizontal: tokens.space.xs,
  },
  dayCard: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: "rgba(226,232,240,0.6)",
    ...tokens.shadow.card,
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
    color: tokens.color.ink,
    fontFamily: tokens.font.mono,
    fontSize: tokens.size.xs,
    fontVariant: ["tabular-nums"],
  },
  actName: {
    color: tokens.color.ink3,
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
  trCard: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: "rgba(226,232,240,0.6)",
    padding: tokens.space.md,
    gap: tokens.space.sm,
    ...tokens.shadow.card,
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
    color: tokens.color.ink,
    fontFamily: tokens.font.monoBold,
    fontSize: tokens.size.xs,
    fontVariant: ["tabular-nums"],
  },
  trParty: {
    color: tokens.color.ink3,
    fontFamily: tokens.font.sans,
    fontSize: tokens.size.xs,
    marginTop: 1,
  },
  trAmount: {
    color: tokens.color.ink,
    fontFamily: tokens.font.monoBold,
    fontSize: tokens.size.sm,
    fontVariant: ["tabular-nums"],
  },
  trFoot: { flexDirection: "row", alignItems: "center", gap: tokens.space.sm },
  trNote: {
    flex: 1,
    color: tokens.color.ink3,
    fontFamily: tokens.font.sans,
    fontSize: tokens.size.xs,
    fontStyle: "italic",
  },
  trTime: {
    color: tokens.color.ink4,
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
  actGrn: { backgroundColor: tokens.color.grn },
  actRed: { backgroundColor: tokens.color.red },
  actNeutral: {
    backgroundColor: tokens.color.fill,
    borderWidth: 1,
    borderColor: tokens.color.line,
  },
  actTxt: { color: "#ffffff", fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
});
