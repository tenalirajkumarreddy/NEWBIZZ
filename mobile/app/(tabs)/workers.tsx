import { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, TextInput } from "react-native";
import { useQueryClient, useIsFetching } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import { UserPlus, ChevronRight, CalendarDays } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { GradientHeader } from "@/components/GradientHeader";
import { HeaderRight } from "@/components/HeaderRight";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonRows } from "@/components/SkeletonRows";
import { Sheet } from "@/components/Sheet";
import { PressCard } from "@/components/PressCard";
import { DropdownSelect } from "@/components/DropdownSelect";
import { MonthSheet } from "@/components/MonthSheet";
import { WorkerSheet, balancePillText } from "@/features/workers/WorkerSheet";
import { useSession } from "@/lib/session";
import { roleLabel } from "@/lib/claims";
import { friendlyError } from "@/lib/rpc";
import { moneyINR, moneyCompact, dateIST, todayIST } from "@/lib/format";
import { qk } from "@/data/keys";
import {
  useStaff, addWorker,
  usePayrollRuns, usePayrollLines,
} from "@/data/operator";
import {
  useShiftTemplates, usePayMappings, usePayrollPeople, useUserDailyRates,
  useAttendanceForDate, useCalendarDays, saveAttendanceDay,
  useWorkerBalances,
  type PayrollPerson,
} from "@/data/payroll";
import { payForHours, previewDailyWage } from "@/lib/opBuilders";
import { tokens } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeContext";

type Seg = "workers" | "attendance" | "payroll";

const SEG_LABELS: Record<Seg, string> = {
  workers: "Workers",
  attendance: "Attendance",
  payroll: "Payroll",
};

const ATT_CHIPS: { label: string; value: string }[] = [
  { label: "P", value: "present" },
  { label: "A", value: "absent" },
  { label: "½", value: "half_day" },
  { label: "L", value: "leave" },
  { label: "H", value: "holiday" },
  { label: "W", value: "week_off" },
];

/** ₹ pill hidden for these statuses (paid-leave needs month context server-side). */
const NO_PAY = new Set(["leave", "holiday", "week_off"]);

const RUN_TONE: Record<string, "neutral" | "brand" | "grn" | "amb"> = {
  draft: "neutral", computed: "amb", posted: "brand", paid: "grn",
};

interface RowDraft {
  on: boolean;
  status: string;
  hours: number;
  ot: number;
  note: string;
}

const ROW_FALLBACK: RowDraft = { on: true, status: "present", hours: 8, ot: 0, note: "" };

function ymOf(iso: string) {
  return { year: Number(iso.slice(0, 4)), month0: Number(iso.slice(5, 7)) - 1 };
}

function cleanNum(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export default function WorkersScreen() {
  const s = useStyles();
  const { palette: t } = useTheme();
  const { claims } = useSession();
  const qc = useQueryClient();
  const fetching = useIsFetching();
  const [seg, setSeg] = useState<Seg>("workers");

  const staff = useStaff();
  const runs = usePayrollRuns();

  // ---- Attendance day state ----
  const [sel, setSel] = useState(todayIST);
  const isToday = sel === todayIST();
  const ro = !isToday;
  const [ym, setYm] = useState(() => ymOf(sel));
  const [monthOpen, setMonthOpen] = useState(false);
  const [shift, setShift] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, RowDraft>>({});
  const [prefilledFor, setPrefilledFor] = useState<string | null>(null);
  const [busySave, setBusySave] = useState(false);

  const rosterQ = usePayrollPeople();
  const shiftsQ = useShiftTemplates();
  const mapsQ = usePayMappings();
  const ratesQ = useUserDailyRates();
  const dayQ = useAttendanceForDate(sel);
  const dotsQ = useCalendarDays(ym.year, ym.month0);

  const shiftOptions = useMemo(
    () => (shiftsQ.data ?? []).map((tpl) => ({
      value: tpl.name,
      label: `${tpl.name} (${tpl.startTime}–${tpl.endTime}, ${tpl.totalHours}h)`,
    })),
    [shiftsQ.data],
  );

  // Prefill once per selected date: saved rows win (keyed entityType+entityId —
  // the exact fields useAttendanceForDate returns; it has no note/amount, so
  // note resets to "" and money is recomputed client-side). Unsaved roster
  // members default to present with the picked shift's hours (else 8h).
  useEffect(() => {
    if (prefilledFor === sel) return;
    if (!rosterQ.data || dayQ.data === undefined) return;
    const saved = new Map(dayQ.data.map((r) => [`${r.entityType}:${r.entityId}`, r]));
    const tpl = (shiftsQ.data ?? []).find((x) => x.name === shift);
    const base = tpl ? tpl.totalHours : 8;
    const next: Record<string, RowDraft> = {};
    for (const p of rosterQ.data) {
      const sv = saved.get(`${p.entityType}:${p.entityId}`);
      next[`${p.entityType}:${p.entityId}`] = sv
        ? { on: true, status: sv.status, hours: sv.hours, ot: sv.otHours, note: "" }
        : { on: true, status: "present", hours: base, ot: 0, note: "" };
    }
    setDraft(next);
    setPrefilledFor(sel);
  }, [prefilledFor, sel, rosterQ.data, dayQ.data, shiftsQ.data, shift]);

  function drOf(key: string): RowDraft {
    return draft[key] ?? ROW_FALLBACK;
  }

  function patch(key: string, p: Partial<RowDraft>) {
    setDraft((d) => ({ ...d, [key]: { ...(d[key] ?? ROW_FALLBACK), ...p } }));
  }

  function pillFor(p: PayrollPerson, dr: RowDraft): number | null {
    if (!dr.on || NO_PAY.has(dr.status)) return null;
    if (p.entityType === "worker") return payForHours(mapsQ.data ?? [], dr.hours);
    const r = ratesQ.data?.[p.entityId];
    return previewDailyWage(
      { monthlySalary: r?.monthlySalary ?? null, otRate: r?.otRate ?? null },
      dr.hours, dr.ot, dr.status,
    );
  }

  function onShiftPick(name: string) {
    setShift(name);
    const tpl = shiftsQ.data?.find((x) => x.name === name);
    if (!tpl) return;
    setDraft((d) => {
      const next = { ...d };
      for (const k of Object.keys(next)) {
        if (next[k].on) next[k] = { ...next[k], hours: tpl.totalHours };
      }
      return next;
    });
  }

  function onStatus(key: string, value: string) {
    setDraft((d) => {
      const cur = d[key] ?? ROW_FALLBACK;
      if (value === "absent" || NO_PAY.has(value)) {
        return { ...d, [key]: { ...cur, status: value, hours: 0, ot: 0 } };
      }
      const tpl = shiftsQ.data?.find((x) => x.name === shift);
      const fill = tpl ? tpl.totalHours : 8;
      return { ...d, [key]: { ...cur, status: value, hours: cur.hours > 0 ? cur.hours : fill } };
    });
  }

  let presentN = 0;
  let halfN = 0;
  let onN = 0;
  let dayTotal = 0;
  for (const p of rosterQ.data ?? []) {
    const dr = drOf(`${p.entityType}:${p.entityId}`);
    if (!dr.on) continue;
    onN++;
    if (dr.status === "present") presentN++;
    if (dr.status === "half_day") halfN++;
    dayTotal += pillFor(p, dr) ?? 0;
  }

  async function onSaveDay() {
    if (!isToday || busySave) return;
    const rows = (rosterQ.data ?? [])
      .map((p) => ({ p, dr: drOf(`${p.entityType}:${p.entityId}`) }))
      .filter(({ dr }) => dr.on)
      .map(({ p, dr }) => ({
        entityType: p.entityType,
        entityId: p.entityId,
        status: dr.status,
        hours: dr.hours,
        otHours: dr.ot,
        note: dr.note.trim() ? dr.note.trim() : null,
      }));
    if (rows.length === 0) {
      Toast.show({ type: "error", text1: "Nothing to save", text2: "Turn ON at least one row." });
      return;
    }
    setBusySave(true);
    try {
      const res = await saveAttendanceDay({ dateISO: sel, shiftName: shift, rows });
      Toast.show({ type: "success", text1: `Day saved — ${moneyINR(res.creditedTotal)} credited` });
      void qc.invalidateQueries({ queryKey: qk.attendanceDay(sel) });
      void qc.invalidateQueries({ queryKey: qk.opAttendanceToday() });
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
  const [payrollRunId, setPayrollRunId] = useState<string | null>(null);
  const lines = usePayrollLines(payrollRunId);

  // Signed ledger balances per entity id (positive = WH owes them). Enabled
  // only on the Workers segment — cached for instant return visits.
  const balancesQ = useWorkerBalances(seg === "workers");
  const [selected, setSelected] = useState<{
    entityType: "user" | "worker"; entityId: string; entityName: string;
  } | null>(null);

  function invalidateWorkers() {
    void qc.invalidateQueries({ queryKey: qk.opStaff() });
    void qc.invalidateQueries({ queryKey: qk.opAttendanceToday() });
    void qc.invalidateQueries({ queryKey: qk.opPayrollRuns() });
    void qc.invalidateQueries({ queryKey: qk.payrollPeople() });
    void qc.invalidateQueries({ queryKey: qk.attendanceDay(sel) });
    void qc.invalidateQueries({ queryKey: qk.workerBalances() });
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
          <Text style={s.legend}>Red: warehouse owes them · Green: they owe the warehouse</Text>
          {staff.isLoading ? <View style={s.pad}><SkeletonRows rows={5} /></View>
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
          <View style={s.segRow}>
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
          </View>
          <View style={s.segRow} pointerEvents={ro ? "none" : "auto"}>
            <View style={[s.shiftWrap, ro && { opacity: 0.6 }]}>
              <DropdownSelect
                value={shift}
                options={shiftOptions}
                onChange={onShiftPick}
                placeholder="Select shift"
                label="Shift"
              />
            </View>
          </View>
          {rosterQ.isLoading || dayQ.isLoading ? <View style={s.pad}><SkeletonRows rows={5} /></View>
            : rosterQ.isError ? <EmptyState title="Could not load roster" message={friendlyError(rosterQ.error)} />
            : dayQ.isError ? <EmptyState title="Could not load attendance" message={friendlyError(dayQ.error)} />
            : (rosterQ.data ?? []).length === 0 ? (
              <EmptyState title="No staff yet" message="Add workers first, then mark their attendance here." />
            ) : (
              <>
                <View style={s.list}>
                  {(rosterQ.data ?? []).map((p) => {
                    const key = `${p.entityType}:${p.entityId}`;
                    const dr = drOf(key);
                    const pill = pillFor(p, dr);
                    return (
                      <View key={key} style={s.card}>
                        <View style={s.headLine}>
                          <View style={s.nameWrap}>
                            <View style={[s.dot, { backgroundColor: p.entityType === "user" ? t.color.brand : t.color.ink4 }]} />
                            <Text style={s.name} numberOfLines={1}>{p.fullName}</Text>
                          </View>
                          {pill !== null ? <Text style={s.pill}>{moneyINR(pill)}</Text> : null}
                        </View>
                        <View style={s.attCtlRow}>
                          <Pressable
                            onPress={() => patch(key, { on: !dr.on })}
                            disabled={ro}
                            accessibilityRole="switch"
                            accessibilityLabel={`${p.fullName} included`}
                            accessibilityState={{ checked: dr.on }}
                            style={[s.onOff, dr.on && s.onOffOn, ro && { opacity: 0.6 }]}
                          >
                            <Text style={[s.onOffTxt, dr.on && s.onOffTxtOn]}>{dr.on ? "ON" : "OFF"}</Text>
                          </Pressable>
                          <View style={s.chipRow}>
                            {ATT_CHIPS.map((c) => {
                              const active = dr.status === c.value;
                              return (
                                <Pressable
                                  key={c.value}
                                  onPress={() => onStatus(key, c.value)}
                                  disabled={ro || !dr.on}
                                  accessibilityRole="button"
                                  accessibilityLabel={`Mark ${p.fullName} ${c.value}`}
                                  accessibilityState={{ selected: active }}
                                  style={[s.chip, active && s.chipOn, (ro || !dr.on) && { opacity: 0.5 }]}
                                >
                                  <Text style={[s.chipTxt, active && s.chipTxtOn]}>{c.label}</Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        </View>
                        {dr.on ? (
                          <>
                            <View style={s.numRow}>
                              <View style={s.numWrap}>
                                <Text style={s.numLabel}>HRS</Text>
                                <TextInput
                                  style={s.numInput}
                                  value={String(dr.hours)}
                                  onChangeText={(v) => patch(key, { hours: cleanNum(v) })}
                                  editable={!ro}
                                  keyboardType="decimal-pad"
                                  accessible
                                  accessibilityLabel={`${p.fullName} hours`}
                                />
                              </View>
                              <View style={s.numWrap}>
                                <Text style={s.numLabel}>OT</Text>
                                <TextInput
                                  style={s.numInput}
                                  value={String(dr.ot)}
                                  onChangeText={(v) => patch(key, { ot: cleanNum(v) })}
                                  editable={!ro}
                                  keyboardType="decimal-pad"
                                  accessible
                                  accessibilityLabel={`${p.fullName} overtime hours`}
                                />
                              </View>
                            </View>
                            <TextInput
                              style={s.noteInput}
                              value={dr.note}
                              onChangeText={(v) => patch(key, { note: v })}
                              editable={!ro}
                              placeholder="Note (optional)"
                              placeholderTextColor={t.color.ink4}
                              accessible
                              accessibilityLabel={`${p.fullName} note`}
                            />
                          </>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
                {isToday ? (
                  <View style={s.footer}>
                    <Text style={s.footTxt}>
                      Present {presentN} · Half {halfN} · {moneyINR(dayTotal)} today
                    </Text>
                    <Pressable
                      onPress={() => void onSaveDay()}
                      disabled={!isToday || onN === 0 || busySave}
                      accessibilityRole="button"
                      accessibilityLabel="Save attendance day"
                      style={({ pressed }) => [
                        s.saveBtn,
                        (!isToday || onN === 0 || busySave) && { opacity: 0.5 },
                        pressed && { opacity: 0.8 },
                      ]}
                    >
                      <Text style={s.saveTxt}>{busySave ? "Saving…" : "Save day"}</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Text style={s.caption}>View only — attendance can be changed on the day itself (or by the office).</Text>
                )}
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
    dateBtn: {
      flex: 1, minHeight: 44, borderRadius: tokens.radius.md, borderWidth: 1, borderColor: t.color.line,
      backgroundColor: t.color.surface, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    },
    dateBtnTxt: { fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs, color: t.color.ink },
    shiftWrap: { flex: 1 },
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
    subFlex: { flex: 1 },
    subLine: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: tokens.space.sm },
    legend: {
      color: t.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow,
      paddingHorizontal: tokens.space.lg, paddingTop: tokens.space.sm, textAlign: "center",
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
    pill: {
      color: t.color.grn, fontFamily: tokens.font.mono, fontSize: tokens.size.eyebrow,
      fontVariant: ["tabular-nums"],
    },
    attCtlRow: { flexDirection: "row", alignItems: "center", gap: tokens.space.xs },
    onOff: {
      minWidth: 48, minHeight: 32, borderRadius: tokens.radius.md, borderWidth: 1, borderColor: t.color.line,
      backgroundColor: t.color.fill, alignItems: "center", justifyContent: "center", paddingHorizontal: tokens.space.sm,
    },
    onOffOn: { backgroundColor: t.color.grnWash, borderColor: t.color.grn },
    onOffTxt: { color: t.color.ink3, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.eyebrow },
    onOffTxtOn: { color: t.color.grn },
    chipRow: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: tokens.space.xs },
    chip: {
      minWidth: 40, minHeight: 32, borderRadius: tokens.radius.md, borderWidth: 1, borderColor: t.color.line,
      backgroundColor: t.color.fill, alignItems: "center", justifyContent: "center", paddingHorizontal: tokens.space.sm,
    },
    chipOn: { backgroundColor: t.color.ink, borderColor: t.color.ink },
    chipTxt: { color: t.color.ink3, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
    chipTxtOn: { color: t.color.surface },
    numRow: { flexDirection: "row", gap: tokens.space.sm },
    numWrap: { flex: 1, gap: 2 },
    numLabel: { color: t.color.ink3, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.eyebrow, letterSpacing: 0.6 },
    numInput: {
      minHeight: 44, borderWidth: 1, borderColor: t.color.line, borderRadius: tokens.radius.md,
      backgroundColor: t.color.surface, paddingHorizontal: tokens.space.md,
      color: t.color.ink, fontFamily: tokens.font.mono, fontSize: tokens.size.sm, fontVariant: ["tabular-nums"],
    },
    noteInput: {
      minHeight: 44, borderWidth: 1, borderColor: t.color.line, borderRadius: tokens.radius.md,
      backgroundColor: t.color.surface, paddingHorizontal: tokens.space.md,
      color: t.color.ink, fontFamily: tokens.font.sans, fontSize: tokens.size.sm,
    },
    footer: { paddingHorizontal: tokens.space.lg, paddingTop: tokens.space.md, gap: tokens.space.sm },
    footTxt: {
      color: t.color.ink2, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs,
      fontVariant: ["tabular-nums"], textAlign: "center",
    },
    saveBtn: {
      minHeight: 48, borderRadius: tokens.radius.md, backgroundColor: t.color.brand,
      alignItems: "center", justifyContent: "center",
    },
    saveTxt: { color: "#ffffff", fontFamily: tokens.font.sansSemi, fontSize: tokens.size.sm },
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
