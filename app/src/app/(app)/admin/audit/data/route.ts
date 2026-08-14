import { NextResponse } from "next/server";
import { listAuditPage, type AuditAction } from "@/lib/data/audit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const action = (url.searchParams.get("action") || null) as AuditAction | null;
  const entity = url.searchParams.get("entity") || null;
  const q = url.searchParams.get("q") || null;
  const actor = url.searchParams.get("actor") || null;
  const before = url.searchParams.get("before") ? Number(url.searchParams.get("before")) : undefined;

  const { rows, hasMore } = await listAuditPage({ action, entity, search: q, actorId: actor }, before);
  return NextResponse.json({ rows, hasMore });
}
