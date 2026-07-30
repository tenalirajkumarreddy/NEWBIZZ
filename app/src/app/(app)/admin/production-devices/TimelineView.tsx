"use client";

import { Badge } from "@/components/ui/Badge";
import { count as fmtCount } from "@/lib/format";
import type { HourlyProductionRow } from "@/lib/data/production-devices";

const TYPE_TONE: Record<string, "brand" | "amb" | "grn" | "slate" | "neutral"> = {
  raw_material: "amb",
  wip: "neutral",
  finished_good: "grn",
  consumable: "slate",
  service: "slate",
};

const HOUR_LABELS = [
  "00:00–01:00", "01:00–02:00", "02:00–03:00", "03:00–04:00",
  "04:00–05:00", "05:00–06:00", "06:00–07:00", "07:00–08:00",
  "08:00–09:00", "09:00–10:00", "10:00–11:00", "11:00–12:00",
  "12:00–13:00", "13:00–14:00", "14:00–15:00", "15:00–16:00",
  "16:00–17:00", "17:00–18:00", "18:00–19:00", "19:00–20:00",
  "20:00–21:00", "21:00–22:00", "22:00–23:00", "23:00–00:00",
];

export function TimelineView({
  data,
  date,
  totalUnits,
  realtime = false,
  currentHour = -1,
}: {
  data: HourlyProductionRow[];
  date: string;
  totalUnits: number;
  realtime?: boolean;
  currentHour?: number;
}) {
  return (
    <div className="flex flex-col gap-4">
      <style>{`
        @keyframes tl-blink {
          0%, 100% { box-shadow: inset 0 0 0 2px rgba(59,130,246,0.6); }
          50% { box-shadow: inset 0 0 0 2px rgba(59,130,246,1), 0 0 8px rgba(59,130,246,0.3); }
        }
        .tl-current-realtime {
          animation: tl-blink 1.2s ease-in-out infinite;
        }
      `}</style>

      {/* Hourly breakdown per device */}
      {data.length === 0 ? (
        <div className="py-12 text-center text-[13px] text-ink-3">
          No production data for {date}
        </div>
      ) : (
        data.map((row) => {
          const maxVal = Math.max(...row.hours, 1);
          return (
            <div key={`${row.deviceId}-${row.deviceIndex}`} className="rounded-xl border border-line bg-white">
              {/* Device header */}
              <div className="flex items-center gap-3 border-b border-line px-4 py-2.5">
                <span className="font-mono text-[12px] font-semibold text-brand">
                  {row.deviceId}
                </span>
                <Badge tone="neutral" size="sm">
                  Index {row.deviceIndex}
                </Badge>
                <span className="text-[13px] font-medium text-ink">
                  {row.itemSku}
                </span>
                <span className="text-[12px] text-ink-3">
                  {row.itemName}
                </span>
                <Badge tone={TYPE_TONE[row.itemType] ?? "slate"} size="sm">
                  {row.itemType.replace("_", " ")}
                </Badge>
                <span className="ml-auto text-[13px] font-semibold text-ink tnum">
                  {fmtCount(row.hours.reduce((a, b) => a + b, 0))} total
                </span>
              </div>

              {/* 24-hour compact grid */}
              <div className="p-3">
                <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8 md:grid-cols-12">
                  {row.hours.map((val, h) => {
                    const pct = maxVal > 0 ? val / maxVal : 0;
                    const isCurrent = h === currentHour;
                    const bg =
                      val === 0 && !isCurrent
                        ? "bg-fill"
                        : isCurrent
                          ? "bg-brand/12"
                          : pct > 0.5
                            ? "bg-brand/20"
                            : "bg-brand/8";
                    const currentClass = isCurrent
                      ? realtime
                        ? "tl-current-realtime"
                        : "ring-2 ring-brand"
                      : "";
                    return (
                      <div
                        key={h}
                        className={`flex flex-col items-center rounded-md px-1 py-1.5 transition-colors ${bg} ${currentClass}`}
                        title={`${HOUR_LABELS[h]}: ${fmtCount(val)} units`}
                      >
                        <span className="text-[10px] font-medium text-ink-3">
                          {String(h).padStart(2, "0")}:00
                        </span>
                        <span className="tnum text-[12px] font-semibold text-ink">
                          {val > 0 ? fmtCount(val) : "—"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
