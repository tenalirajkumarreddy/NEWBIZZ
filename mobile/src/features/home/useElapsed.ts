import { useEffect, useState } from "react";

function elapsedSince(iso: string): number {
  const start = new Date(iso).getTime();
  if (!Number.isFinite(start)) return 0;
  return Math.max(0, Math.floor((Date.now() - start) / 1000));
}

export function formatElapsed(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Seconds elapsed since `startedIso`, re-rendering every 60s. */
export function useElapsed(startedIso: string | null | undefined): number {
  const [sec, setSec] = useState(() => (startedIso ? elapsedSince(startedIso) : 0));

  useEffect(() => {
    if (!startedIso) return;
    setSec(elapsedSince(startedIso));
    const t = setInterval(() => setSec(elapsedSince(startedIso)), 60_000);
    return () => clearInterval(t);
  }, [startedIso]);

  return sec;
}
