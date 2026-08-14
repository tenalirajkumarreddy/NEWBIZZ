"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { cn } from "@/lib/cn";
import { dateIST } from "@/lib/format";
import { InviteDrawer } from "./InviteDrawer";
import { approveUser, revokeInvitation } from "@/lib/actions/users";
import { useToast } from "@/components/ui/Toast";
import type { UserRow, RoleRow, InvitationRow } from "@/lib/data/users";

const TABS = [
  { key: "all", label: "All users" },
  { key: "pending", label: "Pending" },
  { key: "suspended", label: "Suspended" },
] as const;
type Tab = (typeof TABS)[number]["key"];

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
  invitations,
  roles,
  isAdmin,
}: {
  users: UserRow[];
  invitations: InvitationRow[];
  roles: RoleRow[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const q = search.trim().toLowerCase();
  const activeUsers = useMemo(
    () =>
      allUsers.filter(
        (u) =>
          u.status === "active" &&
          (!q ||
            u.fullName.toLowerCase().includes(q) ||
            u.phone?.toLowerCase().includes(q)),
      ),
    [allUsers, q],
  );
  const pendingUsers = useMemo(
    () =>
      allUsers.filter(
        (u) =>
          u.status === "pending_review" &&
          (!q ||
            u.fullName.toLowerCase().includes(q) ||
            u.phone?.toLowerCase().includes(q)),
      ),
    [allUsers, q],
  );
  const suspendedUsers = useMemo(
    () =>
      allUsers.filter(
        (u) =>
          u.status === "suspended" &&
          (!q ||
            u.fullName.toLowerCase().includes(q) ||
            u.phone?.toLowerCase().includes(q)),
      ),
    [allUsers, q],
  );
  const pendingInvitations = useMemo(
    () =>
      invitations.filter(
        (inv) =>
          !q ||
          inv.fullName.toLowerCase().includes(q) ||
          inv.phone?.toLowerCase().includes(q),
      ),
    [invitations, q],
  );

  const counts = {
    all: allUsers.length,
    pending: pendingUsers.length + invitations.length,
    suspended: allUsers.filter((u) => u.status === "suspended").length,
  };

  async function handleApprove(id: string) {
    if (busy) return;
    setBusy(`approve:${id}`);
    try {
      await approveUser(id);
      toast.success("User approved", "They can now sign in.");
      router.refresh();
    } catch (e) {
      toast.error("Could not approve user", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(null);
    }
  }

  async function handleRevoke(id: string) {
    if (busy) return;
    setBusy(`revoke:${id}`);
    try {
      await revokeInvitation(id);
      toast.success("Invitation revoked", "The invite has been cancelled.");
      router.refresh();
    } catch (e) {
      toast.error("Could not revoke invitation", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(null);
    }
  }

  const rows = tab === "all" ? activeUsers : tab === "suspended" ? suspendedUsers : [];

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {isAdmin && (
            <Link
              href="/admin/users/roles"
              className="inline-flex h-8 select-none items-center gap-1.5 rounded-[7px] px-3 text-[12px] font-semibold text-ink-3 transition-colors hover:bg-fill hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-1"
            >
              <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 10h10M5 5h10M5 15h6" />
              </svg>
              Roles &amp; permissions
            </Link>
          )}
        </div>
        <Button variant="primary" size="sm" onClick={() => setInviteOpen(true)}>
          <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 4.167v11.666M4.167 10h11.666" />
          </svg>
          Invite user
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-0 rounded-lg border border-line bg-surface p-0.5 shadow-sm">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "rounded-md px-3 py-1.5 text-[12px] font-medium transition-all",
                tab === t.key ? "bg-white text-ink shadow-sm" : "text-ink-3 hover:text-ink",
              )}
            >
              {t.label}
              <span
                className={cn(
                  "ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none tabular-nums",
                  tab === t.key ? "bg-ink/10 text-ink" : "bg-fill text-ink-4",
                )}
              >
                {counts[t.key]}
              </span>
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
            className="h-[34px] w-[220px] rounded-lg border border-line bg-surface pl-8 pr-3 text-[13px] text-ink placeholder:text-ink-4 transition-shadow focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
          />
        </div>

        <div className="flex-1" />

        <span className="text-[12px] font-mono text-ink-4 whitespace-nowrap tabular-nums">
          {counts.all} user{counts.all !== 1 ? "s" : ""}
          {counts.pending > 0 && <span className="text-amb"> · {counts.pending} pending</span>}
          {counts.suspended > 0 && <span className="text-red"> · {counts.suspended} suspended</span>}
        </span>
      </div>

      {/* Pending tab: self-registrations awaiting approval + sent invitations */}
      {tab === "pending" ? (
        <div className="flex flex-col gap-4">
          {pendingUsers.length === 0 && pendingInvitations.length === 0 ? (
            <div className="rounded-xl border border-line bg-surface shadow-sm">
              <EmptyState
                title="Nothing pending"
                description="No users awaiting approval and no outstanding invitations."
              />
            </div>
          ) : (
            <>
              {pendingUsers.length > 0 && (
                <PendingApprovals
                  users={pendingUsers}
                  busy={busy}
                  onApprove={handleApprove}
                />
              )}
              {pendingInvitations.length > 0 && (
                <PendingInvitations
                  invitations={pendingInvitations}
                  busy={busy}
                  onRevoke={handleRevoke}
                />
              )}
            </>
          )}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface shadow-sm">
          <EmptyState
            title={tab === "all" ? "No active users" : "No suspended users"}
            description={
              search
                ? "Try a different search term or clear the filter."
                : tab === "all"
                  ? "Invite your first user to get started."
                  : "No users are currently suspended."
            }
            action={
              tab === "all" && !search ? (
                <Button variant="primary" size="sm" onClick={() => setInviteOpen(true)}>
                  + Invite user
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
          <Table>
            <THead>
              <TR>
                <TH>User</TH>
                <TH>Roles</TH>
                <TH>Status</TH>
                <TH>Member since</TH>
                <TH className="w-10" />
              </TR>
            </THead>
            <TBody>
              {rows.map((u) => (
                <TR
                  key={u.id}
                  interactive
                  className="group"
                  onClick={() => router.push(`/admin/users/${u.id}`)}
                >
                  <TD>
                    <div className="flex items-center gap-3">
                      <div className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-full bg-brand/10 text-[12px] font-bold text-brand">
                        {initials(u.fullName)}
                      </div>
                      <div>
                        <div className="font-medium text-ink">{u.fullName}</div>
                        <div className="text-[12px] font-mono text-ink-4">
                          {u.phone ?? u.email ?? "—"}
                        </div>
                      </div>
                    </div>
                  </TD>
                  <TD>
                    <RoleChips roles={u.roles} />
                  </TD>
                  <TD>
                    <StatusBadge status={u.status} />
                  </TD>
                  <TD className="whitespace-nowrap text-[12px] text-ink-3">
                    {dateIST(u.createdAt)}
                  </TD>
                  <TD>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-4 w-4 text-ink-4 opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <path d="m9 6 6 6-6 6" />
                    </svg>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}

      <InviteDrawer open={inviteOpen} onClose={() => setInviteOpen(false)} roles={roles} />
    </>
  );
}

function RoleChips({ roles }: { roles: { code: string; name: string }[] }) {
  if (roles.length === 0) {
    return <span className="text-[12px] text-ink-4">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {roles.map((r) => {
        const c = roleColor(r.code);
        return (
          <span
            key={r.code}
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold leading-none",
              c.bg, c.text,
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", c.dot)} />
            {r.name}
          </span>
        );
      })}
    </div>
  );
}

function PendingApprovals({
  users,
  busy,
  onApprove,
}: {
  users: UserRow[];
  busy: string | null;
  onApprove: (id: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-amb/40 bg-amb-wash/40 shadow-sm">
      <div className="flex items-center justify-between border-b border-amb/30 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-semibold text-ink">Awaiting approval</span>
          <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amb/20 px-1 text-[10px] font-semibold leading-none text-amb tabular-nums">
            {users.length}
          </span>
        </div>
        <span className="text-[11px] text-ink-4">Self-registered via OTP login · no role yet</span>
      </div>
      <ul className="divide-y divide-line/70 bg-surface">
        {users.map((u) => (
          <li key={u.id} className="flex items-center gap-3 px-4 py-2.5">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amb/15 font-mono text-[12px] font-bold text-amb">
              {initials(u.fullName)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium text-ink">{u.fullName}</div>
              <div className="truncate font-mono text-[12px] text-ink-4">
                {u.phone ?? u.email ?? "—"}
              </div>
            </div>
            <span className="hidden shrink-0 text-[11px] text-ink-4 sm:block">
              Joined {dateIST(u.createdAt)}
            </span>
            <Button
              variant="primary"
              size="sm"
              className="shrink-0"
              loading={busy === `approve:${u.id}`}
              onClick={() => onApprove(u.id)}
            >
              Approve
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PendingInvitations({
  invitations,
  busy,
  onRevoke,
}: {
  invitations: InvitationRow[];
  busy: string | null;
  onRevoke: (id: string) => void;
}) {
  const expired = (iso: string) => new Date(iso).getTime() < Date.now();
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-semibold text-ink">Invitations sent</span>
          <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-fill px-1 text-[10px] font-semibold leading-none text-ink-3 tabular-nums">
            {invitations.length}
          </span>
        </div>
        <span className="text-[11px] text-ink-4">Expires in 30 days</span>
      </div>
      <ul className="divide-y divide-line/70">
        {invitations.map((inv) => {
          const exp = expired(inv.expiresAt);
          return (
            <li key={inv.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand/10 font-mono text-[12px] font-bold text-brand">
                {inv.fullName
                  .split(" ")
                  .map((w) => w[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-ink">{inv.fullName}</div>
                <div className="truncate font-mono text-[12px] text-ink-4">
                  {inv.phone}
                  {inv.email ? ` · ${inv.email}` : ""}
                </div>
              </div>
              <div className="hidden shrink-0 text-right sm:block">
                <div className={cn("font-mono text-[11px]", exp ? "text-red" : "text-ink-4")}>
                  {exp ? "expired" : "valid"}
                </div>
                <div className="font-mono text-[11px] text-ink-4">{dateIST(inv.createdAt)}</div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 text-red hover:bg-red-wash hover:text-red"
                loading={busy === `revoke:${inv.id}`}
                onClick={() => onRevoke(inv.id)}
              >
                Revoke
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
