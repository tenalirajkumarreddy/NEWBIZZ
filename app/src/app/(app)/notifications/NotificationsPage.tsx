"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge, Button, Table, THead, TBody, TR, TH, TD, EmptyState, Kpi, Panel } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { markNotificationsRead, markAllNotificationsRead, archiveNotifications } from "@/lib/actions/notifications";
import { CATEGORY_LABELS } from "@/components/shell/notificationLabels";
import type { NotificationRow } from "@/lib/data/types";

interface Props {
  rows: NotificationRow[];
  total: number;
  hasMore: boolean;
}

type Tab = "unread" | "read" | "archived";

const SEVERITY_TONE: Record<string, "neutral" | "slate" | "brand" | "grn" | "amb" | "red"> = {
  info: "neutral",
  success: "grn",
  warning: "amb",
  critical: "red",
};

export function NotificationsPage({ rows, total, hasMore }: Props) {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("unread");
  const [items, setItems] = useState<NotificationRow[]>(rows);
  const [allCount, setAllCount] = useState(total);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const visible = items.filter((n) => n.status === tab);
  const unread = items.filter((n) => n.status === "unread").length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function run(
    fn: () => Promise<{ ok: boolean; error?: string }>,
    successMsg: string,
    transform: (items: NotificationRow[]) => NotificationRow[],
  ) {
    setBusy(true);
    try {
      const res = await fn();
      if (res.ok) {
        toast.success(successMsg);
        setSelected(new Set());
        setItems((prev) => transform(prev));
      } else {
        toast.error(res.error ?? "Failed");
      }
    } catch (err: any) {
      toast.error(err.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleMarkRead() {
    const ids = [...selected];
    if (ids.length === 0) {
      await run(
        () => markAllNotificationsRead(),
        "All notifications marked read",
        (items) => items.map((n) => (n.status === "unread" ? { ...n, status: "read" } : n)),
      );
      return;
    }
    await run(
      () => markNotificationsRead(ids),
      `${ids.length} marked read`,
      (items) => items.map((n) => (ids.includes(n.id) ? { ...n, status: "read" } : n)),
    );
  }

  async function handleArchive() {
    const ids = [...selected];
    if (ids.length === 0) return;
    await run(
      () => archiveNotifications(ids),
      `${ids.length} archived`,
      (items) => items.map((n) => (ids.includes(n.id) ? { ...n, status: "archived" } : n)),
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "unread", label: "Unread" },
    { key: "read", label: "Read" },
    { key: "archived", label: "Archived" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Unread" value={unread} tone={unread > 0 ? "amb" : "grn"} />
        <Kpi label="Read" value={items.filter((n) => n.status === "read").length} />
        <Kpi label="Archived" value={items.filter((n) => n.status === "archived").length} />
        <Kpi label="Total" value={allCount} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 overflow-x-auto rounded-lg border border-line p-0.5">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-md px-3 py-1 text-[12px] font-medium capitalize transition-colors ${
                tab === t.key ? "bg-fill text-ink" : "text-ink-3 hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <>
              <Button variant="secondary" size="sm" onClick={handleMarkRead} disabled={busy}>
                Mark read
              </Button>
              <Button variant="secondary" size="sm" onClick={handleArchive} disabled={busy}>
                Archive
              </Button>
            </>
          )}
          {unread > 0 && (
            <Button variant="secondary" size="sm" onClick={handleMarkRead} disabled={busy}>
              Mark all read
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-line">
        <Table>
          <THead>
            <TR>
              <TH className="w-10">
                <input
                  type="checkbox"
                  className="rounded border-line accent-brand"
                  checked={visible.length > 0 && visible.every((n) => selected.has(n.id))}
                  onChange={(e) => {
                    const next = new Set(selected);
                    if (e.target.checked) visible.forEach((n) => next.add(n.id));
                    else visible.forEach((n) => next.delete(n.id));
                    setSelected(next);
                  }}
                />
              </TH>
              <TH>Severity</TH>
              <TH>Category</TH>
              <TH>Message</TH>
              <TH>When</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <TBody>
            {visible.length === 0 && (
              <TR>
                <TD colSpan={6} className="px-0 py-0">
                  <EmptyState
                    title={tab === "unread" ? "You're all caught up" : "Nothing here"}
                    description={
                      tab === "unread"
                        ? "Orders, invoices, collections and system alerts will land here the moment they happen."
                        : "Rows in this state will appear here."
                    }
                  />
                </TD>
              </TR>
            )}
            {visible.map((n) => (
              <TR key={n.id} className={n.status === "unread" ? "bg-brand/[0.03]" : undefined}>
                <TD>
                  <input
                    type="checkbox"
                    className="rounded border-line accent-brand"
                    checked={selected.has(n.id)}
                    onChange={() => toggle(n.id)}
                  />
                </TD>
                <TD>
                  <Badge tone={SEVERITY_TONE[n.severity] ?? "neutral"}>{n.severity}</Badge>
                </TD>
                <TD className="text-[13px] text-ink-3">{CATEGORY_LABELS[n.category ?? ""] ?? n.category ?? "—"}</TD>
                <TD className="min-w-[280px] max-w-[420px]">
                  <div className="flex items-start gap-2">
                    {n.action_url && (
                      <Link href={n.action_url} className="shrink-0 text-[12px] font-semibold text-brand hover:underline">
                        →
                      </Link>
                    )}
                    <div className="min-w-0">
                      <p className={`text-[13px] ${n.status === "unread" ? "font-semibold text-ink" : "text-ink"}`}>{n.title}</p>
                      {n.body && <p className="mt-0.5 line-clamp-2 text-[12px] text-ink-4">{n.body}</p>}
                    </div>
                  </div>
                </TD>
                <TD className="whitespace-nowrap font-mono text-[12px] text-ink-3">{fmtTime(n.created_at)}</TD>
                <TD>
                  <Badge tone={n.status === "unread" ? "brand" : n.status === "archived" ? "slate" : "neutral"}>
                    {n.status}
                  </Badge>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>

      {hasMore && (
        <Panel>
          <p className="py-2 text-center text-[12px] text-ink-4">
            Showing the latest {items.length} of {allCount}. Older items are available via the archive.
          </p>
        </Panel>
      )}
    </div>
  );
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}
