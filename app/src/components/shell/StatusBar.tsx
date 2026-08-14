"use client";

import { useEffect, useState } from "react";

// 36px mono footer — faithful to refer_UI.html .sbar: three sections (left
// status with a green dot, centered context text, right live context). The
// branch/FY come from the server layout; the clock ticks live IST so the "live
// context" section is honest. We deliberately avoid the mockup's fictional
// money figures.
export function StatusBar({
  branchLabel = "Main Plant",
  fyLabel = "FY 2026-27",
}: {
  branchLabel?: string;
  fyLabel?: string;
}) {
  const now = useIstClock();

  return (
    <footer className="flex h-full items-center justify-between border-t border-line bg-surface px-4 font-mono text-[10px] text-ink-4">
      <span className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-grn" />
        All systems nominal
      </span>
      <span className="hidden text-center sm:block">
        {branchLabel} · Asia/Kolkata
      </span>
      <span className="flex items-center gap-3">
        {now && (
          <span className="tabular-nums">
            {formatIstTime(now)} IST
          </span>
        )}
        <span>{fyLabel} · NEWBIZZ</span>
      </span>
    </footer>
  );
}

// Live Asia/Kolkata clock, ticking every second. Renders only on the client so
// the server HTML never disagrees with a hydrated value.
function useIstClock(intervalMs = 1000): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function formatIstTime(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(d);
}