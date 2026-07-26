"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { upsertAlternateGroupMember } from "@/lib/actions/bom";

export function AddMemberForm({ groupId }: { groupId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [itemId, setItemId] = useState("");
  const [priority, setPriority] = useState("1");
  const [isDefault, setIsDefault] = useState(false);

  if (!open) {
    return (
      <Button variant="subtle" size="sm" onClick={() => setOpen(true)}>
        + Add item
      </Button>
    );
  }

  function submit() {
    if (!itemId.trim()) return;
    startTransition(async () => {
      const res = await upsertAlternateGroupMember(groupId, {
        itemId: itemId.trim(),
        priority: Number(priority) || 1,
        isDefault,
      });
      if (res.ok) {
        toast.success("Item added");
        setOpen(false);
        setItemId("");
        setPriority("1");
        setIsDefault(false);
        router.refresh();
      } else {
        toast.error("Could not add item", res.error);
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        className="h-8 w-40 rounded-md border border-line bg-white px-2 text-[12px] font-mono text-ink placeholder:text-ink-4 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
        placeholder="Item ID"
        value={itemId}
        onChange={(e) => setItemId(e.target.value)}
      />
      <input
        className="h-8 w-16 rounded-md border border-line bg-white px-2 text-[12px] font-mono text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
        placeholder="Priority"
        type="number"
        value={priority}
        onChange={(e) => setPriority(e.target.value)}
      />
      <label className="flex items-center gap-1 text-[11px] font-medium text-ink-3">
        <input
          type="checkbox"
          checked={isDefault}
          onChange={(e) => setIsDefault(e.target.checked)}
          className="accent-brand"
        />
        Default
      </label>
      <Button variant="subtle" size="sm" loading={pending} onClick={submit}>
        Add
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </div>
  );
}
