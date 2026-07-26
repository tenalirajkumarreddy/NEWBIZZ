import { runIntanglesPoll } from "./poller";

let cronInstance: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

export function isPollerRunning(): boolean {
  return cronInstance !== null;
}

export function startPoller(intervalMs = 60_000): void {
  if (cronInstance) return;
  if (!process.env.INTANGLES_USER_TOKEN || !process.env.INTANGLES_ACCOUNT_ID) {
    console.log("[intangles-poller] Skipped — Intangles not configured");
    return;
  }
  console.log("[intangles-poller] Starting cron (every %d ms)", intervalMs);
  runOnce();
  cronInstance = setInterval(runOnce, intervalMs);
}

export function stopPoller(): void {
  if (cronInstance) {
    clearInterval(cronInstance);
    cronInstance = null;
    console.log("[intangles-poller] Stopped");
  }
}

async function runOnce(): Promise<void> {
  if (isRunning) return;
  isRunning = true;

  try {
    const result = await runIntanglesPoll();
    if (result.ok) {
      console.log(
        "[intangles-poller] OK — inserted=%d tripsStarted=%d tripsEnded=%d refills=%d leaks=%d",
        result.inserted, result.tripsStarted, result.tripsEnded, result.refillsDetected, result.leaksDetected,
      );
    } else {
      console.error("[intangles-poller] error:", result.error);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error("[intangles-poller] error:", msg);
  } finally {
    isRunning = false;
  }
}
