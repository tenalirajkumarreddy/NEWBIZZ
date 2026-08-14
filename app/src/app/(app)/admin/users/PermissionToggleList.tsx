"use client";

import { Toggle, Tooltip } from "@/components/ui";
import { cn } from "@/lib/cn";
import { groupPermissions } from "@/lib/permission-groups";
import type { PermissionRow } from "@/lib/data/users";

// PermissionToggleList — the shared toggle matrix used by both the per-user
// Permissions & access section and the roles page. Permissions are grouped by
// their dot-prefix page (see lib/permission-groups.ts). Each row carries a ⓘ
// tooltip with the permission's description and, when known, its source (role
// vs override).

export interface PermissionState {
  on: boolean;
  /** Short provenance shown in the tooltip, e.g. "Role · Sales" / "Deny override". */
  source?: string | null;
}

export interface PermissionToggleListProps {
  permissions: PermissionRow[];
  /** Effective per-code state. Missing codes default to off. */
  states?: Record<string, PermissionState>;
  /** Master gate — toggles render disabled when false (admin-role / suspended). */
  enabled?: boolean;
  /** Permission code currently mutating, shown as a spinner on that row. */
  busy?: string | null;
  /** Extra tooltip text appended to every row (roles-page context). */
  contextNote?: string;
  onToggle: (code: string, on: boolean) => void;
}

export function PermissionToggleList({
  permissions,
  states = {},
  enabled = true,
  busy = null,
  contextNote,
  onToggle,
}: PermissionToggleListProps) {
  const groups = groupPermissions(permissions);

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <div key={group.page}>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-4">
            {group.label}
          </div>
          <div className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
            {group.items.map((p) => {
              const st = states[p.code] ?? { on: false, source: null };
              const note = [p.description, st.source, contextNote]
                .filter(Boolean)
                .join(" · ");
              return (
                <div
                  key={p.code}
                  className={cn(
                    "flex items-center gap-3 px-3.5 py-2.5",
                    !enabled && "opacity-60",
                  )}
                >
                  <Tooltip text={note} />
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-[12.5px] font-medium text-ink">
                      {p.code}
                    </div>
                    <div className="truncate text-[11px] text-ink-4">
                      {p.description}
                    </div>
                  </div>
                  <div className="shrink-0">
                    {busy === p.code ? (
                      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-ink-4 border-t-transparent" />
                    ) : (
                      <Toggle
                        checked={st.on}
                        disabled={!enabled}
                        size="md"
                        aria-label={`${p.code}: ${st.on ? "allowed" : "not allowed"}`}
                        onCheckedChange={(on) => onToggle(p.code, on)}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
