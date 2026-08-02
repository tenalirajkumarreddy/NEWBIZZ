// =====================================================================
// lib/data/audit.ts — typed, paginated reader for the append-only audit log.
//
// audit_log is immutable (no update/delete, enforced by trigger + RLS). We
// read it through the `read_audit` policy (has_permission('audit.view')) with
// the actor name joined from users. Pagination is keyset (cursor on id desc)
// so the page stays stable while the table grows.
// =====================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrap } from "./types";

export type AuditAction = "insert" | "update" | "delete" | "approve" | "reject" | "post" | "void" | "login";

export interface AuditRow {
  id: number;
  at: string;
  actorId: string | null;
  actorName: string | null;
  action: AuditAction;
  entity: string;
  entityId: string | null;
  summary: string | null;
  diff: Record<string, unknown> | null;
}

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  insert: "Insert",
  update: "Update",
  delete: "Delete",
  approve: "Approve",
  reject: "Reject",
  post: "Post",
  void: "Void",
  login: "Login",
};

interface AuditFilter {
  action?: AuditAction | null;
  entity?: string | null;
  actorId?: string | null;
  search?: string | null;
}

export const PAGE_SIZE = 50;

/**
 * Fetch a page of audit rows, newest first. `beforeId` enables keyset
 * pagination (pass the last row's id to get older entries).
 */
export async function listAuditPage(
  filter: AuditFilter,
  beforeId?: number,
  limit: number = PAGE_SIZE,
): Promise<{ rows: AuditRow[]; hasMore: boolean }> {
  const supabase = createClient();
  let q = (supabase as any)
    .from("audit_log")
    .select("id, at, actor_id, action, entity, entity_id, summary, diff, users!audit_log_actor_id_fkey(full_name)")
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (beforeId) q = q.lt("id", beforeId);
  if (filter.action) q = q.eq("action", filter.action);
  if (filter.entity) q = q.eq("entity", filter.entity);
  if (filter.actorId) q = q.eq("actor_id", filter.actorId);
  if (filter.search) q = q.ilike("summary", `%${filter.search}%`);

  const rows = unwrap(await q, [] as any[], "audit:listAuditPage");
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  return {
    hasMore,
    rows: page.map((r: any) => ({
      id: Number(r.id),
      at: r.at,
      actorId: r.actor_id,
      actorName: r.users?.full_name ?? null,
      action: r.action as AuditAction,
      entity: r.entity,
      entityId: r.entity_id,
      summary: r.summary,
      diff: r.diff && typeof r.diff === "object" ? (r.diff as Record<string, unknown>) : null,
    })),
  };
}

/** Distinct entities seen in the audit log, for the filter dropdown. */
export async function listAuditEntities(): Promise<string[]> {
  const supabase = createClient();
  const rows = unwrap(
    await (supabase as any).from("audit_log").select("entity").order("entity"),
    [] as any[],
    "audit:listAuditEntities",
  );
  return [...new Set(rows.map((r: any) => r.entity))];
}
