"use client";

import { useState, useEffect } from "react";
import { Panel } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { Input, Select } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { saveDailyAttendance, markCalendarDay, fetchDayAttendanceDetail } from "@/lib/actions/payroll";
import type { ShiftTemplate, PayrollPerson, DayAttendanceDetail } from "@/lib/data/payroll";

export function DayRecordPanel({
  date,
  shiftTemplates,
  activeUsers,
  canManage,
}: {
  date: string;
  shiftTemplates: ShiftTemplate[];
  activeUsers: PayrollPerson[];
  canManage: boolean;
}) {
  const toast = useToast();
  const [selectedShiftId, setSelectedShiftId] = useState(shiftTemplates[0]?.id ?? "");
  const [existingRecords, setExistingRecords] = useState<DayAttendanceDetail[]>([]);
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
      otHours: number;
      shift: string;
      note: string;
    }[]
  >([]);

  const selectedShift = shiftTemplates.find((s) => s.id === selectedShiftId);

  useEffect(() => {
    fetchDayAttendanceDetail(date).then((rows) => {
      setExistingRecords(rows);
      setLoaded(true);

      if (rows.length > 0) {
        // day already recorded — populate from existing
        setWorkers(
          activeUsers.map((u) => {
            const match = rows.find((r) => r.userId === u.entityId);
            return {
              entityType: u.entityType,
              entityId: u.entityId,
              userName: u.fullName,
              present: match !== undefined,
              status: match?.status ?? "absent",
              hours: match?.hours ?? 0,
              otHours: match?.otHours ?? 0,
              shift: match?.shift ?? selectedShift?.name ?? "",
              note: match?.note ?? "",
            };
          }),
        );
      } else {
        // fresh form — default all to absent
        setWorkers(
          activeUsers.map((u) => ({
            entityType: u.entityType,
            entityId: u.entityId,
            userName: u.fullName,
            present: false,
            status: "absent",
            hours: selectedShift?.totalHours ?? 8,
            otHours: 0,
            shift: selectedShift?.name ?? "",
            note: "",
          })),
        );
      }
    });
  }, [date]);

  useEffect(() => {
    if (!selectedShift || loaded) return;
    // update default hours when shift changes (only on fresh/unloaded form)
  }, [selectedShift]);

  function togglePresent(entityId: string) {
    setWorkers((prev) =>
      prev.map((w) =>
        w.entityId === entityId
          ? { ...w, present: !w.present, status: w.present ? "absent" : "present" }
          : w,
      ),
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
    await markCalendarDay(date, true, null);

    const result = await saveDailyAttendance(
      date,
      selectedShiftId,
      workers.map((w) => ({
        entityType: w.entityType,
        entityId: w.entityId,
        present: w.present,
        status: w.present ? w.status : "absent",
        hours: w.present ? w.hours : 0,
        otHours: w.present ? w.otHours : 0,
        shift: w.present ? w.shift : null,
        note: w.note || null,
      })),
    );

    if (!result.ok) {
      toast.error("Error saving attendance", result.error);
    } else {
      toast.success("Attendance saved");
    }
    setSaving(false);
  }

  const selectedCount = workers.filter((w) => w.present).length;
  const absentCount = workers.filter((w) => !w.present).length;

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <span className="font-semibold text-ink">{date}</span>
          {existingRecords.length > 0 && <Badge tone="brand" size="sm">Recorded</Badge>}
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
            className="h-8 rounded-lg border border-line bg-white px-2.5 text-[12px] font-medium text-ink"
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
                <TH numeric className="w-20">OT</TH>
                <TH className="w-28">Note</TH>
              </TR>
            </THead>
            <TBody>
              {workers.map((w) => (
                <TR key={w.entityId} className={w.present ? "" : "opacity-40"}>
                  <TD>
                    <input
                      type="checkbox"
                      checked={w.present}
                      onChange={() => togglePresent(w.entityId)}
                      disabled={!canManage}
                      className="h-4 w-4 rounded border-line text-brand focus:ring-brand/30"
                    />
                  </TD>
                  <TD className="font-medium text-ink">{w.userName}</TD>
                  <TD>
                    {w.present ? (
                      <select
                        value={w.status}
                        onChange={(e) => updateField(w.entityId, "status", e.target.value)}
                        disabled={!canManage}
                        className="h-7 rounded-md border border-line px-2 text-[11px] text-ink"
                      >
                        <option value="present">Present</option>
                        <option value="half_day">Half Day</option>
                        <option value="leave">Leave</option>
                        <option value="holiday">Holiday</option>
                        <option value="week_off">Week Off</option>
                      </select>
                    ) : (
                      <span className="text-[12px] text-ink-4">Absent</span>
                    )}
                  </TD>
                  <TD>
                    {w.present ? (
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
                  <TD>
                    {w.present ? (
                      <Input
                        type="number"
                        value={w.otHours}
                        onChange={(e) => updateField(w.entityId, "otHours", Number(e.target.value))}
                        disabled={!canManage}
                        className="h-7 w-16 text-center"
                        step={0.5}
                      />
                    ) : (
                      <span className="block text-center text-[12px] text-ink-4">—</span>
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
