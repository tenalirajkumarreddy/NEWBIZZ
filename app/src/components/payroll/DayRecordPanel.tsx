"use client";

import { useState, useEffect, useMemo } from "react";
import { Panel } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { Input, Select } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { Money } from "@/components/ui/Money";
import { saveDailyAttendance, markCalendarDay, fetchDayAttendanceDetail, fetchMonthAbsencesBefore } from "@/lib/actions/payroll";
import { payForHours, previewUserDay, type PayMapping } from "@/lib/payroll-bands";
import { rupeesCompact } from "@/lib/format";
import type { ShiftTemplate, PayrollPerson, DayAttendanceDetail, UserDailyRate } from "@/lib/data/payroll";

export function DayRecordPanel({
  date,
  shiftTemplates,
  activeUsers,
  payMappings,
  userRates,
  canManage,
}: {
  date: string;
  shiftTemplates: ShiftTemplate[];
  activeUsers: PayrollPerson[];
  payMappings: PayMapping[];
  userRates: Record<string, UserDailyRate>;
  canManage: boolean;
}) {
  const toast = useToast();
  const [selectedShiftId, setSelectedShiftId] = useState(shiftTemplates[0]?.id ?? "");
  const [existingRecords, setExistingRecords] = useState<DayAttendanceDetail[]>([]);
  const [absencesBefore, setAbsencesBefore] = useState<Record<string, number>>({});
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  // worker form state
  const [workers, setWorkers] = useState<
    {
      entityType: "user" | "worker";
      entityId: string;
      userName: string;
      present: boolean;
      status: string;
      hours: number;
      shift: string;
      note: string;
    }[]
  >([]);

  const selectedShift = shiftTemplates.find((s) => s.id === selectedShiftId);

  // Day loads on mount, then POLLS every 30s and refetches when the tab
  // regains focus — so marks saved by another device (phone ↔ web) show up
  // here without a manual refresh. Dirty-row protection: a poll never
  // overwrites a row this user is actively editing (status flipped locally,
  // hours changed, or note typed) — only their own Save writes those.
  useEffect(() => {
    let active = true;

    function apply(rows: DayAttendanceDetail[]) {
      if (!active) return;
      setExistingRecords(rows);
      setLoaded(true);
      setWorkers((prev) => {
        const hasPrev = prev.length > 0;

        if (rows.length === 0) {
          // fresh day — seed the absent roster only into an empty form
          if (hasPrev) return prev;
          return activeUsers.map((u) => ({
            entityType: u.entityType,
            entityId: u.entityId,
            userName: u.fullName,
            present: false,
            status: "absent",
            hours: selectedShift?.totalHours ?? 8,
            shift: selectedShift?.name ?? "",
            note: "",
          }));
        }

        return activeUsers.map((u) => {
          const match = rows.find((r) => (r.entityId ?? r.userId) === u.entityId);
          // saved legacy half_day/leave rows show as absent in the new
          // model — resaving rewrites them as a clean present|absent
          const isPresent = match?.status === "present";
          const next = {
            entityType: u.entityType,
            entityId: u.entityId,
            userName: u.fullName,
            present: isPresent,
            status: isPresent ? "present" : "absent",
            hours: isPresent ? match?.hours ?? 0 : 0,
            shift: isPresent ? match?.shift ?? selectedShift?.name ?? "" : "",
            note: match?.note ?? "",
          };
          const cur = hasPrev ? prev.find((w) => w.entityId === u.entityId) : undefined;
          if (cur) {
            // dirty-row protection: keep the local edit
            if (cur.present !== next.present) return cur;
            if (cur.present && cur.hours !== next.hours) return cur;
            if (cur.note && cur.note !== next.note) return cur;
          }
          return next;
        });
      });
    }

    const load = () =>
      fetchDayAttendanceDetail(date)
        .then(apply)
        .catch(() => {
          if (active) toast.error("Couldn't load the day details");
        });

    void load();
    const iv = window.setInterval(load, 30_000);
    const onFocus = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);

    // paid-leave bookkeeping for the preview: per-USER absent+leave rows
    // earlier this month (the RPC counts exactly these, excluding the day
    // being saved).
    fetchMonthAbsencesBefore(date)
      .then((m) => {
        if (active) setAbsencesBefore(m);
      })
      .catch(() => {
        if (active) setAbsencesBefore({});
      });

    return () => {
      active = false;
      window.clearInterval(iv);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [date]);

  useEffect(() => {
    if (!selectedShift || loaded) return;
    // update default hours when shift changes (only on fresh/unloaded form)
  }, [selectedShift]);

  function togglePresent(entityId: string) {
    setWorkers((prev) =>
      prev.map((w) => {
        if (w.entityId !== entityId) return w;
        if (w.present) {
          // → absent: zero the pay-driving inputs
          return { ...w, present: false, status: "absent", hours: 0 };
        }
        // → present: hours default to the slot's total, manually editable
        return { ...w, present: true, status: "present", hours: selectedShift?.totalHours ?? 8 };
      }),
    );
  }

  /** present|absent only — the RPC rejects every other status (0127). */
  function setStatus(entityId: string, value: string) {
    setWorkers((prev) =>
      prev.map((w) => {
        if (w.entityId !== entityId) return w;
        if (value === "present") {
          return { ...w, present: true, status: "present", hours: w.hours || selectedShift?.totalHours || 8 };
        }
        return { ...w, present: false, status: "absent", hours: 0 };
      }),
    );
  }

  function updateField(entityId: string, field: string, value: unknown) {
    setWorkers((prev) =>
      prev.map((w) => (w.entityId === entityId ? { ...w, [field]: value } : w)),
    );
  }

  async function handleSave() {
    setSaving(true);

    // mark day as working
    const dayResult = await markCalendarDay(date, true, null);
    if (dayResult && !dayResult.ok) {
      toast.error("Error marking the day as worked", dayResult.error);
      setSaving(false);
      return;
    }

    // FULL ROSTER goes to the RPC — absent rows must be written so the
    // monthly paid-leave allowance counts them (0127). Status is
    // present|absent only; absent rows carry 0 hours/OT.
    const result = await saveDailyAttendance(
      date,
      selectedShiftId,
      workers.map((w) => ({
        entityType: w.entityType,
        entityId: w.entityId,
        present: w.status === "present",
        status: w.status === "present" ? "present" : "absent",
        hours: w.status === "present" ? w.hours : 0,
        otHours: 0,
        shift: w.status === "present" ? w.shift : null,
        note: w.note || null,
      })),
    );

    if (!result.ok) {
      toast.error("Error saving attendance", result.error);
    } else {
      toast.success("Day saved", `${rupeesCompact(result.creditedTotal)} credited`);
    }
    setSaving(false);
  }

  const selectedCount = workers.filter((w) => w.status === "present").length;
  const absentCount = workers.length - selectedCount;

  // Latest attendance.created_at across the day's rows — "recorded at HH:MM"
  // reassures everyone the marks they see are the saved ones.
  const recordedAtLabel = useMemo(() => {
    const times = existingRecords.map((r) => r.recordedAt).filter(Boolean) as string[];
    if (times.length === 0) return null;
    const latest = times.reduce((a, b) => (a > b ? a : b));
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(latest));
  }, [existingRecords]);

  // Days in the panel's month — the monthly day-rate denominator.
  const daysInMonth = new Date(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)),
    0,
  ).getDate();
  // Paid-leave allowance bookkeeping for the preview: absences ALREADY SAVED
  // this month (before today), consumed oldest-first. Reordered rows re-derive
  // the same credit — the RPC owns money truth; this is a hint only.

  // per-entity preview: workers use pay_mappings bands (worked hours only);
  // users get the day rate (salary ÷ days-in-month), paid on present and on
  // absences within the paid-leave allowance, + OT. Missing config ⇒ 0.
  const rowPreview = (w: (typeof workers)[number]) => {
    if (w.entityType === "user") {
      const r = userRates[w.entityId];
      return previewUserDay(
        {
          monthlySalary: r?.monthlySalary ?? null,
          dailyRate: r?.dailyRate ?? null,
          otRate: r?.otRate ?? null,
          payType: r?.payType ?? null,
          paidLeaves: r?.paidLeaves ?? null,
        },
        w.status,
        absencesBefore[w.entityId] ?? 0,
        daysInMonth,
        0,
      );
    }
    if (w.status !== "present") return 0;
    return payForHours(payMappings, Number(w.hours) || 0);
  };
  const creditedPreview = workers.reduce((s, w) => s + rowPreview(w), 0);

  return (
    <Panel
      title={
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-ink">{date}</span>
          {existingRecords.length > 0 && <Badge tone="brand" size="sm">Recorded</Badge>}
          {recordedAtLabel && (
            <span className="text-[11px] font-normal text-ink-3">at {recordedAtLabel} · auto-refreshes</span>
          )}
        </span>
      }
    >
      <div className="flex flex-wrap items-center gap-3 border-b border-line pb-3">
        <div className="flex items-center gap-2">
          <label className="text-[12px] font-medium text-ink-3">Shift</label>
          <select
            value={selectedShiftId}
            onChange={(e) => {
              setSelectedShiftId(e.target.value);
              const shift = shiftTemplates.find((s) => s.id === e.target.value);
              if (shift) {
                setWorkers((prev) =>
                  prev.map((w) => ({
                    ...w,
                    hours: shift.totalHours,
                    shift: shift.name,
                  })),
                );
              }
            }}
            className="h-8 rounded-lg border border-line bg-white dark:bg-fill px-2.5 text-[12px] font-medium text-ink"
          >
            {shiftTemplates.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.startTime}–{s.endTime}, {s.totalHours}h)
              </option>
            ))}
          </select>
        </div>
      </div>

      {loaded && (
        <div className="max-h-[400px] overflow-y-auto">
          <Table>
            <THead>
              <TR>
                <TH className="w-10" />
                <TH>Worker</TH>
                <TH className="w-24">Status</TH>
                <TH numeric className="w-20">Hours</TH>
                <TH numeric className="w-24">Amount</TH>
                <TH className="w-28">Note</TH>
              </TR>
            </THead>
            <TBody>
              {workers.map((w) => (
                <TR key={w.entityId} className={w.status === "present" ? "" : "opacity-40"}>
                  <TD>
                    <input
                      type="checkbox"
                      checked={w.status === "present"}
                      onChange={() => togglePresent(w.entityId)}
                      disabled={!canManage}
                      className="h-4 w-4 rounded border-line text-brand focus:ring-brand/30"
                    />
                  </TD>
                  <TD className="font-medium text-ink">{w.userName}</TD>
                  <TD>
                    <select
                      value={w.status}
                      onChange={(e) => setStatus(w.entityId, e.target.value)}
                      disabled={!canManage}
                      className="h-7 rounded-md border border-line px-2 text-[11px] text-ink"
                    >
                      <option value="present">Present</option>
                      <option value="absent">Absent</option>
                    </select>
                  </TD>
                  <TD>
                    {w.status === "present" ? (
                      <Input
                        type="number"
                        value={w.hours}
                        onChange={(e) => updateField(w.entityId, "hours", Number(e.target.value))}
                        disabled={!canManage}
                        className="h-7 w-16 text-center"
                        step={0.5}
                      />
                    ) : (
                      <span className="block text-center text-[12px] text-ink-4">—</span>
                    )}
                  </TD>
                  <TD numeric>
                    {rowPreview(w) > 0 ? (
                      <Money value={rowPreview(w)} />
                    ) : (
                      <span className="block text-right text-[12px] text-ink-4">—</span>
                    )}
                  </TD>
                  <TD>
                    <Input
                      value={w.note}
                      onChange={(e) => updateField(w.entityId, "note", e.target.value)}
                      disabled={!canManage}
                      className="h-7"
                      placeholder="—"
                    />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}

      {loaded && creditedPreview > 0 && (
        <p className="text-right text-[11px] text-ink-4">
          ≈ <Money value={creditedPreview} /> credited on save
        </p>
      )}

      {canManage && (
        <div className="flex justify-end border-t border-line pt-3">
          <Button variant="primary" onClick={handleSave} loading={saving} size="sm">
            Save Attendance
          </Button>
        </div>
      )}
    </Panel>
  );
}
