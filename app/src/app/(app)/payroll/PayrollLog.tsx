"use client";

import { useMemo } from "react";
import { Panel } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Money } from "@/components/ui/Money";
import { EmptyState } from "@/components/ui/EmptyState";
import type { PayrollLogRow } from "@/lib/data/payroll";

const TYPE_LABEL: Record<string, string> = {
  attendance_pay: "Credited",
  payment: "Payment",
  advance: "Advance",
  adjustment: "Adjustment",
};

const TONE: Record<string, "brand" | "grn" | "amb" | "red"> = {
  attendance_pay: "brand",
  payment: "grn",
  advance: "amb",
  adjustment: "red",
};

interface DayGroup {
  day: string;
  rows: PayrollLogRow[];
  credited: number;
  paid: number;
}

function groupByDay(rows: PayrollLogRow[]): DayGroup[] {
  const groups = new Map<string, DayGroup>();
  for (const r of rows) {
    let g = groups.get(r.date);
    if (!g) {
      g = { day: r.date, rows: [], credited: 0, paid: 0 };
      groups.set(r.date, g);
    }
    g.rows.push(r);
    if (r.type === "attendance_pay") g.credited += r.amount;
    else g.paid += Math.abs(r.amount);
  }
  return [...groups.values()];
}

function dayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  const label = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
  return `${label}${iso === today ? " · Today" : ""}`;
}

export function PayrollLog({ log }: { log: PayrollLogRow[] }) {
  const groups = useMemo(() => groupByDay(log), [log]);

  if (log.length === 0) {
    return (
      <EmptyState
        title="No payroll activity yet"
        description="Attendance credits, payments and advances appear here as they happen, grouped by day."
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {groups.map((g) => (
        <div key={g.day} className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-baseline gap-3 px-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">
              {dayLabel(g.day)}
            </span>
            {g.credited > 0 && (
              <span className="font-mono text-[11px] font-semibold text-brand">
                +<Money value={g.credited} /> credited
              </span>
            )}
            {g.paid > 0 && (
              <span className="font-mono text-[11px] font-semibold text-green-600 dark:text-emerald-400">
                −<Money value={g.paid} /> paid
              </span>
            )}
          </div>
          <Panel flush>
            {g.rows.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-semibold text-ink">{r.entityName}</span>
                    <Badge tone={TONE[r.type] ?? "brand"} size="sm">
                      {TYPE_LABEL[r.type] ?? r.type}
                    </Badge>
                  </div>
                  {r.note && (
                    <p className="truncate text-[11px] italic text-ink-3">&ldquo;{r.note}&rdquo;</p>
                  )}
                </div>
                <span
                  className={`font-mono text-[13px] font-semibold ${
                    r.type === "attendance_pay"
                      ? "text-brand"
                      : r.type === "payment"
                        ? "text-green-600 dark:text-emerald-400"
                        : r.type === "adjustment"
                          ? "text-red-500 dark:text-red-400"
                          : "text-amber-600 dark:text-amber-400"
                  }`}
                >
                  {r.amount < 0 ? "−" : "+"}
                  <Money value={Math.abs(r.amount)} />
                </span>
              </div>
            ))}
          </Panel>
        </div>
      ))}
    </div>
  );
}
