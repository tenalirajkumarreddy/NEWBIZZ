"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { cn } from "@/lib/cn";
import { InviteDrawer } from "./InviteDrawer";
import { UserDetailPanel } from "./UserDetailPanel";
import type { UserRow, PermissionRow, RoleRow } from "@/lib/data/users";

const FILTERS = ["All", "Active", "Pending review", "Suspended"] as const;
type Filter = (typeof FILTERS)[number];

const ROLE_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  admin:      { bg: "bg-amb/15",  text: "text-amb",    dot: "bg-amb" },
  agent:      { bg: "bg-orange-100 dark:bg-orange-900/25", text: "text-orange-700 dark:text-orange-300", dot: "bg-orange-500" },
  sales:      { bg: "bg-brand/12", text: "text-brand",  dot: "bg-brand" },
  accountant: { bg: "bg-purple-100 dark:bg-purple-900/25", text: "text-purple-700 dark:text-purple-300", dot: "bg-purple-500" },
  manager:    { bg: "bg-emerald-100 dark:bg-emerald-900/25", text: "text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500" },
  operator:   { bg: "bg-slate-100 dark:bg-slate-800", text: "text-slate-600 dark:text-slate-300", dot: "bg-slate-400" },
};

function roleColor(code: string) {
  return ROLE_COLORS[code] ?? { bg: "bg-fill", text: "text-ink-2", dot: "bg-ink-3" };
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5 shrink-0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7.333 12.667A5.333 5.333 0 1 0 7.333 2a5.333 5.333 0 0 0 0 10.667ZM14 14l-2.9-2.9" />
    </svg>
  );
}

export function UsersPage({
  users: allUsers,
  permissions,
  roles,
}: {
  users: UserRow[];
  permissions: PermissionRow[];
  roles: RoleRow[];
}) {
  const [filter, setFilter] = useState<Filter>("All");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const filtered = useMemo(() => {
    let list = allUsers;
    if (filter !== "All") {
      list = list.filter((u) => u.status === filter.toLowerCase().replace(" ", "_"));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (u) =>
          u.fullName.toLowerCase().includes(q) ||
          (u.phone && u.phone.includes(q))
      );
    }
    return list;
  }, [allUsers, filter, search]);

  const selected = allUsers.find((u) => u.id === selectedId) ?? null;

  const counts = useMemo(() => {
    const active = allUsers.filter((u) => u.status === "active").length;
    const pending = allUsers.filter((u) => u.status === "pending_review").length;
    const suspended = allUsers.filter((u) => u.status === "suspended").length;
    return { total: allUsers.length, active, pending, suspended };
  }, [allUsers]);

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="text-ink-3">
            <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 10h10M5 5h10M5 15h6" />
            </svg>
            Roles &amp; permissions
          </Button>
        </div>
        <Button variant="primary" size="sm" onClick={() => setInviteOpen(true)}>
          <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 4.167v11.666M4.167 10h11.666" />
          </svg>
          Invite user
        </Button>
      </div>

      <div className="grid grid-cols-[1fr_380px] gap-6">
        {/* LEFT COLUMN */}
        <div className="flex flex-col gap-4">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-0 rounded-lg border border-line bg-surface p-0.5 shadow-sm">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-[12px] font-medium transition-all",
                    filter === f
                      ? "bg-white text-ink shadow-sm"
                      : "text-ink-3 hover:text-ink"
                  )}
                >
                  {f}
                  {f !== "All" && (
                    <span className={cn(
                      "ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none",
                      filter === f ? "bg-ink/10 text-ink" : "bg-fill text-ink-4"
                    )}>
                      {f === "Active" ? counts.active : f === "Pending review" ? counts.pending : counts.suspended}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="relative">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3">
                <SearchIcon />
              </span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or phone…"
                className="h-[34px] w-[200px] rounded-lg border border-line bg-surface pl-8 pr-3 text-[13px] text-ink placeholder:text-ink-4 transition-shadow focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
              />
            </div>

            <div className="flex-1" />

            <span className="text-[12px] font-mono text-ink-4 whitespace-nowrap tabular-nums">
              {counts.total} user{counts.total !== 1 ? "s" : ""}
              {counts.pending > 0 && (
                <span className="text-amb"> · {counts.pending} pending</span>
              )}
              {counts.suspended > 0 && (
                <span className="text-red"> · {counts.suspended} suspended</span>
              )}
            </span>
          </div>

          {/* Table */}
          <div className="rounded-xl border border-line bg-surface shadow-sm overflow-hidden">
            {filtered.length === 0 ? (
              <EmptyState
                title="No users found"
                description={search ? "Try a different search term or clear the filter." : "Invite your first user to get started."}
                action={
                  !search ? (
                    <Button variant="primary" size="sm" onClick={() => setInviteOpen(true)}>
                      + Invite user
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>User</TH>
                    <TH>Roles</TH>
                    <TH>Status</TH>
                    <TH className="w-10" />
                  </TR>
                </THead>
                <TBody>
                  {filtered.map((u) => {
                    const sel = selectedId === u.id;
                    return (
                      <TR
                        key={u.id}
                        interactive
                        selected={sel}
                        className="group"
                        onClick={() => setSelectedId(sel ? null : u.id)}
                      >
                        <TD>
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "relative flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-full text-[12px] font-bold transition-colors",
                              sel ? "bg-brand text-white" : "bg-brand/10 text-brand"
                            )}>
                              {initials(u.fullName)}
                              {sel && (
                                <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white">
                                  <span className="h-2 w-2 rounded-full bg-brand" />
                                </span>
                              )}
                            </div>
                            <div>
                              <div className={cn(
                                "font-medium transition-colors",
                                sel ? "text-brand" : "text-ink"
                              )}>
                                {u.fullName}
                              </div>
                              <div className="text-[12px] font-mono text-ink-4">
                                {u.phone ?? u.email ?? "—"}
                              </div>
                            </div>
                          </div>
                        </TD>
                        <TD>
                          <div className="flex flex-wrap gap-1">
                            {u.roles.length > 0
                              ? u.roles.map((r) => {
                                  const c = roleColor(r.code);
                                  return (
                                    <span
                                      key={r.code}
                                      className={cn(
                                        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold leading-none",
                                        c.bg, c.text
                                      )}
                                    >
                                      <span className={cn("h-1.5 w-1.5 rounded-full", c.dot)} />
                                      {r.name}
                                    </span>
                                  );
                                })
                              : <span className="text-[12px] text-ink-4">—</span>}
                          </div>
                        </TD>
                        <TD>
                          <StatusBadge status={u.status} />
                        </TD>
                        <TD>
                          <button
                            className={cn(
                              "flex h-7 w-7 items-center justify-center rounded-md text-[16px] leading-none transition-colors",
                              sel
                                ? "text-brand bg-brand/10"
                                : "text-ink-4 opacity-0 group-hover:opacity-100 hover:text-ink hover:bg-fill"
                            )}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                              <circle cx="12" cy="5" r="1" />
                              <circle cx="12" cy="12" r="1" />
                              <circle cx="12" cy="19" r="1" />
                            </svg>
                          </button>
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN */}
        {selected ? (
          <div style={{ animation: "nb-pop 0.2s cubic-bezier(0.16, 1, 0.3, 1)" }}>
            <UserDetailPanel user={selected} permissions={permissions} />
          </div>
        ) : (
          <div className="flex h-full min-h-[400px] items-center justify-center rounded-xl border border-dashed border-line bg-surface/50 text-[13px] text-ink-4">
            <div className="flex flex-col items-center gap-2 text-center px-6">
              <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8 text-ink-4/50">
                <path d="M16 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
                <path d="M24 26c0-4.418-3.582-8-8-8s-8 3.582-8 8" />
              </svg>
              <span className="text-[13px]">Select a user to view their details, permissions, and settings</span>
            </div>
          </div>
        )}
      </div>

      <InviteDrawer open={inviteOpen} onClose={() => setInviteOpen(false)} roles={roles} />
    </>
  );
}
