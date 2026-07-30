"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { TimelineView } from "./TimelineView";
import { getHourlyProductionAction } from "@/lib/actions/production-devices";
import { count as fmtCount } from "@/lib/format";
import type { HourlyProductionRow } from "@/lib/data/production-devices";

const POLL_INTERVAL_MS = 10_000;

function getIstHour(): number {
  const now = new Date();
  const ist = now.getTime() + 5.5 * 3_600_000;
  return new Date(ist).getUTCHours();
}

export function LiveTimeline({
  initialData,
  date,
  totalUnits: initialTotal,
}: {
  initialData: HourlyProductionRow[];
  date: string;
  totalUnits: number;
}) {
  const [data, setData] = useState(initialData);
  const [totalUnits, setTotalUnits] = useState(initialTotal);
  const [realtime, setRealtime] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [currentHour, setCurrentHour] = useState(getIstHour);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  const router = useRouter();

  const fetchData = useCallback(async () => {
    try {
      const fresh = await getHourlyProductionAction(date);
      const total = fresh.reduce((sum, r) => sum + r.hours.reduce((a, b) => a + b, 0), 0);
      if (mountedRef.current) {
        setData(fresh);
        setTotalUnits(total);
      }
    } catch {
      // silent — server action error
    }
  }, [date]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  // Track mounted state
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Poll when realtime is on
  useEffect(() => {
    if (realtime) {
      pollRef.current = setInterval(fetchData, POLL_INTERVAL_MS);
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [realtime, fetchData]);

  // Update current hour every 30s
  useEffect(() => {
    const tick = setInterval(() => setCurrentHour(getIstHour()), 30_000);
    return () => clearInterval(tick);
  }, []);

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <label htmlFor="tl-date" className="text-[13px] font-medium text-ink">
            Date
          </label>
          <input
            id="tl-date"
            type="date"
            value={date}
            onChange={(e) => {
              const d = e.target.value;
              router.push(`/admin/production-devices?date=${d}`);
            }}
            className="h-9 rounded-lg border border-line bg-white px-3 text-[13px] text-ink shadow-sm focus:border-brand focus:outline-none"
          />
          <span className="text-[12px] text-ink-3">
            {fmtCount(totalUnits)} units produced
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-[12px] font-medium text-ink shadow-sm transition-colors hover:bg-fill disabled:opacity-50"
          >
            <svg
              className={`size-3.5 ${refreshing ? "animate-spin" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>

          <label className="flex cursor-pointer items-center gap-2">
            <div className="relative">
              <input
                type="checkbox"
                checked={realtime}
                onChange={(e) => setRealtime(e.target.checked)}
                className="peer sr-only"
              />
              <div className="h-5 w-9 rounded-full bg-line transition-colors peer-checked:bg-brand" />
              <div className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4" />
            </div>
            <span className="text-[13px] font-medium text-ink">Realtime</span>
            {realtime && <span className="inline-block size-1.5 rounded-full bg-grn animate-pulse" />}
          </label>
        </div>
      </div>

      <TimelineView
        data={data}
        date={date}
        totalUnits={totalUnits}
        realtime={realtime}
        currentHour={currentHour}
      />
    </>
  );
}
