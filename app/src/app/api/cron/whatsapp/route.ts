import { NextResponse } from "next/server";
import { drainWhatsappNotifications } from "@/lib/whatsapp/worker";

// Guarded cron endpoint for the WhatsApp dispatch worker. Same CRON_SECRET
// bearer pattern as /api/cron/notifications. In dry-run mode it only logs
// what WOULD be sent and marks rows processed.
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (expected && auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await drainWhatsappNotifications();
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "worker failed" }, { status: 500 });
  }
}
