"use client";

import type { QuickTypeKey } from "@/lib/actions/quick-attach";

// Stub — replaced in Task 5 with per-type create forms.
export function CreatePanel({ typeKey, onCreated }: {
  typeKey: QuickTypeKey;
  onCreated: (entityType: string, entityId: string) => void;
}) {
  return <p className="text-[12px] text-ink-4">Create panel for {typeKey} — Task 5.</p>;
}
