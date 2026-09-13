import { useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, TextInput } from "react-native";
import { useQueryClient, useIsFetching } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import { UserPlus, ChevronRight } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { GradientHeader } from "@/components/GradientHeader";
import { HeaderRight } from "@/components/HeaderRight";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonRows } from "@/components/SkeletonRows";
import { Sheet } from "@/components/Sheet";
import { PressCard } from "@/components/PressCard";
import { useSession } from "@/lib/session";
import { roleLabel } from "@/lib/claims";
import { friendlyError } from "@/lib/rpc";
import { moneyINR, moneyCompact } from "@/lib/format";
import { qk } from "@/data/keys";
import {
  useStaff, addWorker, useAttendanceToday, markAttendance,
  usePayrollRuns, usePayrollLines, type AttendanceMark,
} from "@/data/operator";
import { tokens } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeContext";

type Seg = "workers" | "attendance" | "payroll";
type MarkStatus = AttendanceMark["status"];

const SEG_LABELS: Record<Seg, string> = {
  workers: "Workers",
  attendance: "Attendance",
  payroll: "Payroll",
};

const CHIPS: { label: string; value: MarkStatus }[] = [
  { label: "P", value: "present" },
  { label: "A", value: "absent" },
  { label: "½", value: "half_day" },
  { label: "L", value: "leave" },
  { label: "W", value: "week_off" },
];

const RUN_TONE: Record<string, "neutral" | "brand" | "grn" | "amb"> = {
  draft: "neutral", computed: "amb", posted: "brand", paid: "grn",
};

export default function WorkersScreen() {
  const s = useStyles();
  const { palette: t } = useTheme();
  const { claims } = useSession();
  const qc = useQueryClient();
  const fetching = useIsFetching();
  const [seg, setSeg] = useState<Seg>("workers");

  const staff = useStaff();
  const att = useAttendanceToday();
  const runs = usePayrollRuns();

  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newAadhar, setNewAadhar] = useState("");
  const [busyAdd, setBusyAdd] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, MarkStatus>>({});
  const [payrollRunId, setPayrollRunId] = useState<string | null>(null);
  const lines = usePayrollLines(payrollRunId);

  const attByEntity = useMemo(() => {
    const m = new Map<string, { status: string; hours: number }>();
    for (const a of att.data ?? []) m.set(`${a.entityType}:${a.entityId}`, { status: a.status, hours: a.hours });
    return m;
  }, [att.data]);

  function invalidateWorkers() {
    void qc.invalidateQueries({ queryKey: qk.opStaff() });
    void qc.invalidateQueries({ queryKey: qk.opAttendanceToday() });
    void qc.invalidateQueries({ queryKey: qk.opPayrollRuns() });
  }

  async function onAddWorker() {
    if (!newName.trim()) {
      Toast.show({ type: "error", text1: "Name is required" });
      return;
    }
    if (busyAdd) return;
    setBusyAdd(true);
    try {
      await addWorker({
        fullName: newName.trim(),
        phone: newPhone.trim() ? newPhone.trim() : null,
        aadhar: newAadhar.trim() ? newAadhar.trim() : null,
      });
      Toast.show({ type: "success", text1: "Worker added" });
      setNewName("");
      setNewPhone("");
      setNewAadhar("");
      setAddOpen(false);
      void qc.invalidateQueries({ queryKey: qk.opStaff() });
    } catch (e) {
      Toast.show({ type: "error", text1: "Could not add worker", text2: friendlyError(e) });
    } finally {
      setBusyAdd(false);
    }
  }

  async function onMark(entityType: "user" | "worker", entityId: string, status: MarkStatus) {
    if (busyId) return;
    setBusyId(entityId);
    try {
      await markAttendance([{
        entityType, entityId, status,
        hours: status === "present" ? 8 : status === "half_day" ? 4 : 0,
        otHours: 0,
      }]);
      setDraft((d) => ({ ...d, [`${entityType}:${entityId}`]: status }));
      void qc.invalidateQueries({ queryKey: qk.opAttendanceToday() });
    } catch (e) {
      Toast.show({ type: "error", text1: "Could not save", text2: friendlyError(e) });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Screen refreshing={fetching > 0} onRefresh={invalidateWorkers}>
      <GradientHeader title="Workers" subtitle={roleLabel(claims)} right={<HeaderRight />} />
      <View style={s.segRow}>
        {(Object.keys(SEG_LABELS) as Seg[]).map((k) => (
          <Pressable
            key={k}
            onPress={() => setSeg(k)}
            accessibilityRole="tab"
            accessibilityState={{ selected: seg === k }}
            style={[s.segBtn, seg === k && s.segBtnOn]}
          >
            <Text style={[s.segTxt, seg === k && s.segTxtOn]}>{SEG_LABELS[k]}</Text>
          </Pressable>
        ))}
      </View>

      {seg === "workers" ? (
        <>
          <View style={s.segRow}>
            <Pressable
              onPress={() => setAddOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Add worker"
              style={({ pressed }) => [s.addBtn, pressed && { opacity: 0.85 }]}
            >
              <UserPlus size={14} color={t.color.brand} />
              <Text style={s.addBtnTxt}>+ Add worker</Text>
            </Pressable>
          </View>
          {staff.isLoading ? <View style={s.pad}><SkeletonRows rows={5} /></View>
            : staff.isError ? <EmptyState title="Could not load staff" message={friendlyError(staff.error)} />
            : (staff.data ?? []).length === 0 ? (
              <EmptyState title="No staff yet" message="Add a worker to start the roster." actionLabel="+ Add worker" onAction={() => setAddOpen(true)} />
            ) : (
              <View style={s.list}>
                {(staff.data ?? []).map((r) => (
                  <View key={`${r.kind}:${r.id}`} style={s.card}>
                    <View style={s.headLine}>
                      <View style={s.nameWrap}>
                        <View style={[s.dot, { backgroundColor: r.kind === "user" ? t.color.brand : t.color.ink4 }]} />
                        <Text style={s.name} numberOfLines={1}>{r.name}</Text>
                      </View>
                      <StatusBadge label={r.status ?? "active"} />
                    </View>
                    <Text style={s.sub}>{r.phone ?? "No phone"}</Text>
                  </View>
                ))}
              </View>
            )}
        </>
      ) : seg === "attendance" ? (
        <>
          {staff.isLoading || att.isLoading ? <View style={s.pad}><SkeletonRows rows={5} /></View>
            : staff.isError ? <EmptyState title="Could not load staff" message={friendlyError(staff.error)} />
            : att.isError ? <EmptyState title="Could not load attendance" message={friendlyError(att.error)} />
            : (staff.data ?? []).length === 0 ? (
              <EmptyState title="No staff yet" message="Add workers first, then mark their attendance here." />
            ) : (
              <>
                <View style={s.list}>
                  {(staff.data ?? []).map((r) => {
                    const key = `${r.kind}:${r.id}`;
                    const current = draft[key] ?? attByEntity.get(key)?.status;
                    return (
                      <View key={key} style={s.card}>
                        <View style={s.headLine}>
                          <View style={s.nameWrap}>
                            <View style={[s.dot, { backgroundColor: r.kind === "user" ? t.color.brand : t.color.ink4 }]} />
                            <Text style={s.name} numberOfLines={1}>{r.name}</Text>
                          </View>
                        </View>
                        <View style={s.chipRow}>
                          {CHIPS.map((c) => {
                            const on = current === c.value;
                            return (
                              <Pressable
                                key={c.value}
                                onPress={() => void onMark(r.kind, r.id, c.value)}
                                disabled={busyId !== null}
                                accessibilityRole="button"
                                accessibilityLabel={`Mark ${r.name} ${c.value}`}
                                accessibilityState={{ selected: on }}
                                style={({ pressed }) => [
                                  s.chip, on && s.chipOn,
                                  (pressed || busyId === r.id) && { opacity: 0.6 },
                                ]}
                              >
                                <Text style={[s.chipTxt, on && s.chipTxtOn]}>{c.label}</Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>
                    );
                  })}
                </View>
                <Text style={s.caption}>Only today can be marked — the office locks earlier days.</Text>
              </>
            )}
        </>
      ) : (
        runs.isLoading ? <View style={s.pad}><SkeletonRows rows={4} /></View>
          : runs.isError ? <EmptyState title="Could not load payroll" message={friendlyError(runs.error)} />
          : (runs.data ?? []).length === 0 ? <EmptyState title="No payroll runs" message="Payroll runs computed by the office appear here." />
          : (
            <View style={s.list}>
              {(runs.data ?? []).map((r) => (
                <PressCard key={r.id} onPress={() => setPayrollRunId(r.id)} style={s.payCard}>
                  <View style={s.headLine}>
                    <Text style={s.docNo}>{r.periodMonth}</Text>
                    <StatusBadge label={r.status} tone={RUN_TONE[r.status] ?? "neutral"} />
                  </View>
                  <Text style={s.sub}>{moneyCompact(r.totalGross)} total gross</Text>
                  <ChevronRight size={14} color={t.color.ink4} style={s.payChevron} />
                </PressCard>
              ))}
            </View>
          )
      )}

      {addOpen ? (
        <Sheet visible onClose={() => setAddOpen(false)} title="Add worker">
          <View style={s.sheetBody}>
            <View style={s.section}>
              <Text style={s.label}>NAME</Text>
              <TextInput
                style={s.input}
                value={newName}
                onChangeText={setNewName}
                placeholder="Full name"
                placeholderTextColor={t.color.ink4}
                accessible
                accessibilityLabel="Worker name"
              />
            </View>
            <View style={s.section}>
              <Text style={s.label}>PHONE (OPTIONAL)</Text>
              <TextInput
                style={s.input}
                value={newPhone}
                onChangeText={setNewPhone}
                placeholder="Phone number"
                placeholderTextColor={t.color.ink4}
                keyboardType="phone-pad"
                accessible
                accessibilityLabel="Worker phone"
              />
            </View>
            <View style={s.section}>
              <Text style={s.label}>AADHAR (OPTIONAL)</Text>
              <TextInput
                style={s.input}
                value={newAadhar}
                onChangeText={(v) => setNewAadhar(v.replace(/[^0-9]/g, ""))}
                placeholder="Aadhar number"
                placeholderTextColor={t.color.ink4}
                keyboardType="number-pad"
                accessible
                accessibilityLabel="Worker aadhar"
              />
            </View>
            <Pressable
              onPress={() => void onAddWorker()}
              disabled={busyAdd}
              accessibilityRole="button"
              accessibilityLabel="Submit new worker"
              style={({ pressed }) => [s.submitBtn, (pressed || busyAdd) && { opacity: 0.6 }]}
            >
              <Text style={s.submitTxt}>Add worker</Text>
            </Pressable>
          </View>
        </Sheet>
      ) : null}

      <Sheet visible={!!payrollRunId} onClose={() => setPayrollRunId(null)} title="Payroll lines">
        {payrollRunId ? (
          <View style={s.sheetBody}>
            {lines.isLoading ? <Text style={s.ledgerSub}>Loading…</Text>
              : lines.isError ? <Text style={s.ledgerSub}>{friendlyError(lines.error)}</Text>
              : (lines.data ?? []).length === 0 ? <Text style={s.ledgerSub}>No lines in this run.</Text>
              : (lines.data ?? []).map((l) => (
                <View key={l.id} style={s.payLine}>
                  <Text style={s.name} numberOfLines={1}>{l.name}</Text>
                  <Text style={s.lineAmt}>{moneyINR(l.gross)}</Text>
                  <StatusBadge label={l.paid ? "paid" : "unpaid"} tone={l.paid ? "grn" : "neutral"} />
                </View>
              ))}
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}

const useStyles = () => {
  const { palette: t } = useTheme();
  return StyleSheet.create({
    segRow: { flexDirection: "row", gap: tokens.space.sm, paddingHorizontal: tokens.space.lg, paddingTop: tokens.space.md },
    segBtn: {
      flex: 1, minHeight: 44, borderRadius: tokens.radius.md, borderWidth: 1, borderColor: t.color.line,
      backgroundColor: t.color.surface, alignItems: "center", justifyContent: "center",
    },
    segBtnOn: { backgroundColor: t.color.ink, borderColor: t.color.ink },
    segTxt: { color: t.color.ink3, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
    segTxtOn: { color: t.color.surface },
    addBtn: {
      flex: 1, minHeight: 44, borderRadius: tokens.radius.md, borderWidth: 1, borderColor: t.color.line,
      backgroundColor: t.color.surface, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4,
    },
    addBtnTxt: { fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs, color: t.color.ink },
    list: { paddingHorizontal: tokens.space.lg, paddingTop: tokens.space.md, gap: tokens.space.sm },
    pad: { padding: tokens.space.lg },
    card: {
      backgroundColor: t.color.surface, borderRadius: tokens.radius.lg, borderWidth: 1,
      borderColor: t.color.line, padding: tokens.space.md, gap: tokens.space.xs, ...tokens.shadow.card,
    },
    headLine: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    nameWrap: { flex: 1, flexDirection: "row", alignItems: "center", gap: tokens.space.sm, minWidth: 0 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    name: { flex: 1, color: t.color.ink, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
    sub: { color: t.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow },
    docNo: { color: t.color.ink, fontFamily: tokens.font.monoBold, fontSize: tokens.size.xs, fontVariant: ["tabular-nums"] },
    chipRow: { flexDirection: "row", flexWrap: "wrap", gap: tokens.space.xs },
    chip: {
      minWidth: 40, minHeight: 32, borderRadius: tokens.radius.md, borderWidth: 1, borderColor: t.color.line,
      backgroundColor: t.color.fill, alignItems: "center", justifyContent: "center", paddingHorizontal: tokens.space.sm,
    },
    chipOn: { backgroundColor: t.color.ink, borderColor: t.color.ink },
    chipTxt: { color: t.color.ink3, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
    chipTxtOn: { color: t.color.surface },
    caption: {
      color: t.color.ink4, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow,
      paddingHorizontal: tokens.space.lg, paddingTop: tokens.space.sm,
    },
    payCard: { padding: tokens.space.md, gap: tokens.space.xs },
    payChevron: { position: "absolute", right: tokens.space.md, bottom: tokens.space.md },
    payLine: { flexDirection: "row", alignItems: "center", gap: tokens.space.sm, minHeight: 40 },
    lineAmt: {
      color: t.color.ink, fontFamily: tokens.font.mono, fontSize: tokens.size.eyebrow,
      fontVariant: ["tabular-nums"], minWidth: 84, textAlign: "right",
    },
    ledgerSub: { color: t.color.ink4, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow },
    sheetBody: { gap: tokens.space.lg, paddingBottom: tokens.space.md },
    section: { gap: tokens.space.xs },
    label: { color: t.color.ink3, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.eyebrow, letterSpacing: 0.6 },
    input: {
      minHeight: 48, borderWidth: 1, borderColor: t.color.line, borderRadius: tokens.radius.md,
      backgroundColor: t.color.surface, paddingHorizontal: tokens.space.md,
      color: t.color.ink, fontFamily: tokens.font.sans, fontSize: tokens.size.sm,
    },
    submitBtn: {
      minHeight: 48, borderRadius: tokens.radius.md, backgroundColor: t.color.brand,
      alignItems: "center", justifyContent: "center",
    },
    submitTxt: { color: "#ffffff", fontFamily: tokens.font.sansSemi, fontSize: tokens.size.sm },
  });
};
