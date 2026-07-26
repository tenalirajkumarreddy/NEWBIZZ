import { NextResponse } from "next/server";
import { runIntanglesPoll } from "@/lib/intangles/poller";

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (expected && auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await runIntanglesPoll();
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    inserted: result.inserted,
    tripsStarted: result.tripsStarted,
    tripsEnded: result.tripsEnded,
    refillsDetected: result.refillsDetected,
    leaksDetected: result.leaksDetected,
  });
}
