"use client";

import { useState } from "react";
import { AttendanceCalendar } from "@/components/payroll/AttendanceCalendar";
import { DayRecordPanel } from "@/components/payroll/DayRecordPanel";
import type { ShiftTemplate, PayrollPerson, CalendarDay } from "@/lib/data/payroll";

export function DashboardClient({
  year: initialYear,
  month: initialMonth,
  shiftTemplates,
  activeUsers,
  calendarDays,
  canManage,
}: {
  year: number;
  month: number;
  shiftTemplates: ShiftTemplate[];
  activeUsers: PayrollPerson[];
  calendarDays: CalendarDay[];
  canManage: boolean;
}) {
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  function onPrevMonth() {
    const newDate = new Date(year, month - 2, 1);
    setYear(newDate.getFullYear());
    setMonth(newDate.getMonth() + 1);
    setSelectedDate(null);
  }

  function onNextMonth() {
    const newDate = new Date(year, month, 1);
    setYear(newDate.getFullYear());
    setMonth(newDate.getMonth() + 1);
    setSelectedDate(null);
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
