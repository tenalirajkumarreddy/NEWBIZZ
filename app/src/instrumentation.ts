export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // On Vercel this file runs in EVERY warm serverless function - an
    // in-process 60s poller there burns Hobby function-invocation quota
    // many times over the vercel.json cron alone. Server-side GPS polling
    // is opt-in off-platform; on Vercel the /api/intangles/poll cron (if
    // enabled) and the fleet page's on-demand refresh drive the poller.
    if (process.env.VERCEL) {
      console.log("[intangles-poller] In-process poller disabled on Vercel");
      return;
    }
    const { startPoller } = await import("@/lib/intangles/cron-poller");
    const interval = Number(process.env.INTANGLES_POLL_INTERVAL_MS) || 60_000;
    startPoller(interval);
  }
}
