// Shared audit-log types + labels. Kept free of `server-only` so both server
// readers (lib/data/audit.ts) and client pages can import them.

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
