"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Dialog, Field, Input } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { PermissionToggleList, type PermissionState } from "../PermissionToggleList";
import {
  createRoleAction,
  renameRoleAction,
  setRolePermissionAction,
} from "@/lib/actions/users";
import type { PermissionRow, RoleRow } from "@/lib/data/users";

export function RolesManagementPage({
  roles,
  permissions,
  userCounts,
}: {
  roles: RoleRow[];
  permissions: PermissionRow[];
  userCounts: Record<string, number>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [selectedCode, setSelectedCode] = useState<string>(roles[0]?.code ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<RoleRow | null>(null);

  const selected = roles.find((r) => r.code === selectedCode) ?? null;
  const isAdminRole = selected?.code === "admin";

  const states: Record<string, PermissionState> = useMemo(() => {
    const out: Record<string, PermissionState> = {};
    if (!selected) return out;
    const granted = new Set(
      selected.permissions.filter((p) => p.scope !== "none").map((p) => p.permission),
    );
    for (const p of permissions) {
      out[p.code] = { on: granted.has(p.code), source: null };
    }
    return out;
  }, [selected, permissions]);

  async function handleToggle(code: string, on: boolean) {
    if (!selected || isAdminRole) return;
    setBusy(code);
    try {
      await setRolePermissionAction(selected.code, code, on ? "all" : "none");
      toast.success(on ? "Permission granted to role" : "Permission removed from role");
      router.refresh();
    } catch (e) {
      toast.error("Could not update role", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid grid-cols-[280px_1fr] items-start gap-4">
      {/* Role list */}
      <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <span className="text-[12px] font-semibold text-ink">Roles</span>
          <Button variant="ghost" size="sm" onClick={() => setNewOpen(true)}>
            <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 4.167v11.666M4.167 10h11.666" />
            </svg>
            New role
          </Button>
        </div>
        <ul className="divide-y divide-line/70">
          {roles.map((r) => {
            const on = r.code === selectedCode;
            return (
              <li key={r.code}>
                <div
                  className={cn(
                    "flex cursor-pointer items-center gap-2 px-4 py-2.5 transition-colors",
                    on ? "bg-brand-wash" : "hover:bg-fill",
                  )}
                  onClick={() => setSelectedCode(r.code)}
                >
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-[13px] font-medium", on ? "text-brand" : "text-ink")}>
                      {r.name}
                    </span>
                    <span className="block text-[11px] text-ink-4 tabular-nums">
                      {(userCounts[r.code] ?? 0)} user{(userCounts[r.code] ?? 0) !== 1 ? "s" : ""}
                    </span>
                  </span>
                  {r.isSystem && <Badge tone="slate" size="sm">System</Badge>}
                  {!r.isSystem && (
                    <button
                      type="button"
                      aria-label={`Rename ${r.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenameTarget(r);
                      }}
                      className="text-ink-4 transition-colors hover:text-brand"
                    >
                      <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12.5 3.5 16.5 7.5 7 17H3v-4l9.5-9.5Z" />
                        <path d="m11 5 4 4" />
                      </svg>
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Selected role permissions */}
      <div className="flex flex-col gap-3">
        {selected ? (
          <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-[15px] font-bold text-ink">{selected.name}</h2>
                <p className="text-[12px] text-ink-4">
                  {selected.description ?? "No description"}
                  {selected.isSystem && <span> · System role</span>}
                </p>
              </div>
              {isAdminRole ? (
                <Badge tone="amb" size="sm">Admin bypasses all checks</Badge>
              ) : (
                <Badge tone="neutral" size="sm">
                  {(userCounts[selected.code] ?? 0)} users
                </Badge>
              )}
            </div>

            <PermissionToggleList
              permissions={permissions}
              states={states}
              enabled={!isAdminRole}
              busy={busy}
              contextNote="Applies to every user holding this role."
              onToggle={handleToggle}
            />

            <div className="mt-4 rounded-lg bg-fill px-3.5 py-2.5 text-[11.5px] leading-relaxed text-ink-4">
              Changing a role's permissions affects all users holding it.
              Per-user overrides on individual profiles still win.
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-line bg-surface/50 px-6 py-10 text-center text-[13px] text-ink-4">
            Select a role to view and edit its permissions.
          </div>
        )}
      </div>

      <NewRoleDialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={(code) => {
          setNewOpen(false);
          setSelectedCode(code);
          router.refresh();
        }}
        roles={roles}
      />

      <RenameRoleDialog
        role={renameTarget}
        onClose={() => setRenameTarget(null)}
        onRenamed={() => {
          setRenameTarget(null);
          router.refresh();
        }}
      />
    </div>
  );
}

function NewRoleDialog({
  open,
  onClose,
  onCreated,
  roles,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (code: string) => void;
  roles: RoleRow[];
}) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");

  async function handleCreate() {
    const slug = code.trim().toLowerCase().replace(/\s+/g, "_");
    if (!slug || !name.trim()) return;
    if (roles.some((r) => r.code === slug)) {
      toast.error("Role already exists", `A role with code "${slug}" already exists.`);
      return;
    }
    setSaving(true);
    try {
      await createRoleAction(slug, name.trim());
      toast.success("Role created");
      setCode("");
      setName("");
      onCreated(slug);
    } catch (e) {
      toast.error("Could not create role", e instanceof Error ? e.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New role"
      description="Roles bundle a set of permissions granted to every user assigned to them."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" loading={saving} disabled={!code.trim() || !name.trim()} onClick={handleCreate}>
            Create role
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Role name" required>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Store In-charge"
            autoFocus
          />
        </Field>
        <Field
          label="Code"
          required
          hint="Unique identifier — lowercase, no spaces. Shown in the role chips."
        >
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. store_incharge"
            mono
          />
        </Field>
      </div>
    </Dialog>
  );
}

function RenameRoleDialog({
  role,
  onClose,
  onRenamed,
}: {
  role: RoleRow | null;
  onClose: () => void;
  onRenamed: () => void;
}) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(role?.name ?? "");

  async function handleRename() {
    if (!role || !name.trim()) return;
    setSaving(true);
    try {
      await renameRoleAction(role.code, name.trim());
      toast.success("Role renamed");
      onRenamed();
    } catch (e) {
      toast.error("Could not rename role", e instanceof Error ? e.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={!!role}
      onClose={onClose}
      title={role ? `Rename "${role.name}"` : ""}
      description="The code stays the same; only the display name changes."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" loading={saving} disabled={!name.trim()} onClick={handleRename}>
            Rename
          </Button>
        </>
      }
    >
      <Field label="Role name" required>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Role name"
          autoFocus
        />
      </Field>
    </Dialog>
  );
}
