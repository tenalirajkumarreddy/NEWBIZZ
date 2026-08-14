"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { dateIST } from "@/lib/format";
import { setUserStatus } from "@/lib/actions/users";
import type { UserRow } from "@/lib/data/users";

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

const ROLE_CHIP: Record<string, { bg: string; text: string }> = {
  admin:      { bg: "bg-amb/15",      text: "text-amb" },
  agent:      { bg: "bg-orange-100 dark:bg-orange-900/25", text: "text-orange-700 dark:text-orange-300" },
  sales:      { bg: "bg-brand/12",    text: "text-brand" },
  accountant: { bg: "bg-purple-100 dark:bg-purple-900/25", text: "text-purple-700 dark:text-purple-300" },
  manager:    { bg: "bg-emerald-100 dark:bg-emerald-900/25", text: "text-emerald-700 dark:text-emerald-300" },
  operator:   { bg: "bg-slate-100 dark:bg-slate-800", text: "text-slate-600 dark:text-slate-300" },
};

function roleChip(code: string) {
  return ROLE_CHIP[code] ?? { bg: "bg-fill", text: "text-ink-2" };
}

export function ProfileHeader({ user }: { user: UserRow }) {
  const router = useRouter();
  const toast = useToast();
  const [confirmSuspend, setConfirmSuspend] = useState(false);
  const [busy, setBusy] = useState(false);

  const isAdminRole = user.roles.some((r) => r.code === "admin");

  async function handleStatusChange(status: string) {
    if (busy) return;
    setBusy(true);
    try {
      await setUserStatus(user.id, status);
      toast.success(status === "suspended" ? "User suspended" : "User reactivated");
      router.refresh();
    } catch (e) {
      toast.error("Failed to update user", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand/10 text-[18px] font-bold text-brand">
            {initials(user.fullName)}
            {isAdminRole && (
              <span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-amb text-[10px] font-bold text-white shadow-sm">
                ★
              </span>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[18px] font-bold tracking-tight text-ink">
                {user.fullName}
              </h1>
              <StatusBadge status={user.status} size="sm" />
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {user.roles.length > 0 ? (
                user.roles.map((r) => {
                  const c = roleChip(r.code);
                  return (
                    <span
                      key={r.code}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-semibold leading-none",
                        c.bg, c.text,
                      )}
                    >
                      {r.name}
                    </span>
                  );
                })
              ) : (
                <span className="rounded-full bg-fill px-3 py-1 text-[11px] font-medium text-ink-4">
                  No role
                </span>
              )}
            </div>
            <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[12px] text-ink-3">
              {user.phone && (
                <div className="flex items-center gap-1.5">
                  <dt className="text-ink-4">Phone</dt>
                  <dd className="font-mono">{user.phone}</dd>
                </div>
              )}
              {user.email && (
                <div className="flex items-center gap-1.5">
                  <dt className="text-ink-4">Email</dt>
                  <dd>{user.email}</dd>
                </div>
              )}
              {user.branchName && (
                <div className="flex items-center gap-1.5">
                  <dt className="text-ink-4">Branch</dt>
                  <dd>{user.branchName}</dd>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <dt className="text-ink-4">Member since</dt>
                <dd>{dateIST(user.createdAt)}</dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="shrink-0">
          {user.status === "suspended" ? (
            <Button
              variant="primary"
              size="sm"
              loading={busy}
              onClick={() => handleStatusChange("active")}
            >
              Reactivate user
            </Button>
          ) : (
            <Button
              variant="danger"
              size="sm"
              loading={busy}
              onClick={() => setConfirmSuspend(true)}
            >
              Suspend user
            </Button>
          )}
        </div>
      </div>

      {isAdminRole && (
        <div className="border-t border-line bg-amb/10 px-5 py-2.5 text-[12px] text-amb leading-relaxed">
          <span className="font-bold">Admin role</span> bypasses all permission
          checks — per-permission toggles below don't apply while this role is held.
        </div>
      )}

      <ConfirmDialog
        open={confirmSuspend}
        onClose={() => setConfirmSuspend(false)}
        onConfirm={() => handleStatusChange("suspended")}
        title={`Suspend ${user.fullName}?`}
        description="This will immediately revoke all permissions and force a logout on all devices."
        confirmLabel="Suspend"
        danger
      />
    </div>
  );
}
