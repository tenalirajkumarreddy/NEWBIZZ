import { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, Alert, StyleSheet, Image } from "react-native";
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
import { ImageViewer } from "@/components/ImageViewer";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/rpc";
import { roleLabel } from "@/lib/claims";
import { respondTransfer, cancelTransfer, useMyCustody, type CustodyRow } from "@/data/transfers";
import { useMyActivity } from "@/data/activity";
import { useMyExpenses, type MyExpenseRow } from "@/data/expenses";
import { useTransactionImages, imageSignedUrl, deleteTransactionImage } from "@/data/attachments";
import { PressCard } from "@/components/PressCard";
import { Sheet } from "@/components/Sheet";
import { useActiveUsers } from "@/data/users";
import { qk } from "@/data/keys";
import { moneyINR, dateIST, timeAgoIST } from "@/lib/format";
import { BalanceOverview } from "@/features/history/BalanceOverview";
import { HandoverSheet, type HandoverMode } from "@/features/history/HandoverSheet";
import { ExpenseSheet } from "@/features/history/ExpenseSheet";
import { useTodayKpis } from "@/data/sales";
import { tokens } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeContext";

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
  row, fromName, toName, uid, busy, onRespond, onCancel, onOpen,
}: {
  row: CustodyRow;
  fromName: string;
  toName: string;
  uid: string;
  busy: boolean;
  onRespond: (id: string, accept: boolean) => void;
  onCancel: (id: string) => void;
  onOpen: () => void;
}) {
  const images = useTransactionImages("transfers", row.transfer_id);
  const imgs = images.data ?? [];
  const [viewerOpen, setViewerOpen] = useState(false);
  const { palette: t } = useTheme();
  const s = useStyles();
  const incoming = row.to_user_id === uid;
  const outgoing = row.from_user_id === uid;
  const isPending = row.status === "pending";
  const DirIcon = incoming && !outgoing ? ArrowDown : ArrowUp;
  // Money convention: green = you receive, red = you pay/hand out.
  const dirTone = incoming && !outgoing ? t.color.grn : t.color.red;
  const dirLabel = incoming && !outgoing ? `from ${fromName}` : `to ${toName}`;

  const statusTone =
    row.status === "accepted" ? "grn" : row.status === "rejected" ? "red" : row.status === "pending" ? "amb" : "neutral";

  return (
    <PressCard onPress={onOpen} style={s.trCard}>
      <View style={s.trHead}>
        <View style={[s.trDir, { backgroundColor: incoming && !outgoing ? t.color.grnWash : t.color.redWash }]}>
          <DirIcon size={14} color={dirTone} />
        </View>
        <View style={s.trMain}>
          <Text style={s.trNo}>{row.transfer_no}</Text>
          <Text style={s.trParty} numberOfLines={1}>{dirLabel}</Text>
        </View>
        <Text
          style={[s.trAmount, { color: incoming && !outgoing ? t.color.grn : t.color.red }]}
          numberOfLines={1}
        >
          {moneyINR(Number(row.amount ?? 0))}
        </Text>
      </View>
      {imgs.length > 0 ? (
        <Pressable
          onPress={() => setViewerOpen(true)}
          accessibilityLabel={`View ${imgs.length} receipt image(s)`}
          style={({ pressed }) => [s.thumbRow, pressed && { opacity: 0.8 }]}
        >
          {imgs.slice(0, 3).map((img) => (
            <Thumb key={img.id} image={img} />
          ))}
          <Text style={s.thumbCount}>
            {imgs.length} receipt{imgs.length === 1 ? "" : "s"}
          </Text>
        </Pressable>
      ) : null}
      <View style={s.trFoot}>
        <StatusBadge label={row.status} tone={statusTone} />
        {row.note ? <Text style={s.trNote} numberOfLines={1}>"{row.note}"</Text> : <View style={{ flex: 1 }} />}
        <Text style={s.trTime}>{timeAgoIST(row.created_at)}</Text>
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
            <Text style={s.actTxt}>Confirm</Text>
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
      {imgs.length > 0 ? (
        <ImageViewer visible={viewerOpen} items={imgs} onClose={() => setViewerOpen(false)} />
      ) : null}
    </PressCard>
  );
}

/** Small receipt thumbnail that resolves its own signed URL. */
function Thumb({
  image, onOpen,
}: {
  image: { storage_bucket: string; storage_path: string };
  onOpen?: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    imageSignedUrl(image.storage_bucket, image.storage_path)
      .then((u) => alive && setUrl(u))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [image.storage_bucket, image.storage_path]);
  return url ? (
    <Pressable onPress={onOpen} disabled={!onOpen} accessibilityLabel="Open receipt">
      <Image source={{ uri: url }} style={th.thumb} />
    </Pressable>
  ) : (
    <View style={th.thumb} />
  );
}

const th = StyleSheet.create({
  thumb: { width: 28, height: 28, borderRadius: 6, backgroundColor: "rgba(148,163,184,0.25)" },
});

function ExpenseRowItem({ e, onOpen }: { e: MyExpenseRow; onOpen: () => void }) {
  const { palette: t } = useTheme();
  const s = useStyles();
  const tone = e.status === "approved" ? "grn" : e.status === "rejected" ? "red" : "amb";
  // Money convention: approved = paid out (red), pending = uncertain (amber),
  // rejected = nothing moved (muted).
  const amountColor =
    e.status === "approved" ? t.color.red : e.status === "pending" ? t.color.amb : t.color.ink4;
  return (
    <PressCard onPress={onOpen} style={s.trCard}>
      <View style={s.trHead}>
        <View style={[s.trDir, { backgroundColor: t.color.ambWash }]}>
          <Wallet size={14} color={t.color.amb} />
        </View>
        <View style={s.trMain}>
          <Text style={s.trNo}>{e.expenseNo}</Text>
          <Text style={s.trParty} numberOfLines={1}>
            {e.category.replace("_", " ")}{e.note ? ` - ${e.note}` : ""}
          </Text>
        </View>
        <Text style={[s.trAmount, { color: amountColor }]} numberOfLines={1}>{moneyINR(e.amount)}</Text>
      </View>
      <View style={s.trFoot}>
        <StatusBadge label={e.status} tone={tone} />
        <View style={{ flex: 1 }} />
        <Text style={s.trTime}>{dateIST(e.expenseDate)}</Text>
      </View>
    </PressCard>
  );
}

export default function HistoryScreen() {
  const { palette: t } = useTheme();
  const s = useStyles();
  const { user, claims } = useSession();
  const qc = useQueryClient();
  const uid = user?.id ?? "";
  const [seg, setSeg] = useState<Segment>("activity");
  const [sheetMode, setSheetMode] = useState<HandoverMode | null>(null);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [detail, setDetail] = useState<
    { type: "expense"; expense: MyExpenseRow } | { type: "transfer"; row: CustodyRow } | null
  >(null);
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
                            { backgroundColor: r.kind === "sale" ? t.color.brandWash : t.color.grnWash },
                          ]}
                        >
                          {r.kind === "sale" ? (
                            <FileText size={13} color={t.color.brand} />
                          ) : (
                            <ReceiptText size={13} color={t.color.grn} />
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
                            { color: r.kind === "sale" ? t.color.brand : t.color.grn },
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
              {(custody.data ?? []).map((tr) => (
                <TransferRowItem
                  key={tr.transfer_id}
                  row={tr}
                  onOpen={() => setDetail({ type: "transfer", row: tr })}
                  fromName={nameMap.get(tr.from_user_id) ?? shortId(tr.from_user_id)}
                  toName={tr.to_user_id ? nameMap.get(tr.to_user_id) ?? shortId(tr.to_user_id) : "Bank"}
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
              <ExpenseRowItem
                key={e.id}
                e={e}
                onOpen={() => setDetail({ type: "expense", expense: e })}
              />
            ))}
          </View>
        )}
      </View>

      <HandoverSheet visible={sheetMode != null} mode={sheetMode ?? "handover"} onClose={() => setSheetMode(null)} />
      <ExpenseSheet visible={expenseOpen} onClose={() => setExpenseOpen(false)} />
      <TxnDetailSheet detail={detail} uid={uid} onClose={() => setDetail(null)} />
    </Screen>
  );

  function openSheet(mode: HandoverMode) {
    setSheetMode(mode);
  }
}

function shortId(id: string): string {
  return id ? `…${id.slice(0, 6)}` : "Unknown";
}

type DetailSelection =
  | { type: "expense"; expense: MyExpenseRow }
  | { type: "transfer"; row: CustodyRow };

/**
 * Full details for an expense or handover: all fields, attached receipts,
 * and a Cancel action while the transaction is still pending and owned by
 * the signer.
 */
function TxnDetailSheet({
  detail, uid, onClose,
}: {
  detail: DetailSelection | null;
  uid: string;
  onClose: () => void;
}) {
  const { palette: t } = useTheme();
  const s = useStyles();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);

  const entityType = detail?.type === "expense" ? "expenses" : "transfers";
  const entityId =
    detail?.type === "expense" ? detail.expense.id : detail?.type === "transfer" ? detail.row.transfer_id : "";
  const images = useTransactionImages(entityType, entityId, !!detail);

  const canCancel =
    detail?.type === "expense"
      ? detail.expense.status === "pending"
      : detail?.type === "transfer"
        ? detail.row.status === "pending" && detail.row.from_user_id === uid
        : false;

  async function onCancel() {
    if (!detail || busy) return;
    setBusy(true);
    try {
      if (detail.type === "expense") {
        // remove attached receipts first, then the expense itself
        for (const img of images.data ?? []) {
          await deleteTransactionImage(img).catch(() => {});
        }
        const { error } = await supabase.from("expenses").delete().eq("id", detail.expense.id);
        if (error) throw error;
        await Promise.all([
          qc.invalidateQueries({ queryKey: qk.expenses() }),
          qc.invalidateQueries({ queryKey: qk.txnImages("expenses", detail.expense.id) }),
        ]);
        Toast.show({ type: "success", text1: "Expense cancelled" });
      } else {
        await cancelTransfer(detail.row.transfer_id);
        await qc.invalidateQueries({ queryKey: qk.custody() });
        Toast.show({ type: "success", text1: "Transfer cancelled" });
      }
      onClose();
    } catch (e) {
      Toast.show({ type: "error", text1: "Could not cancel", text2: friendlyError(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible={detail != null} onClose={onClose} title={detail ? (detail.type === "expense" ? "Expense details" : "Handover details") : undefined}>
      {detail?.type === "expense" ? (
        <View style={s.detailBody}>
          <View style={s.detailHead}>
            <Text style={s.detailNo}>{detail.expense.expenseNo}</Text>
            <Text style={[s.detailAmount, { color: detail.expense.status === "approved" ? t.color.red : t.color.amb }]}>
              {moneyINR(detail.expense.amount)}
            </Text>
          </View>
          <KVRow k="Category" v={detail.expense.category.replace("_", " ")} />
          <KVRow k="Status" v={detail.expense.status} />
          <KVRow k="Date" v={dateIST(detail.expense.expenseDate)} />
          {detail.expense.note ? <KVRow k="Note" v={detail.expense.note} /> : null}
        </View>
      ) : detail?.type === "transfer" ? (
        <View style={s.detailBody}>
          <View style={s.detailHead}>
            <Text style={s.detailNo}>{detail.row.transfer_no}</Text>
            <Text
              style={[s.detailAmount, { color: detail.row.to_user_id === uid ? t.color.grn : t.color.red }]}
            >
              {moneyINR(Number(detail.row.amount ?? 0))}
            </Text>
          </View>
          <KVRow k="Type" v={detail.row.type === "cash" ? "Cash" : detail.row.type} />
          <KVRow k="Status" v={detail.row.status} />
          <KVRow k="Created" v={timeAgoIST(detail.row.created_at)} />
          {detail.row.note ? <KVRow k="Note" v={detail.row.note} /> : null}
        </View>
      ) : null}

      {detail ? (
        <>
          <Text style={s.receiptsLabel}>
            RECEIPTS {(images.data?.length ?? 0) > 0 ? `(${images.data!.length})` : ""}
          </Text>
          {(images.data?.length ?? 0) === 0 ? (
            <Text style={s.receiptsEmpty}>No receipts attached.</Text>
          ) : (
            <View style={s.receiptsRow}>
              {images.data!.map((img) => (
                <Thumb key={img.id} image={img} onOpen={() => setViewerOpen(true)} />
              ))}
              <Pressable
                onPress={() => setViewerOpen(true)}
                accessibilityLabel="View all receipts"
                style={({ pressed }) => [s.receiptsOpen, pressed && { opacity: 0.75 }]}
              >
                <Text style={s.receiptsOpenTxt}>View all</Text>
              </Pressable>
            </View>
          )}

          {canCancel ? (
            <Pressable
              onPress={() =>
                Alert.alert("Cancel transaction", "This pending transaction will be withdrawn.", [
                  { text: "Keep", style: "cancel" },
                  {
                    text: "Cancel it",
                    style: "destructive",
                    onPress: () => void onCancel(),
                  },
                ])
              }
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Cancel transaction"
              style={({ pressed }) => [s.cancelBtn, (pressed || busy) && { opacity: 0.7 }]}
            >
              <Ban size={15} color={t.color.red} />
              <Text style={s.cancelTxt}>{busy ? "Cancelling…" : "Cancel transaction"}</Text>
            </Pressable>
          ) : null}
          {detail.type === "transfer" && detail.row.status === "accepted" ? (
            <Text style={s.hintTxt}>Accepted transfers cannot be cancelled - reverse with a handover back.</Text>
          ) : null}
        </>
      ) : null}

      {images.data && images.data.length > 0 ? (
        <ImageViewer visible={viewerOpen} items={images.data} onClose={() => setViewerOpen(false)} />
      ) : null}
    </Sheet>
  );
}

function KVRow({ k, v }: { k: string; v: string }) {
  const { palette: t } = useTheme();
  const s = useStyles();
  return (
    <View style={s.kvRow}>
      <Text style={s.kvK}>{k}</Text>
      <Text style={s.kvV} numberOfLines={1}>{v}</Text>
    </View>
  );
}

function SegmentBtn({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const s = useStyles();
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

const useStyles = () => {
  const { palette } = useTheme();
  return useMemo(() => {
    const t = palette;
    return StyleSheet.create({
  body: {
    paddingHorizontal: tokens.space.lg,
    paddingTop: tokens.space.lg,
    gap: tokens.space.md,
  },
  segWrap: {
    flexDirection: "row",
    backgroundColor: t.color.fill,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: t.color.line,
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
  segBtnActive: { backgroundColor: t.color.surface, ...t.shadow.card },
  segTxt: { color: t.color.ink3, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
  segTxtActive: { color: t.color.brand },
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
  trAmount: {
    fontFamily: tokens.font.monoBold,
    fontSize: tokens.size.sm,
    fontVariant: ["tabular-nums"],
  },
  trFoot: { flexDirection: "row", alignItems: "center", gap: tokens.space.sm },
  detailBody: { gap: tokens.space.sm, paddingBottom: tokens.space.md },
  detailHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: tokens.space.md,
  },
  detailNo: {
    color: t.color.ink,
    fontFamily: tokens.font.monoBold,
    fontSize: tokens.size.sm,
    fontVariant: ["tabular-nums"],
  },
  detailAmount: {
    fontFamily: tokens.font.monoBold,
    fontSize: tokens.size.lg,
    fontVariant: ["tabular-nums"],
  },
  kvRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 36,
    gap: tokens.space.md,
  },
  kvK: { color: t.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.xs },
  kvV: {
    color: t.color.ink,
    fontFamily: tokens.font.sansSemi,
    fontSize: tokens.size.xs,
    flexShrink: 1,
    textAlign: "right",
  },
  receiptsLabel: {
    color: t.color.ink4,
    fontFamily: tokens.font.sansSemi,
    fontSize: tokens.size.eyebrow,
    letterSpacing: 0.6,
  },
  receiptsEmpty: { color: t.color.ink4, fontFamily: tokens.font.sans, fontSize: tokens.size.xs },
  receiptsRow: { flexDirection: "row", alignItems: "center", gap: tokens.space.sm },
  receiptsOpen: { minHeight: 40, paddingHorizontal: tokens.space.sm, alignItems: "center", justifyContent: "center" },
  receiptsOpenTxt: { color: t.color.brand, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
  cancelBtn: {
    minHeight: 48,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: "rgba(220,38,38,0.35)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: tokens.space.sm,
    marginTop: tokens.space.sm,
  },
  cancelTxt: { color: t.color.red, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.sm },
  hintTxt: { color: t.color.ink4, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow, lineHeight: 15 },
  thumbRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.xs,
    minHeight: 32,
  },
  thumbCount: {
    color: t.color.ink3,
    fontFamily: tokens.font.sans,
    fontSize: tokens.size.eyebrow,
  },
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
