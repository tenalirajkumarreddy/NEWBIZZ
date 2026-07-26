export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startPoller } = await import("@/lib/intangles/cron-poller");
    const interval = Number(process.env.INTANGLES_POLL_INTERVAL_MS) || 60_000;
    startPoller(interval);
  }
}
