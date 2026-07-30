"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { inviteUser } from "@/lib/actions/users";
import type { RoleRow } from "@/lib/data/users";

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

export function InviteDrawer({
  open,
  onClose,
  roles,
}: {
  open: boolean;
  onClose: () => void;
  roles: RoleRow[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [phone, setPhone] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);

  function toggleRole(code: string) {
    setSelectedCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  }

  function handleSubmit() {
    if (!phone || !fullName || selectedCodes.length === 0) return;
    startTransition(async () => {
      try {
        await inviteUser({ phone, fullName, roleCodes: selectedCodes, email: email || undefined });
        toast.success("Invitation sent", `${fullName} has been invited`);
        setPhone("");
        setFullName("");
        setEmail("");
        setSelectedCodes([]);
        onClose();
        router.refresh();
      } catch (e) {
        toast.error("Could not send invitation", e instanceof Error ? e.message : undefined);
      }
    });
  }

  return (
    <Drawer open={open} onClose={onClose} title="Invite user" description="Send an invitation to join the platform." size="md">
      <div className="flex flex-col gap-5">
        <Field label="Full name" required>
          <Input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="e.g. Priya K"
          />
        </Field>
        <Field label="Phone" required hint="Used for login and SMS notifications">
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+91 90000 00000"
            mono
          />
        </Field>
        <Field label="Email (optional)">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="priya@example.com"
          />
        </Field>
        <Field label="Roles" required hint="Select at least one role">
          <div className="flex flex-wrap gap-2">
            {roles.map((r) => {
              const on = selectedCodes.includes(r.code);
              const c = roleChip(r.code);
              return (
                <button
                  key={r.code}
                  type="button"
                  onClick={() => toggleRole(r.code)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-all",
                    on
                      ? cn(c.bg, c.text, "border-transparent")
                      : "border-line bg-white text-ink-3 hover:text-ink hover:border-ink/20"
                  )}
                >
                  {r.name}
                </button>
              );
            })}
          </div>
        </Field>
        <div className="flex items-center justify-end gap-2 border-t border-line pt-5">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={pending}
            disabled={!phone || !fullName || selectedCodes.length === 0}
            onClick={handleSubmit}
          >
            Send invitation
          </Button>
        </div>
      </div>
    </Drawer>
  );
}
