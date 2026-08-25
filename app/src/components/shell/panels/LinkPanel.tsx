"use client";

import type { QuickTypeKey } from "@/lib/actions/quick-attach";

// Stub — replaced in Task 5 with the search-and-pick implementation.
export function LinkPanel({ typeKey, onPicked }: {
  typeKey: QuickTypeKey;
  onPicked: (targetId: string, targetLabel: string) => void;
}) {
  return <p className="text-[12px] text-ink-4">Link panel for {typeKey} — Task 5.</p>;
}
