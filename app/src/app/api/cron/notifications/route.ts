import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

// Guarded cron endpoint for the daily notification sweep (license expiry,
// stale handovers, EMIs due). pg_cron runs the same scan inside the DB; this
// route is the portable fallback (Vercel cron / external scheduler) and a
// manual "run now" trigger. Guarded by CRON_SECRET like the intangles poller.
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (expected && auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data, error } = await (supabase as any).rpc("notification_daily_scan");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const counts = (data ?? {}) as Record<string, number>;
  return NextResponse.json({ ok: true, ...counts });
}
