"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Panel, Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { createAlternateGroup } from "@/lib/actions/bom";

export function NewAltGroupForm() {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const canSubmit = !!name.trim() && !pending;

  function submit() {
    if (!canSubmit) return;
    startTransition(async () => {
      const res = await createAlternateGroup({ name: name.trim(), notes: notes.trim() || undefined });
      if (res.ok) {
        toast.success("Group created", `${name} — now add substitute items to it.`);
        router.push(`/bom/alternate-groups/${res.groupId}`);
        router.refresh();
      } else {
        toast.error("Could not create group", res.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Panel title="Details">
        <div className="flex flex-col gap-4">
          <Field label="Group name" required htmlFor="name" hint="e.g. Equivalent bearings, Alternate labels">
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Bearing equivalents" />
          </Field>
          <Field label="Notes" htmlFor="notes">
            <textarea
              id="notes"
              rows={2}
              className="w-full rounded-lg border border-line bg-white px-3 py-2 text-[13px] text-ink placeholder:text-ink-4 transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional description…"
            />
          </Field>
        </div>
      </Panel>

      <Card className="flex items-center justify-end gap-2 p-4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/bom/alternate-groups")}>Cancel</Button>
        <Button variant="primary" size="md" onClick={submit} loading={pending} disabled={!canSubmit}>Create Group</Button>
      </Card>
    </div>
  );
}
