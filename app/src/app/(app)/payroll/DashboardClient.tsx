"use client";

import { useState } from "react";
import { AttendanceCalendar } from "@/components/payroll/AttendanceCalendar";
import { DayRecordPanel } from "@/components/payroll/DayRecordPanel";
import { todayIST } from "@/lib/data/fy";
import type {
  ShiftTemplate,
  PayrollPerson,
  CalendarDay,
  PayMapping,
  UserDailyRate,
} from "@/lib/data/payroll";

export function DashboardClient({
  year: initialYear,
  month: initialMonth,
  shiftTemplates,
  activeUsers,
  calendarDays,
  payMappings,
  userRates,
  canManage,
}: {
  year: number;
  month: number;
  shiftTemplates: ShiftTemplate[];
  activeUsers: PayrollPerson[];
  calendarDays: CalendarDay[];
  payMappings: PayMapping[];
  userRates: Record<string, UserDailyRate>;
  canManage: boolean;
}) {
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  // Today preselected — the panel opens ready to record, not on an empty hint.
  const [selectedDate, setSelectedDate] = useState<string | null>(() => todayIST());

  /** After a month jump, land on today when (re)entering the current month. */
  function selectForMonth(y: number, m: number) {
    const now = todayIST();
    setSelectedDate(`${now.slice(0, 4)}` === String(y) && `${now.slice(5, 7)}` === String(m).padStart(2, "0") ? now : null);
  }

  function onPrevMonth() {
    const newDate = new Date(year, month - 2, 1);
    const y = newDate.getFullYear();
    const m = newDate.getMonth() + 1;
    setYear(y);
    setMonth(m);
    selectForMonth(y, m);
  }

  function onNextMonth() {
    const newDate = new Date(year, month, 1);
    const y = newDate.getFullYear();
    const m = newDate.getMonth() + 1;
    setYear(y);
    setMonth(m);
    selectForMonth(y, m);
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <div className="w-full shrink-0 lg:w-80">
        <div className="mb-3">
          <span className="text-[13px] font-semibold text-ink">Calendar</span>
        </div>
        <div className="rounded-lg border border-line bg-surface p-3 shadow-card">
          <AttendanceCalendar
            year={year}
            month={month}
            calendarDays={calendarDays}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            onPrevMonth={onPrevMonth}
            onNextMonth={onNextMonth}
          />
        </div>
      </div>

      <div className="min-w-0 flex-1">
        {selectedDate ? (
          <DayRecordPanel
            date={selectedDate}
            shiftTemplates={shiftTemplates}
            activeUsers={activeUsers}
            payMappings={payMappings}
            userRates={userRates}
            canManage={canManage}
          />
        ) : (
          <div className="flex items-center justify-center rounded-lg border border-dashed border-line py-16">
            <p className="text-[13px] text-ink-4">Select a date on the calendar to record or view attendance</p>
          </div>
        )}
      </div>
    </div>
  );
}
