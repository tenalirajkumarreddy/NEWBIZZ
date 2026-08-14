"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { PermissionToggleList, type PermissionState } from "../PermissionToggleList";
import {
  grantPermission,
  revokePermission,
  setUserRole,
} from "@/lib/actions/users";
import type { UserRow, PermissionRow, RoleRow, UserOverride } from "@/lib/data/users";

// AccessControl — admin-only section on the profile page. Holds the single-role
// selector and the per-permission toggle matrix (Option A semantics from the
// spec: ON = works for the user; flipping OFF on a role-granted permission
// creates a deny override so it stays off).

export function AccessControl({
  user,
  permissions,
  roles,
  overrides,
}: {
  user: UserRow;
  permissions: PermissionRow[];
  roles: RoleRow[];
  overrides: UserOverride[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [states, setStates] = useState<Record<string, PermissionState>>(() =>
    computeStates(user, permissions, roles, overrides),
  );

  const isAdminRole = user.roles.some((r) => r.code === "admin");
  const suspended = user.status === "suspended";
  const enabled = !isAdminRole && !suspended;

  const overrideByCode = useMemo(() => {
    const map = new Map<string, UserOverride>();
    for (const o of overrides) map.set(o.permission, o);
    return map;
  }, [overrides]);

  const roleGrantCodes = useMemo(() => {
    const set = new Set<string>();
    for (const ur of user.roles) {
      const role = roles.find((r) => r.code === ur.code);
      if (!role) continue;
      for (const p of role.permissions) {
        if (p.scope !== "none") set.add(p.permission);
      }
    }
    return set;
  }, [user.roles, roles]);

  const currentRoleCode = user.roles[0]?.code ?? "";

  async function handleRoleChange(code: string) {
    if (!code || code === currentRoleCode) return;
    setBusy("role");
    try {
      await setUserRole(user.id, code);
      toast.success("Role updated", "All role-based permissions were replaced.");
      router.refresh();
    } catch (e) {
      toast.error("Could not change role", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(null);
    }
  }

  async function handleToggle(code: string, on: boolean) {
    if (!enabled) return;
    const prev = states[code] ?? { on: false, source: null };
    setBusy(code);
    // Optimistic update, reverted on failure.
    setStates((s) => ({
      ...s,
      [code]: { on, source: on ? "Override · grant" : "Deny override" },
    }));
    try {
      if (on) {
        // Drop any existing override; grant explicitly only when the role
        // doesn't already provide it.
        await revokePermission(user.id, code);
        if (!roleGrantCodes.has(code)) await grantPermission(user.id, code, "grant");
      } else {
        // Guarantee OFF: create a deny override unless one already exists.
        if (!overrideByCode.get(code)) await grantPermission(user.id, code, "deny");
      }
      toast.success(on ? "Permission granted" : "Permission denied");
      router.refresh();
    } catch (e) {
      toast.error("Could not update permission", e instanceof Error ? e.message : undefined);
      setStates((s) => ({ ...s, [code]: prev }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Role selector */}
      <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-ink-3 uppercase tracking-wider">
            Role
          </h3>
          <span className="text-[11px] text-ink-4">One role per user</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={currentRoleCode}
            disabled={busy === "role"}
            onChange={(e) => handleRoleChange(e.target.value)}
            className="w-[220px]"
          >
            <option value="">— No role —</option>
            {roles.map((r) => (
              <option key={r.code} value={r.code}>
                {r.name}
              </option>
            ))}
          </Select>
          {busy === "role" && (
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-ink-4 border-t-transparent" />
          )}
          <span className="text-[12px] text-ink-4">
            Changing the role replaces the current one and re-derives all
            role-based permissions.
          </span>
        </div>
      </div>

      {/* Permission toggles */}
      <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-ink-3 uppercase tracking-wider">
            Permissions &amp; access
          </h3>
          {!enabled && (
            <span className="text-[11px] text-amb">
              {suspended
                ? "Suspended — permissions frozen"
                : "Admin role bypasses checks"}
            </span>
          )}
        </div>
        <PermissionToggleList
          permissions={permissions}
          states={states}
          enabled={enabled}
          busy={busy}
          onToggle={handleToggle}
        />
        <div
          className={cn(
            "mt-4 rounded-lg bg-fill px-3.5 py-2.5 text-[11.5px] leading-relaxed text-ink-4",
          )}
        >
          ON = the permission works for this user. Flipping OFF on a permission
          their role grants creates a <strong>deny override</strong> so it stays
          off. Per-user overrides always beat role permissions.
        </div>
      </div>
    </div>
  );
}

function computeStates(
  user: UserRow,
  permissions: PermissionRow[],
  roles: RoleRow[],
  overrides: UserOverride[],
): Record<string, PermissionState> {
  const overrideByCode = new Map(overrides.map((o) => [o.permission, o]));
  const roleGrantCodes = new Set<string>();
  const roleNames = user.roles.map((ur) => ur.name);
  for (const ur of user.roles) {
    const role = roles.find((r) => r.code === ur.code);
    if (!role) continue;
    for (const p of role.permissions) {
      if (p.scope !== "none") roleGrantCodes.add(p.permission);
    }
  }

  const states: Record<string, PermissionState> = {};
  for (const p of permissions) {
    const ov = overrideByCode.get(p.code);
    if (ov && ov.effect === "deny") {
      states[p.code] = { on: false, source: "Deny override" };
    } else if (ov) {
      states[p.code] = { on: true, source: "Override · grant" };
    } else if (roleGrantCodes.has(p.code)) {
      states[p.code] = { on: true, source: `Role · ${roleNames.join(", ")}` };
    } else {
      states[p.code] = { on: false, source: null };
    }
  }
  return states;
}
