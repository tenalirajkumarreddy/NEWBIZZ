"use client";

import Link from "next/link";
import { EmptyState } from "@/components/ui";
import { cn } from "@/lib/cn";
import { dateTimeIST } from "@/lib/format";
import { AUDIT_ACTION_LABELS, type AuditAction, type AuditRow } from "@/lib/data/audit.types";

// ActivityTimeline — the user's recent audit trail (actions they performed),
// newest first. "View all activity" jumps to the audit log pre-filtered.

const ACTION_TONE: Record<AuditAction, string> = {
  insert: "bg-slate-100 text-ink-3",
  update: "bg-slate-100 text-ink-3",
  delete: "bg-red-wash text-red",
  approve: "bg-grn-wash text-grn",
  reject: "bg-red-wash text-red",
  post: "bg-brand/10 text-brand",
  void: "bg-amb-wash text-amb",
  login: "bg-fill text-ink-4",
};

export function ActivityTimeline({
  userId,
  rows,
}: {
  userId: string;
  rows: AuditRow[];
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No activity yet"
        description="This user hasn't recorded any auditable actions."
      />
    );
  }

  return (
    <div>
      <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
        {rows.map((r) => (
          <li key={r.id} className="flex items-start gap-3 px-4 py-3">
            <span
              className={cn(
                "mt-0.5 inline-flex h-5 shrink-0 items-center rounded px-1.5 text-[10px] font-bold uppercase tracking-wide leading-none",
                ACTION_TONE[r.action] ?? "bg-fill text-ink-4",
              )}
            >
              {AUDIT_ACTION_LABELS[r.action] ?? r.action}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] text-ink">{r.summary ?? r.entity}</div>
              <div className="mt-0.5 font-mono text-[11px] text-ink-4">
                {r.entity}
                {r.entityId ? ` · ${r.entityId}` : ""}
              </div>
            </div>
            <span className="shrink-0 text-[11px] text-ink-4">
              {dateTimeIST(r.at)}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3">
        <Link
          href={`/admin/audit?actor=${userId}`}
          className="text-[12px] font-medium text-brand hover:text-brand-d"
        >
          View all activity →
        </Link>
      </div>
    </div>
  );
}
