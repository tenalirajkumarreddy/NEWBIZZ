"use client";

import type { AppClaims } from "@/lib/auth/claims";
import type { StagedFile } from "./QuickAttachProvider";

// Placeholder — replaced wholesale by Task 4 (stage → type → decide machine).
export function QuickAttachDialog({ staged, onClose }: { claims: AppClaims; staged: StagedFile[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/40" onClick={onClose}>
      <div className="rounded-lg border border-line bg-surface p-4 text-[13px] text-ink">
        {staged.length} file(s) staged — dialog pending
      </div>
    </div>
  );
}
