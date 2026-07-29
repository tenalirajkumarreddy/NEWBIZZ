"use client";

import { useMemo } from "react";
import type { CalendarDay } from "@/lib/data/payroll";

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function firstDayOfMonth(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay(); // 0=Sun
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function AttendanceCalendar({
  year,
  month,
  calendarDays,
  selectedDate,
  onSelectDate,
  onPrevMonth,
  onNextMonth,
}: {
  year: number;
  month: number;
  calendarDays: CalendarDay[];
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}) {
  const days = daysInMonth(year, month);
  const startDay = firstDayOfMonth(year, month);
  const cdMap = useMemo(() => {
    const m = new Map<string, CalendarDay>();
    for (const d of calendarDays) m.set(d.date, d);
    return m;
  }, [calendarDays]);

  const cells: { date: string | null; day: number; isWorking?: boolean; isSelected: boolean }[] = [];
  for (let i = 0; i < startDay; i++) cells.push({ date: null, day: 0, isSelected: false });

  for (let d = 1; d <= days; d++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const cd = cdMap.get(dateStr);
    const isWorking = cd ? cd.isWorking : undefined;
    cells.push({ date: dateStr, day: d, isWorking, isSelected: selectedDate === dateStr });
  }

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  return (
    <div>
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={onPrevMonth}
          className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-ink-3 transition-colors hover:bg-fill hover:text-ink"
        >
          ← {MONTHS[month - 2] ?? ""}
        </button>
        <span className="text-[15px] font-bold text-ink">{MONTHS[month - 1]} {year}</span>
        <button
          type="button"
          onClick={onNextMonth}
          className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-ink-3 transition-colors hover:bg-fill hover:text-ink"
        >
          {MONTHS[month] ?? ""} →
        </button>
      </div>

      {/* Day-of-week header */}
      <div className="grid grid-cols-7 gap-px">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div key={d} className="py-1 text-center text-[11px] font-semibold uppercase tracking-wider text-ink-3">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-px">
        {cells.map((cell, i) => {
          if (!cell.date) return <div key={`blank-${i}`} />;

          const isToday = cell.date === todayStr;
          const dotColor =
            cell.isWorking === true ? "bg-green-500"
            : cell.isWorking === false ? "bg-red-400"
            : "bg-ink-2";

          return (
            <button
              key={cell.date}
              type="button"
              onClick={() => onSelectDate(cell.date!)}
              className={`relative flex flex-col items-center rounded-lg py-2 text-[13px] transition-colors hover:bg-fill ${
                cell.isSelected
                  ? "bg-brand/10 ring-1 ring-brand"
                  : ""
              } ${isToday ? "font-bold" : ""}`}
            >
              <span className={cell.isSelected ? "text-brand" : "text-ink"}>
                {cell.day}
              </span>
              <span className={`mt-0.5 h-1.5 w-1.5 rounded-full ${dotColor}`} />
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-3 flex gap-4 text-[11px] text-ink-3">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-green-500" /> Working
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-red-400" /> Non-working
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-ink-2" /> No status
        </span>
      </div>
    </div>
  );
}
