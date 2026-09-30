import { useEffect, useMemo, useRef, useState } from "react";
import { AppState, View, Text, Pressable, StyleSheet, TextInput, Image } from "react-native";
import { useQueryClient, useIsFetching } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import { UserPlus, CalendarDays, Clock, Banknote, HandCoins, ReceiptText } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { GradientHeader } from "@/components/GradientHeader";
import { HeaderRight } from "@/components/HeaderRight";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonRows } from "@/components/SkeletonRows";
import { Sheet } from "@/components/Sheet";
import { DropdownSelect } from "@/components/DropdownSelect";
import { MonthSheet } from "@/components/MonthSheet";
import { WorkerSheet, balancePillText } from "@/features/workers/WorkerSheet";
import { useSession } from "@/lib/session";
import { roleLabel } from "@/lib/claims";
import { friendlyError } from "@/lib/rpc";
import { moneyINR, dateIST, todayIST } from "@/lib/format";
import { qk } from "@/data/keys";
import {
  useStaff, addWorker,
} from "@/data/operator";
import {
  useShiftTemplates, usePayMappings, usePayrollPeople, useUserDailyRates,
  useAttendanceForDate, useCalendarDays, saveAttendanceDay,
  useWorkerBalances, useMonthAbsencesBefore, usePayrollLog,
  type PayrollPerson, type PayrollLogRow,
} from "@/data/payroll";
import { payForHours, previewUserDay } from "@/lib/opBuilders";
import { tokens } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeContext";

type Seg = "workers" | "attendance" | "payroll";

const SEG_LABELS: Record<Seg, string> = {
  workers: "Workers",
  attendance: "Attendance",
  payroll: "Payroll",
};

/** New hours model (0127): two statuses only — the RPC rejects the rest. */
const OFF_LABEL: Record<string, string> = { absent: "Absent" };

interface LogDayGroup {
  day: string;
  rows: PayrollLogRow[];
  credited: number;
  paid: number;
}

const LOG_TYPE_TONE: Record<string, "brand" | "grn" | "amb"> = {
  attendance_pay: "brand",
  payment: "grn",
  advance: "amb",
};
const LOG_TYPE_LABEL: Record<string, string> = {
  attendance_pay: "Credited",
  payment: "Payment",
  advance: "Advance",
};

function groupLogByDay(rows: PayrollLogRow[]): LogDayGroup[] {
  const groups = new Map<string, LogDayGroup>();
  for (const r of rows) {
    let g = groups.get(r.dateISO);
    if (!g) {
      g = { day: r.dateISO, rows: [], credited: 0, paid: 0 };
      groups.set(r.dateISO, g);
    }
    g.rows.push(r);
    if (r.type === "attendance_pay") g.credited += r.amount;
    else g.paid += Math.abs(r.amount);
  }
  return [...groups.values()];
}

interface RowDraft {
  status: string;
  hours: number;
  note: string;
  /** true = collapsed row; false = note editor expanded */
  simple: boolean;
}

/** Every row starts ABSENT — the operator marks only who showed up. */
const ROW_ABSENT: RowDraft = { status: "absent", hours: 0, note: "", simple: true };

function isWorked(status: string): boolean {
  return status === "present";
}

function ymOf(iso: string) {
  return { year: Number(iso.slice(0, 4)), month0: Number(iso.slice(5, 7)) - 1 };
}

export default function WorkersScreen() {
  const s = useStyles();
  const { palette: t } = useTheme();
  const { claims } = useSession();
  const qc = useQueryClient();
  const fetching = useIsFetching();
  const [seg, setSeg] = useState<Seg>("workers");

  const staff = useStaff();
  // Payroll segment: the whole ledger log (credits + payments + advances),
  // grouped by date — fetched only while that segment is visible.
  const log = usePayrollLog(seg === "payroll");
  const logGroups = useMemo(() => groupLogByDay(log.data ?? []), [log.data]);

  // ---- Attendance day state ----
  const [sel, setSel] = useState(todayIST);
  const isToday = sel === todayIST();
  const ro = !isToday;
  const [shift, setShift] = useState<string | null>(null);
  /** Marking unlocks only after the warehouse shift timings are picked. */
  const needShift = !ro && !shift;
  const [ym, setYm] = useState(() => ymOf(sel));
  const [monthOpen, setMonthOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, RowDraft>>({});
  const [busySave, setBusySave] = useState(false);

  const rosterQ = usePayrollPeople();
  const shiftsQ = useShiftTemplates();
  const mapsQ = usePayMappings();
  const ratesQ = useUserDailyRates();
  const dayQ = useAttendanceForDate(sel);
  const absQ = useMonthAbsencesBefore(sel);
  const dotsQ = useCalendarDays(ym.year, ym.month0);

  const shiftOptions = useMemo(
    () => (shiftsQ.data ?? []).map((tpl) => ({
      value: tpl.name,
      label: `${tpl.name} (${tpl.startTime}–${tpl.endTime}, ${tpl.totalHours}h)`,
    })),
    [shiftsQ.data],
  );

  // Sync with saved rows: full rebuild when the DATE changes, then a MERGE on
  // every refetch (the day query polls every 30s) — so marks saved on another
  // device appear here live. Dirty-row protection: a merge never overwrites a
  // row the operator is editing locally (status flipped, hours changed, or
  // note typed) — only their own Save writes those.
  const resetSelRef = useRef<string | null>(null);
  useEffect(() => {
    if (!rosterQ.data || dayQ.data === undefined) return;
    const isReset = resetSelRef.current !== sel;
    const saved = new Map(dayQ.data.map((r) => [`${r.entityType}:${r.entityId}`, r]));
    const tpl = (shiftsQ.data ?? []).find((x) => x.name === shift);
    const base = tpl ? tpl.totalHours : 8;
    setDraft((d) => {
      const hasPrev = !isReset && Object.keys(d).length > 0;
      const next: Record<string, RowDraft> = {};
      for (const p of rosterQ.data) {
        const key = `${p.entityType}:${p.entityId}`;
        const sv = saved.get(key);
        // legacy half_day/leave/week_off/holiday rows load as absent — the new
        // model writes present|absent only
        const isPresent = sv?.status === "present";
        const incoming: RowDraft = sv
          ? {
              status: isPresent ? "present" : "absent",
              simple: true,
              hours: isPresent ? sv.hours || base : 0,
              note: "",
            }
          : { ...ROW_ABSENT };
        const cur = hasPrev ? d[key] : undefined;
        if (cur) {
          // dirty-row protection: keep the local edit
          if (cur.status !== incoming.status) { next[key] = cur; continue; }
          if (cur.status === "present" && cur.hours !== incoming.hours) { next[key] = cur; continue; }
          if (cur.note && cur.note !== incoming.note) { next[key] = cur; continue; }
        }
        next[key] = incoming;
      }
      return next;
    });
    resetSelRef.current = sel;
  }, [sel, rosterQ.data, dayQ.data, shiftsQ.data, shift]);

  // Refetch on app foreground — attendance and payroll log can change while
  // the app is backgrounded (another device saving the same day).
  useEffect(() => {
    const sub = AppState.addEventListener("change", (st) => {
      if (st !== "active") return;
      void qc.invalidateQueries({ queryKey: qk.attendanceDay(sel) });
      void qc.invalidateQueries({ queryKey: qk.payrollLog() });
      void qc.invalidateQueries({ queryKey: qk.workerBalances() });
      void qc.invalidateQueries({ queryKey: qk.opAttendanceToday() });
    });
    return () => sub.remove();
  }, [qc, sel]);

  // Latest saved-row timestamp for the day — the "recorded at" stamp.
  const recordedAtLabel = useMemo(() => {
    const times = (dayQ.data ?? []).map((r) => r.recordedAt).filter(Boolean) as string[];
    if (times.length === 0) return null;
    const latest = times.reduce((a, b) => (a > b ? a : b));
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(latest));
  }, [dayQ.data]);

  function drOf(key: string): RowDraft {
    return draft[key] ?? ROW_ABSENT;
  }

  function patch(key: string, p: Partial<RowDraft>) {
    setDraft((d) => ({ ...d, [key]: { ...(d[key] ?? ROW_ABSENT), ...p } }));
  }

  /** Live ₹ preview, lane-aware: daily workers follow the hours→band table
   * (present rows only); users get the day rate — salary ÷ days-in-month —
   * on present AND on absences within their paid-leave allowance, + OT.
   * Absences beyond the allowance (and 0-amount rows) hide the pill. */
  function pillFor(p: PayrollPerson, dr: RowDraft): number | null {
    const r = ratesQ.data?.[p.entityId] ?? null;
    const dim = new Date(Number(sel.slice(0, 4)), Number(sel.slice(5, 7)), 0).getDate();
    const v =
      p.entityType === "worker"
        ? isWorked(dr.status)
          ? payForHours(mapsQ.data ?? [], dr.hours)
          : 0
        : previewUserDay(
            {
              monthlySalary: r?.monthlySalary ?? null,
              dailyRate: r?.dailyRate ?? null,
              otRate: r?.otRate ?? null,
              payType: r?.payType ?? null,
              paidLeaves: r?.paidLeaves ?? null,
            },
            dr.status,
            absQ.data?.[p.entityId] ?? 0,
            dim,
            0,
          );
    return v > 0 ? v : null;
  }

  function onShiftPick(name: string) {
    setShift(name);
    const tpl = shiftsQ.data?.find((x) => x.name === name);
    if (!tpl) return;
    setDraft((d) => {
      const next = { ...d };
      for (const k of Object.keys(next)) {
        // present rows default to the slot's hours (still manually editable)
        if (next[k].status === "present") next[k] = { ...next[k], hours: tpl.totalHours };
      }
      return next;
    });
  }

  /** Row toggle = the present/absent switch (the default, one-tap action). */
  function onToggle(key: string) {
    setDraft((d) => {
      const cur = d[key] ?? ROW_ABSENT;
      if (isWorked(cur.status)) {
        return { ...d, [key]: { ...cur, status: "absent", hours: 0, simple: true } };
      }
      return { ...d, [key]: { ...cur, status: "present", hours: shiftHours(), simple: true } };
    });
  }

  function initials(name: string): string {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("");
  }

  function shiftHours(): number {
    const tpl = shiftsQ.data?.find((x) => x.name === shift);
    return tpl ? tpl.totalHours : 8;
  }

  let presentN = 0;
  let absentN = 0;
  let markedN = 0;
  let dayTotal = 0;
  for (const p of rosterQ.data ?? []) {
    const dr = drOf(`${p.entityType}:${p.entityId}`);
    if (dr.status === "absent") { absentN++; continue; }
    markedN++;
    presentN++;
    dayTotal += pillFor(p, dr) ?? 0;
  }
  // Saving with 0 marked rows is still meaningful — it clears previously
  // saved marks (the RPC replaces per-entity), so allow it whenever the day
  // already has saved rows. shift is enforced by the roster gate, but the
  // RPC stores it per row, so never save without it.
  const canSave = isToday && shift != null && !busySave && (markedN > 0 || (dayQ.data?.length ?? 0) > 0);

  async function onSaveDay() {
    if (!isToday || busySave) return;
    // FULL roster — absent rows included — so the RPC can count absences
    // against each monthly user's paid-leave allowance (0127).
    const rows = (rosterQ.data ?? []).map((p) => {
      const dr = drOf(`${p.entityType}:${p.entityId}`);
      return {
        entityType: p.entityType,
        entityId: p.entityId,
        status: dr.status,
        hours: dr.hours,
        otHours: 0,
        note: dr.note.trim() ? dr.note.trim() : null,
      };
    });
    if (rows.every((r) => r.status === "absent") && (dayQ.data?.length ?? 0) === 0) {
      Toast.show({ type: "error", text1: "Nothing to save", text2: "Mark at least one person present." });
      return;
    }
    setBusySave(true);
    try {
      const res = await saveAttendanceDay({ dateISO: sel, shiftName: shift, rows });
      Toast.show({ type: "success", text1: `Day saved — ${moneyINR(res.creditedTotal)} credited` });
      void qc.invalidateQueries({ queryKey: qk.attendanceDay(sel) });
      void qc.invalidateQueries({ queryKey: qk.opAttendanceToday() });
      void qc.invalidateQueries({ queryKey: qk.monthAbsences(sel) });
    } catch (e) {
      Toast.show({ type: "error", text1: "Could not save day", text2: friendlyError(e) });
    } finally {
      setBusySave(false);
    }
  }

  // ---- Add worker ----
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newAadhar, setNewAadhar] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [busyAdd, setBusyAdd] = useState(false);

  // Signed ledger balances per entity id (positive = WH owes them). Enabled
  // only on the Workers segment — cached for instant return visits.
  const balancesQ = useWorkerBalances(seg === "workers");
  const [selected, setSelected] = useState<{
    entityType: "user" | "worker"; entityId: string; entityName: string;
  } | null>(null);

  function invalidateWorkers() {
    void qc.invalidateQueries({ queryKey: qk.opStaff() });
    void qc.invalidateQueries({ queryKey: qk.opAttendanceToday() });
    void qc.invalidateQueries({ queryKey: qk.payrollPeople() });
    void qc.invalidateQueries({ queryKey: qk.attendanceDay(sel) });
    void qc.invalidateQueries({ queryKey: qk.workerBalances() });
    void qc.invalidateQueries({ queryKey: qk.payrollLog() });
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
        address: newAddress.trim() ? newAddress.trim() : null,
      });
      Toast.show({ type: "success", text1: "Worker added" });
      setNewName("");
      setNewPhone("");
      setNewAadhar("");
      setNewAddress("");
      setAddOpen(false);
      void qc.invalidateQueries({ queryKey: qk.opStaff() });
      void qc.invalidateQueries({ queryKey: qk.payrollPeople() });
      void qc.invalidateQueries({ queryKey: qk.workerBalances() });
    } catch (e) {
      Toast.show({ type: "error", text1: "Could not add worker", text2: friendlyError(e) });
    } finally {
      setBusyAdd(false);
    }
  }

  return (
    <Screen refreshing={fetching > 0} onRefresh={invalidateWorkers}>
      <GradientHeader title="Workers" subtitle={roleLabel(claims)} right={<HeaderRight />} />
      <View style={s.body}>
      <View style={s.segWrap}>
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
          <View style={s.quickRow}>
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
          <Text style={s.legend}>Red: warehouse owes them · Green: they owe the warehouse</Text>
          {staff.isLoading ? <SkeletonRows rows={5} />
            : staff.isError ? <EmptyState title="Could not load staff" message={friendlyError(staff.error)} />
            : (staff.data ?? []).length === 0 ? (
              <EmptyState title="No staff yet" message="Add a worker to start the roster." actionLabel="+ Add worker" onAction={() => setAddOpen(true)} />
            ) : (
              <View style={s.list}>
                {(staff.data ?? []).map((r) => {
                  const bal = balancesQ.data?.[r.id];
                  return (
                    <Pressable
                      key={`${r.kind}:${r.id}`}
                      onPress={() => setSelected({ entityType: r.kind, entityId: r.id, entityName: r.name })}
                      accessibilityRole="button"
                      accessibilityLabel={`Open ${r.name} details`}
                      style={({ pressed }) => [s.card, pressed && { opacity: 0.9 }]}
                    >
                      <View style={s.headLine}>
                        <View style={s.nameWrap}>
                          <View style={[s.dot, { backgroundColor: r.kind === "user" ? t.color.brand : t.color.ink4 }]} />
                          <Text style={s.name} numberOfLines={1}>{r.name}</Text>
                        </View>
                        <StatusBadge label={r.status ?? "active"} />
                      </View>
                      <View style={s.subLine}>
                        <Text style={[s.sub, s.subFlex]} numberOfLines={1}>{r.phone ?? "No phone"}</Text>
                        {bal === undefined ? (
                          <Text style={[s.balPill, s.balMuted]} accessibilityLabel="Loading balance">…</Text>
                        ) : (
                          <Text
                            style={[
                              s.balPill,
                              bal > 0 ? s.balRed : bal < 0 ? s.balGrn : s.balMuted,
                            ]}
                          >
                            {balancePillText(bal)}
                          </Text>
                        )}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}
        </>
      ) : seg === "attendance" ? (
        <>
          <View style={s.attControls}>
            <Pressable
              onPress={() => {
                setYm(ymOf(sel));
                setMonthOpen(true);
              }}
              accessibilityRole="button"
              accessibilityLabel="Pick attendance date"
              style={({ pressed }) => [s.dateBtn, pressed && { opacity: 0.85 }]}
            >
              <CalendarDays size={14} color={t.color.brand} />
              <Text style={s.dateBtnTxt}>{dateIST(sel)}{isToday ? " · Today" : ""}</Text>
            </Pressable>
            <View pointerEvents={ro ? "none" : "auto"}>
              <DropdownSelect
                value={shift}
                options={shiftOptions}
                onChange={onShiftPick}
                placeholder={ro ? "Shift (view only)" : "Select shift timings"}
                label="Shift"
              />
            </View>
            {ro ? (
              <Text style={s.infoStrip}>View only — attendance can be changed on the day itself (or by the office).</Text>
            ) : recordedAtLabel ? (
              <Text style={s.syncStrip}>Recorded {recordedAtLabel} · syncs automatically</Text>
            ) : null}
            {(shiftsQ.isError || mapsQ.isError || ratesQ.isError) ? (
              <View style={s.cfgErr}>
                <Text style={s.cfgErrTxt} numberOfLines={2}>
                  Pay settings failed to load — amounts may show ₹0. {friendlyError((shiftsQ.error ?? mapsQ.error ?? ratesQ.error) as Error)}
                </Text>
                <Pressable
                  onPress={() => { void shiftsQ.refetch(); void mapsQ.refetch(); void ratesQ.refetch(); }}
                  accessibilityRole="button"
                  accessibilityLabel="Retry loading pay settings"
                  style={({ pressed }) => [s.cfgRetry, pressed && { opacity: 0.8 }]}
                >
                  <Text style={s.cfgRetryTxt}>Retry</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
          {rosterQ.isLoading || dayQ.isLoading ? <SkeletonRows rows={5} />
            : rosterQ.isError ? <EmptyState title="Could not load roster" message={friendlyError(rosterQ.error)} />
            : dayQ.isError ? <EmptyState title="Could not load attendance" message={friendlyError(dayQ.error)} />
            : needShift ? (
              <EmptyState
                icon={Clock}
                title="Select shift timings"
                message="Pick the warehouse shift above to unlock attendance marking."
              />
            ) : (rosterQ.data ?? []).length === 0 ? (
              <EmptyState title="No staff yet" message="Add workers first, then mark their attendance here." />
            ) : (
              <>
                <View style={s.list}>
                  {(rosterQ.data ?? []).map((p) => {
                    const key = `${p.entityType}:${p.entityId}`;
                    const dr = drOf(key);
                    const pill = pillFor(p, dr);
                    return (
                      <View key={key} style={[s.card, dr.status === "absent" && s.attCardOff]}>
                        <Pressable
                          onPress={() => onToggle(key)}
                          disabled={ro}
                          accessibilityRole="switch"
                          accessibilityLabel={`Toggle ${p.fullName} present`}
                          accessibilityState={{ checked: dr.status !== "absent" }}
                          style={({ pressed }) => [s.attRowTop, pressed && { opacity: 0.9 }]}
                        >
                          {p.photoUrl ? (
                            <Image source={{ uri: p.photoUrl }} style={s.avatar} accessibilityLabel={`${p.fullName} photo`} />
                          ) : (
                            <View style={[s.avatar, s.avatarFallback]}>
                              <Text style={s.avatarTxt}>{initials(p.fullName)}</Text>
                            </View>
                          )}
                          <View style={s.nameCol}>
                            <Text style={s.name} numberOfLines={1}>{p.fullName}</Text>
                            <Text style={s.sub}>{p.entityType === "worker" ? "Worker · daily" : "Staff · monthly"}</Text>
                          </View>
                          {pill !== null ? (
                            <Text style={s.amt}>{moneyINR(pill)}</Text>
                          ) : null}
                          <Text style={[s.markTag, isWorked(dr.status) && s.markTagOn]}>
                            {isWorked(dr.status) ? "Present" : OFF_LABEL[dr.status] ?? "Absent"}
                          </Text>
                        </Pressable>
                        {!dr.simple ? (
                          <View style={s.advBlock}>
                            <TextInput
                              style={[s.noteInput, ro && { opacity: 0.6 }]}
                              value={dr.note}
                              onChangeText={(v) => patch(key, { note: v })}
                              editable={!ro}
                              placeholder="Note (optional)"
                              placeholderTextColor={t.color.ink4}
                              accessible
                              accessibilityLabel={`${p.fullName} note`}
                            />
                            <Pressable
                              onPress={() => patch(key, { simple: true })}
                              disabled={ro}
                              accessibilityRole="button"
                              accessibilityLabel={`Hide note for ${p.fullName}`}
                              style={({ pressed }) => [s.advToggle, (ro || pressed) && { opacity: 0.7 }]}
                            >
                              <Text style={s.advTxt}>Hide note</Text>
                            </Pressable>
                          </View>
                        ) : (
                          <Pressable
                            onPress={() => patch(key, { simple: false })}
                            disabled={ro}
                            accessibilityRole="button"
                            accessibilityLabel={`Add a note for ${p.fullName}`}
                            style={({ pressed }) => [s.advToggle, (ro || pressed) && { opacity: 0.7 }]}
                          >
                            <Text style={[s.advTxt, !dr.note && { color: t.color.ink4 }]}>Note</Text>
                          </Pressable>
                        )}
                      </View>
                    );
                  })}
                </View>
                <View style={s.footer}>
                  <View style={s.footSummary}>
                    <Text style={s.footLabel}>Present</Text>
                    <Text style={s.footVal}>{presentN}</Text>
                    <Text style={s.footSep}>·</Text>
                    <Text style={s.footLabel}>Absent</Text>
                    <Text style={s.footVal}>{absentN}</Text>
                    <Text style={s.footSep}>·</Text>
                    <Text style={s.footLabel}>Total</Text>
                    <Text style={s.footAmt}>{moneyINR(dayTotal)}</Text>
                  </View>
                  <Pressable
                    onPress={() => void onSaveDay()}
                    disabled={!canSave}
                    accessibilityRole="button"
                    accessibilityLabel="Save attendance day"
                    style={({ pressed }) => [
                      s.saveBtn,
                      (!canSave || pressed) && { opacity: 0.5 },
                    ]}
                  >
                    <Text style={s.saveTxt}>{busySave ? "Saving…" : "Save day"}</Text>
                  </Pressable>
                </View>
              </>
            )}
        </>
      ) : (
        // Payroll segment: the ledger log grouped by date — every attendance
        // credit, payment and advance, newest first, with per-day totals.
        log.isLoading ? <SkeletonRows rows={5} />
          : log.isError ? <EmptyState title="Could not load payroll log" message={friendlyError(log.error)} />
          : logGroups.length === 0 ? <EmptyState icon={Banknote} title="No payroll activity yet" message="Attendance credits and payments appear here as they happen, grouped by day." />
          : (
            <View style={s.list}>
              {logGroups.map((g) => (
                <View key={g.day} style={s.logGroup}>
                  <View style={s.logDayRow}>
                    <Text style={s.logDay}>{dateIST(g.day)}</Text>
                    {g.credited > 0 ? <Text style={s.logDayCredited}>+{moneyINR(g.credited)} credited</Text> : null}
                    {g.paid > 0 ? <Text style={s.logDayPaid}>−{moneyINR(g.paid)} paid</Text> : null}
                  </View>
                  <View style={s.dayCard}>
                    {g.rows.map((r) => (
                      <View key={r.id} style={s.logRow}>
                        <View style={[s.logIcon, { backgroundColor:
                          r.type === "attendance_pay" ? t.color.brandWash
                          : r.type === "payment" ? t.color.grnWash
                          : t.color.ambWash }]}
                        >
                          {r.type === "attendance_pay" ? (
                            <Banknote size={13} color={t.color.brand} />
                          ) : r.type === "payment" ? (
                            <HandCoins size={13} color={t.color.grn} />
                          ) : (
                            <ReceiptText size={13} color={t.color.amb} />
                          )}
                        </View>
                        <View style={s.logMain}>
                          <View style={s.logTopRow}>
                            <Text style={s.logName} numberOfLines={1}>{r.entityName}</Text>
                            <StatusBadge label={LOG_TYPE_LABEL[r.type] ?? r.type} tone={LOG_TYPE_TONE[r.type] ?? "brand"} />
                          </View>
                          {r.note ? <Text style={s.logNote} numberOfLines={1}>"{r.note}"</Text> : null}
                        </View>
                        <Text style={[s.logAmt, { color:
                          r.type === "attendance_pay" ? t.color.brand
                          : r.type === "payment" ? t.color.grn
                          : t.color.amb }]}
                        >
                          {r.amount < 0 ? "−" : "+"}{moneyINR(Math.abs(r.amount))}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          )
      )}
      </View>

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
            <View style={s.section}>
              <Text style={s.label}>ADDRESS (OPTIONAL)</Text>
              <TextInput
                style={s.input}
                value={newAddress}
                onChangeText={setNewAddress}
                placeholder="Worker address"
                placeholderTextColor={t.color.ink4}
                accessible
                accessibilityLabel="Worker address"
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

      <MonthSheet
        visible={monthOpen}
        year={ym.year}
        month0={ym.month0}
        selected={sel}
        dots={dotsQ.data ?? {}}
        onPick={(iso) => setSel(iso)}
        onClose={() => setMonthOpen(false)}
        onMonth={(y, m) => setYm({ year: y, month0: m })}
      />

      <WorkerSheet
        visible={selected != null}
        onClose={() => setSelected(null)}
        entityType={selected?.entityType ?? null}
        entityId={selected?.entityId ?? null}
        entityName={selected?.entityName}
      />
    </Screen>
  );
}

const useStyles = () => {
  const { palette: t } = useTheme();
  return StyleSheet.create({
    body: { paddingHorizontal: tokens.space.lg, paddingTop: tokens.space.lg, gap: tokens.space.md },
    quickRow: { flexDirection: "row", gap: tokens.space.sm },
    segWrap: {
      flexDirection: "row", backgroundColor: t.color.fill, borderRadius: tokens.radius.md,
      borderWidth: 1, borderColor: t.color.line, padding: 3, gap: 3,
    },
    segBtn: {
      flex: 1, minHeight: 40, borderRadius: tokens.radius.sm,
      alignItems: "center", justifyContent: "center", paddingHorizontal: 4,
    },
    segBtnOn: { backgroundColor: t.color.surface, ...t.shadow.card },
    segTxt: { color: t.color.ink3, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
    segTxtOn: { color: t.color.brand },
    addBtn: {
      flex: 1, minHeight: 44, borderRadius: tokens.radius.md, borderWidth: 1, borderColor: t.color.line,
      backgroundColor: t.color.surface, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4,
    },
    addBtnTxt: { fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs, color: t.color.ink },
    dateBtn: {
      minHeight: 44, borderRadius: tokens.radius.md, borderWidth: 1, borderColor: t.color.line,
      backgroundColor: t.color.surface, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    },
    dateBtnTxt: { fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs, color: t.color.ink },
    attControls: { gap: tokens.space.sm },
    infoStrip: {
      color: t.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow,
      backgroundColor: t.color.fill, borderWidth: 1, borderColor: t.color.line,
      borderRadius: tokens.radius.md, paddingHorizontal: tokens.space.md,
      paddingVertical: tokens.space.sm, textAlign: "center",
    },
    syncStrip: {
      color: t.color.grn, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow,
      backgroundColor: t.color.grnWash, borderWidth: 1, borderColor: t.color.grn,
      borderRadius: tokens.radius.md, paddingHorizontal: tokens.space.md,
      paddingVertical: tokens.space.sm, textAlign: "center",
    },
    cfgErr: {
      flexDirection: "row", alignItems: "center", gap: tokens.space.sm,
      backgroundColor: t.color.redWash, borderWidth: 1, borderColor: t.color.red,
      borderRadius: tokens.radius.md, paddingHorizontal: tokens.space.md,
      paddingVertical: tokens.space.sm,
    },
    cfgErrTxt: { flex: 1, color: t.color.red, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow },
    cfgRetry: {
      minHeight: 32, paddingHorizontal: tokens.space.md, borderRadius: tokens.radius.md,
      backgroundColor: t.color.red, alignItems: "center", justifyContent: "center",
    },
    cfgRetryTxt: { color: "#ffffff", fontFamily: tokens.font.sansSemi, fontSize: tokens.size.eyebrow },
    list: { gap: tokens.space.sm },
    card: {
      backgroundColor: t.color.surface, borderRadius: tokens.radius.lg, borderWidth: 1,
      borderColor: t.color.line, padding: tokens.space.md, gap: tokens.space.xs, ...tokens.shadow.card,
    },
    headLine: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    nameWrap: { flex: 1, flexDirection: "row", alignItems: "center", gap: tokens.space.sm, minWidth: 0 },
    dot: { width: 8, height: 8, borderRadius: tokens.radius.full },
    name: { flex: 1, color: t.color.ink, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
    sub: { color: t.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow },
    subFlex: { flex: 1 },
    subLine: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: tokens.space.sm },
    legend: {
      color: t.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow,
      textAlign: "center",
    },
    balPill: {
      fontFamily: tokens.font.mono, fontSize: tokens.size.eyebrow,
      fontVariant: ["tabular-nums"], paddingHorizontal: tokens.space.sm,
      paddingVertical: 3, borderRadius: tokens.radius.full,
      overflow: "hidden",
    },
    balRed: { color: t.color.red, backgroundColor: t.color.redWash },
    balGrn: { color: t.color.grn, backgroundColor: t.color.grnWash },
    balMuted: { color: t.color.ink3, backgroundColor: t.color.fill },
    docNo: { color: t.color.ink, fontFamily: tokens.font.monoBold, fontSize: tokens.size.xs, fontVariant: ["tabular-nums"] },
    logGroup: { gap: tokens.space.xs },
    logDayRow: { flexDirection: "row", alignItems: "baseline", gap: tokens.space.sm, paddingHorizontal: tokens.space.xs },
    logDay: { color: t.color.ink4, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.eyebrow, letterSpacing: 0.6, textTransform: "uppercase" },
    logDayCredited: { color: t.color.brand, fontFamily: tokens.font.mono, fontSize: tokens.size.eyebrow, fontVariant: ["tabular-nums"] },
    logDayPaid: { color: t.color.grn, fontFamily: tokens.font.mono, fontSize: tokens.size.eyebrow, fontVariant: ["tabular-nums"] },
    logRow: { flexDirection: "row", alignItems: "center", gap: tokens.space.md, minHeight: 52, paddingHorizontal: tokens.space.md, paddingVertical: tokens.space.xs },
    logIcon: { width: 28, height: 28, borderRadius: tokens.radius.sm, alignItems: "center", justifyContent: "center" },
    logMain: { flex: 1, minWidth: 0, gap: 2 },
    logTopRow: { flexDirection: "row", alignItems: "center", gap: tokens.space.xs },
    logName: { flexShrink: 1, color: t.color.ink, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
    logNote: { color: t.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow, fontStyle: "italic" },
    logAmt: { fontFamily: tokens.font.monoBold, fontSize: tokens.size.xs, fontVariant: ["tabular-nums"] },
    dayCard: {
      backgroundColor: t.color.surface, borderRadius: tokens.radius.lg, borderWidth: 1,
      borderColor: t.color.line, ...tokens.shadow.card,
    },
    attCardOff: { opacity: 0.55 },
    attRowTop: { flexDirection: "row", alignItems: "center", gap: tokens.space.sm },
    avatar: { width: 36, height: 36, borderRadius: tokens.radius.full, backgroundColor: t.color.fill },
    avatarFallback: { alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: t.color.line },
    avatarTxt: { color: t.color.ink3, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
    nameCol: { flex: 1, minWidth: 0, gap: 2 },
    amt: { color: t.color.ink, fontFamily: tokens.font.mono, fontSize: tokens.size.sm, fontVariant: ["tabular-nums"] },
    markTag: {
      minWidth: 76, paddingHorizontal: tokens.space.md, paddingVertical: 6,
      borderRadius: tokens.radius.md, borderWidth: 1, borderColor: t.color.line,
      backgroundColor: t.color.surface, textAlign: "center",
      color: t.color.ink3, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.eyebrow,
    },
    markTagOn: { backgroundColor: t.color.grnWash, borderColor: t.color.grn, color: t.color.grn },
    advToggle: { alignItems: "flex-start", paddingVertical: tokens.space.xs },
    advTxt: { color: t.color.brand, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.eyebrow },
    advBlock: {
      gap: tokens.space.sm, marginTop: tokens.space.sm,
      borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.color.line, paddingTop: tokens.space.sm,
    },
    noteInput: {
      minHeight: 40, borderWidth: 1, borderColor: t.color.line, borderRadius: tokens.radius.md,
      backgroundColor: t.color.surface, paddingHorizontal: tokens.space.md,
      color: t.color.ink, fontFamily: tokens.font.sans, fontSize: tokens.size.sm,
    },
    footer: { gap: tokens.space.sm },
    footSummary: {
      flexDirection: "row", alignItems: "center", justifyContent: "center",
      flexWrap: "wrap", gap: tokens.space.xs, paddingVertical: tokens.space.sm,
    },
    footLabel: { color: t.color.ink4, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow },
    footVal: { color: t.color.ink, fontFamily: tokens.font.mono, fontSize: tokens.size.eyebrow, fontVariant: ["tabular-nums"] },
    footSep: { color: t.color.ink4, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow },
    footAmt: { color: t.color.grn, fontFamily: tokens.font.monoBold, fontSize: tokens.size.sm, fontVariant: ["tabular-nums"] },
    saveBtn: {
      minHeight: 48, borderRadius: tokens.radius.md, backgroundColor: t.color.brand,
      alignItems: "center", justifyContent: "center",
    },
    saveTxt: { color: "#ffffff", fontFamily: tokens.font.sansSemi, fontSize: tokens.size.sm },
    payCard: { padding: tokens.space.md, gap: tokens.space.xs },
    payChevron: { position: "absolute", right: tokens.space.md, bottom: tokens.space.md },
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
