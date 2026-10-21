import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

// Guarded cron endpoint for the daily integrity sweep. It runs the read-only
// reconciliation_checks() and answers 503 when any book disagrees, so a plain
// uptime monitor (or a Vercel cron) turns drift into an alert instead of the
// next audit. Guarded by CRON_SECRET like the other cron routes.
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (expected && auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data, error } = await (supabase as any).rpc("reconciliation_checks");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as {
    check_name: string;
    expected: number;
    actual: number;
    difference: number;
    status: string;
  }[];
  const drifting = rows.filter((r) => r.status !== "ok");

  return NextResponse.json(
    {
      ok: drifting.length === 0,
      checked: rows.length,
      drifting: drifting.map((r) => ({
        check: r.check_name,
        expected: r.expected,
        actual: r.actual,
        difference: r.difference,
      })),
    },
    { status: drifting.length === 0 ? 200 : 503 },
  );
}
