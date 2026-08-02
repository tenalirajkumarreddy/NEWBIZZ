"use client";

// =====================================================================
// components/shell/NotificationsBell.tsx — the live notifications bell in
// the topbar. Self-sufficient: fetches the signed-in user's recent items
// + unread count through the RLS-scoped browser client, shows a dropdown,
// marks read on click, and links through to /notifications.
// =====================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { NotificationRow } from "@/lib/data/types";
import { markAllNotificationsRead, markNotificationsRead } from "@/lib/actions/notifications";
import { categoryLabel, timeAgoShort } from "./notificationLabels";

const RECENT_LIMIT = 8;

export function NotificationsBell() {
  const supabase = createClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busyAll, setBusyAll] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [listRes, countRes] = await Promise.all([
      supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(RECENT_LIMIT),
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("status", "unread"),
    ]);
    if (!listRes.error) setItems((listRes.data ?? []).slice(0, RECENT_LIMIT));
    if (!countRes.error) setUnread(countRes.count ?? 0);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  // Live updates: the notifications table is in the supabase_realtime
  // publication. RLS scopes the broadcast to the signed-in user's rows, so
  // any change (new event, mark-read elsewhere, archive) re-syncs the badge
  // and dropdown without a manual refresh.
  useEffect(() => {
    const channel = supabase
      .channel("notifications-bell")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        () => {
          void load();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, load]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle() {
    if (!open) void load();
    setOpen((v) => !v);
  }

  async function openItem(n: NotificationRow) {
    setOpen(false);
    if (n.status === "unread") {
      await markNotificationsRead([n.id]);
      setUnread((v) => Math.max(0, v - 1));
      router.refresh();
    }
    router.push(n.action_url || "/notifications");
  }

  async function markAll() {
    setBusyAll(true);
    const res = await markAllNotificationsRead();
    if (res.ok) {
      setUnread(0);
      setItems((prev) => prev.map((n) => (n.status === "unread" ? { ...n, status: "read" } : n)));
    }
    setBusyAll(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={toggle}
        aria-label="Notifications"
        aria-haspopup="dialog"
        aria-expanded={open}
        className="relative grid h-8 w-8 place-items-center rounded-lg border border-line bg-white text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
      >
        <BellGlyph />
        {unread > 0 && (
          <span className="absolute right-1.5 top-1.5 grid h-[15px] min-w-[15px] place-items-center rounded-full border border-white bg-red px-0.5 font-mono text-[9px] font-bold leading-none text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-[340px] overflow-hidden rounded-lg border border-line bg-surface shadow-pop"
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <span className="text-[13px] font-semibold text-ink">Notifications</span>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAll}
                disabled={busyAll}
                className="text-[12px] font-medium text-brand transition-colors hover:text-brand-d disabled:opacity-50"
              >
                {busyAll ? "Marking…" : "Mark all read"}
              </button>
            )}
          </div>

          <div className="max-h-[360px] overflow-y-auto">
            {loading && items.length === 0 ? (
              <div className="px-4 py-8 text-center text-[12px] text-ink-4">Loading…</div>
            ) : items.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <div className="text-[13px] font-medium text-ink">Nothing yet</div>
                <div className="mt-0.5 text-[12px] text-ink-4">
                  Order, invoice and collection events will land here.
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {items.map((n) => {
                  const unreadItem = n.status === "unread";
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => openItem(n)}
                        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-fill"
                      >
                        <span
                          className={`mt-1 h-2 w-2 shrink-0 rounded-full ${unreadItem ? "bg-brand" : "bg-line-strong"}`}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2">
                            <span
                              className={`truncate text-[13px] ${unreadItem ? "font-semibold text-ink" : "font-medium text-ink-2"}`}
                            >
                              {n.title}
                            </span>
                            <time className="shrink-0 font-mono text-[11px] text-ink-4">
                              {timeAgoShort(n.created_at)}
                            </time>
                          </span>
                          {n.body && (
                            <span className="mt-0.5 line-clamp-1 block text-[12px] text-ink-4">
                              {n.body}
                            </span>
                          )}
                          {categoryLabel(n.category) && (
                            <span className="mt-1 inline-block rounded border border-line bg-white px-1.5 py-px text-[10px] font-medium uppercase tracking-[0.05em] text-ink-3">
                              {categoryLabel(n.category)}
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-t border-line p-1">
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="block rounded-[7px] px-3 py-2 text-center text-[12px] font-medium text-brand transition-colors hover:bg-fill"
            >
              View all notifications →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function BellGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
