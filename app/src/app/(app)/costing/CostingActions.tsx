"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { runProcessCosting, computeLoadedCost } from "@/lib/actions/costing";

export function CostingActions({
  initialMonth,
  stage,
  compact,
}: {
  initialMonth: string;
  stage?: number;
  compact?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [month, setMonth] = useState(initialMonth);
  const [selectedStage, setSelectedStage] = useState<number>(stage ?? 1);

  if (compact && stage) {
    return (
      <div className="flex items-center gap-1">
        <Button
          variant="subtle"
          size="sm"
          loading={pending}
          onClick={() => handleRun(stage, false)}
        >
          Run
        </Button>
        <Button
          variant="ghost"
          size="sm"
          loading={pending}
          onClick={() => handleRun(stage, true)}
        >
          Finalize
        </Button>
      </div>
    );
  }

  function handleRun(stageNum: number, finalize: boolean) {
    if (!month) return;
    startTransition(async () => {
      const res = await runProcessCosting(month, stageNum, finalize);
      if (res.ok) {
        toast.success(
          finalize ? "Costing finalized" : "Costing run complete",
          finalize ? "Snapshot updated." : "Draft run created.",
        );
        router.refresh();
      } else {
        toast.error("Costing failed", res.error);
      }
    });
  }

  function handleLoaded() {
    if (!month) return;
    startTransition(async () => {
      const res = await computeLoadedCost(month);
      if (res.ok) {
        toast.success("Loaded cost computed", "Period costs spread over FG cases.");
        router.refresh();
      } else {
        toast.error("Could not compute loaded cost", res.error);
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="text-[11px] font-semibold text-ink-4">Month</label>
      <input
        type="month"
        value={month ? month.slice(0, 7) : ""}
        onChange={(e) => {
          const val = e.target.value;
          if (val) setMonth(`${val}-01`);
        }}
        className="h-8 w-36 rounded-md border border-line bg-white px-2 text-[12px] font-mono text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
      />
      <label className="text-[11px] font-semibold text-ink-4">Stage</label>
      <select
        value={selectedStage}
        onChange={(e) => setSelectedStage(Number(e.target.value))}
        className="h-8 rounded-md border border-line bg-white px-2 text-[12px] text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
      >
        <option value={1}>Stage 1 — Blowing</option>
        <option value={2}>Stage 2 — Filling</option>
      </select>
      <Button
        variant="secondary"
        size="sm"
        loading={pending}
        onClick={() => handleRun(selectedStage, false)}
      >
        Run Costing
      </Button>
      <Button
        variant="subtle"
        size="sm"
        loading={pending}
        onClick={() => handleRun(selectedStage, true)}
      >
        Finalize
      </Button>
      <Button
        variant="ghost"
        size="sm"
        loading={pending}
        onClick={handleLoaded}
      >
        Compute Loaded
      </Button>
    </div>
  );
}
