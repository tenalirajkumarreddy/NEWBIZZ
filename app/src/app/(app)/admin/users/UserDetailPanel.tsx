"use client";

import { useState, useEffect } from "react";
import { StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import {
  setUserStatus as setStatus,
  getUserOverridesAction,
  grantPermission,
  revokePermission,
} from "@/lib/actions/users";
import type { UserRow, PermissionRow, UserOverride } from "@/lib/data/users";

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

export function UserDetailPanel({
  user,
  permissions,
}: {
  user: UserRow;
  permissions: PermissionRow[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [overrides, setOverrides] = useState<UserOverride[]>([]);
  const [loadingOverrides, setLoadingOverrides] = useState(false);
  const [confirmSuspend, setConfirmSuspend] = useState(false);

  const [addingOverride, setAddingOverride] = useState(false);
  const [overridePerm, setOverridePerm] = useState("");
  const [overrideEffect, setOverrideEffect] = useState<"grant" | "deny">("grant");
  const [overrideReason, setOverrideReason] = useState("");

  const isAdminRole = user.roles.some((r) => r.code === "admin");

  useEffect(() => {
    setLoadingOverrides(true);
    getUserOverridesAction(user.id)
      .then(setOverrides)
      .catch(() => {})
      .finally(() => setLoadingOverrides(false));
  }, [user.id]);

  async function handleToggleOverride(o: UserOverride) {
    try {
      await revokePermission(user.id, o.permission);
      setOverrides((prev) => prev.filter((p) => p.permission !== o.permission));
      toast.success("Override removed");
      router.refresh();
    } catch {
      toast.error("Failed to remove override");
    }
  }

  async function handleAddOverride() {
    if (!overridePerm) return;
    try {
      await grantPermission(user.id, overridePerm, overrideEffect, undefined, overrideReason || undefined);
      setAddingOverride(false);
      setOverridePerm("");
      setOverrideEffect("grant");
      setOverrideReason("");
      const updated = await getUserOverridesAction(user.id);
      setOverrides(updated);
      toast.success("Override added");
      router.refresh();
    } catch {
      toast.error("Failed to add override");
    }
  }

  async function handleStatusChange(status: string) {
    try {
      await setStatus(user.id, status);
      toast.success(status === "suspended" ? "User suspended" : "User reactivated");
      router.refresh();
    } catch {
      toast.error("Failed to update user");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* User Card */}
      <div className="rounded-xl border border-line bg-surface shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h3 className="text-[13px] font-semibold text-ink-3 uppercase tracking-wider">Profile</h3>
          <StatusBadge status={user.status} size="sm" />
        </div>
        <div className="p-5">
          <div className="mb-4 flex items-center gap-3.5">
            <div className="relative flex h-[48px] w-[48px] shrink-0 items-center justify-center rounded-full bg-brand/10 text-[16px] font-bold text-brand">
              {initials(user.fullName)}
              {isAdminRole && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-amb text-[8px] font-bold text-white shadow-sm">
                  ★
                </span>
              )}
            </div>
            <div className="min-w-0">
              <div className="truncate text-[15px] font-bold text-ink">{user.fullName}</div>
              <div className="font-mono text-[12px] text-ink-4">{user.phone ?? "—"}</div>
              {user.email && (
                <div className="truncate text-[12px] text-ink-3">{user.email}</div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {user.roles.map((r) => {
              const c = roleChip(r.code);
              return (
                <span
                  key={r.code}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-semibold leading-none",
                    c.bg, c.text
                  )}
                >
                  {r.name}
                </span>
              );
            })}
          </div>

          {isAdminRole && (
            <div className="mt-4 rounded-lg bg-amb/10 px-3.5 py-2.5 text-[12px] text-amb leading-relaxed">
              <span className="font-bold">Admin role</span> bypasses all permission checks. Overrides below don't apply while this role is held.
            </div>
          )}
        </div>
      </div>

      {/* Permission Overrides */}
      <div className="rounded-xl border border-line bg-surface shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h3 className="text-[13px] font-semibold text-ink-3 uppercase tracking-wider">
            Permission overrides
            {overrides.length > 0 && (
              <span className="ml-2 text-[11px] font-mono font-normal text-ink-4">({overrides.length})</span>
            )}
          </h3>
        </div>
        <div className="p-4">
          {loadingOverrides ? (
            <div className="flex items-center justify-center gap-2 py-8 text-[12px] text-ink-4">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-ink-4 border-t-transparent" />
              Loading overrides…
            </div>
          ) : overrides.length === 0 && !addingOverride ? (
            <div className="py-6 text-center text-[12px] text-ink-4">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-2 h-6 w-6 text-ink-4/50">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
              No overrides yet
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {overrides.map((o) => (
                <div
                  key={o.permission}
                  className={cn(
                    "group flex items-center justify-between rounded-lg px-3.5 py-2.5 transition-colors",
                    o.effect === "deny"
                      ? "hover:bg-red/5"
                      : "hover:bg-brand/5"
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold leading-none",
                        o.effect === "deny"
                          ? "bg-red/10 text-red"
                          : "bg-brand/10 text-brand"
                      )}>
                        {o.effect === "deny" ? "—" : "+"}
                      </span>
                      <span className="truncate font-mono text-[12.5px] font-medium text-ink">
                        {o.permission}
                      </span>
                    </div>
                    <div className="ml-7 mt-0.5 text-[11px] text-ink-4">
                      {o.effect === "grant" ? "Granted" : "Denied"}
                      {o.expiresAt && (
                        <span> · expires <span className="font-mono text-[10px]">{new Date(o.expiresAt).toLocaleDateString()}</span></span>
                      )}
                      {o.reason && <span> · {o.reason}</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => handleToggleOverride(o)}
                    className={cn(
                      "relative h-6 w-10 shrink-0 rounded-full transition-colors",
                      o.effect === "deny"
                        ? "bg-red/30 group-hover:bg-red/40"
                        : "bg-brand/70 group-hover:bg-brand"
                    )}
                    title={o.effect === "deny" ? "Click to remove deny" : "Click to remove grant"}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-150",
                        o.effect === "deny" ? "left-0.5" : "left-[14px]"
                      )}
                    />
                  </button>
                </div>
              ))}
            </div>
          )}

          {addingOverride && (
            <div className="mt-4 rounded-lg border border-line bg-fill/50 p-4">
              <h4 className="mb-3 text-[12px] font-semibold text-ink">New override</h4>
              <div className="flex flex-col gap-3">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-ink-3">Permission</label>
                  <select
                    value={overridePerm}
                    onChange={(e) => setOverridePerm(e.target.value)}
                    className="w-full rounded-lg border border-line bg-white px-3 py-2 text-[12px] text-ink focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                  >
                    <option value="">Select a permission…</option>
                    {permissions.map((p) => (
                      <option key={p.code} value={p.code}>{p.code}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-3">
                  {(["grant", "deny"] as const).map((e) => (
                    <button
                      key={e}
                      onClick={() => setOverrideEffect(e)}
                      className={cn(
                        "flex-1 rounded-lg border px-3 py-2 text-[12px] font-medium transition-all",
                        overrideEffect === e
                          ? e === "deny"
                            ? "border-red/30 bg-red/5 text-red"
                            : "border-brand/30 bg-brand/5 text-brand"
                          : "border-line bg-white text-ink-3 hover:text-ink"
                      )}
                    >
                      {e === "grant" ? "Grant" : "Deny"}
                    </button>
                  ))}
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-ink-3">Reason (optional)</label>
                  <input
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    placeholder="Why this override?"
                    className="w-full rounded-lg border border-line bg-white px-3 py-2 text-[12px] text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="ghost" size="sm" onClick={() => { setAddingOverride(false); setOverridePerm(""); }}>Cancel</Button>
                  <Button variant="primary" size="sm" disabled={!overridePerm} onClick={handleAddOverride}>Apply</Button>
                </div>
              </div>
            </div>
          )}

          {!addingOverride && (
            <button
              onClick={() => setAddingOverride(true)}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-line py-2.5 text-[12px] font-medium text-ink-3 transition-colors hover:border-brand/30 hover:text-brand hover:bg-brand/5"
            >
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <path d="M10 4.167v11.666M4.167 10h11.666" />
              </svg>
              Add override
            </button>
          )}

          <div className="mt-4 rounded-lg bg-fill px-3.5 py-2.5 text-[11.5px] text-ink-4 leading-relaxed">
            Overrides take effect <strong>immediately</strong>. Deny always wins over any role-based grant.
          </div>
        </div>
      </div>

      {/* Kill-switch */}
      <div className="rounded-xl border border-red/15 bg-surface shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 border-b border-red/10 px-5 py-3">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-red">
            <path d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z" />
            <path d="M10 6v4M10 14h.01" />
          </svg>
          <h3 className="text-[13px] font-semibold text-red uppercase tracking-wider">Kill-switch</h3>
        </div>
        <div className="p-5">
          <p className="mb-4 text-[12px] text-ink-3 leading-relaxed">
            Suspending a user drops them to <strong>zero permissions</strong> instantly, regardless of roles, and bumps their token version to force a refresh on all devices.
          </p>
          {user.status === "suspended" ? (
            <Button variant="primary" size="sm" block onClick={() => handleStatusChange("active")}>
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <path d="M4.167 10h11.666" />
              </svg>
              Reactivate user
            </Button>
          ) : (
            <Button variant="danger" size="sm" block onClick={() => setConfirmSuspend(true)}>
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <path d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z" />
                <path d="M6 10h8" />
              </svg>
              Suspend user
            </Button>
          )}
        </div>
      </div>

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
