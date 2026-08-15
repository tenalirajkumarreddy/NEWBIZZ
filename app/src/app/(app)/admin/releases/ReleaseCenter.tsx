"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Panel } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { Toggle } from "@/components/ui/Toggle";
import { useToast } from "@/components/ui/Toast";
import { runRelease } from "@/lib/actions/releases";
import type { ReleaseTypeCount } from "@/lib/data/releases";

const DATE_INPUT =
  "w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink";

export function ReleaseCenter({
  counts,
  from: initialFrom,
  to: initialTo,
}: {
  counts: ReleaseTypeCount[];
  from: string;
  to: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, startTransition] = useTransition();

  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(counts.map((c) => c.entityType)),
  );
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);

  const invalidRange = !from || !to || from > to;
  const allSelected = counts.length > 0 && selected.size === counts.length;

  function setCurrentMonth() {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    setFrom(`${today.slice(0, 8)}01`);
    setTo(today);
  }

  function toggleType(entityType: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(entityType);
      else next.delete(entityType);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(counts.map((c) => c.entityType)));
  }

  function onRelease() {
    startTransition(async () => {
      const res = await runRelease([...selected], from, to);
      if (res.ok) {
        toast.success(
          "Documents released",
          res.released > 0 ? `${res.released} doc(s) released.` : "Nothing new to release.",
        );
        router.refresh();
      } else {
        toast.error("Release failed", res.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Panel
        title="Release period"
        subtitle="Documents dated inside this range are released."
        actions={
          <button type="button" onClick={setCurrentMonth} className="text-[12px] font-medium text-brand hover:underline">
            Current month
          </button>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="From" htmlFor="release-from">
            <input
              id="release-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className={DATE_INPUT}
            />
          </Field>
          <Field label="To" htmlFor="release-to">
            <input
              id="release-to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className={DATE_INPUT}
            />
          </Field>
        </div>
        {invalidRange && (
          <p className="mt-2 text-[11px] font-medium text-red">From must be on or before To.</p>
        )}
      </Panel>

      <Panel
        title="Document types"
        subtitle="Only ticked registers are released to accountants."
        actions={
          <button type="button" onClick={toggleAll} className="text-[12px] font-medium text-brand hover:underline">
            {allSelected ? "Clear" : "Select all"}
          </button>
        }
      >
        <ul className="flex flex-col">
          {counts.map((c) => (
            <li
              key={c.entityType}
              className="flex items-center justify-between gap-3 border-b border-line py-3 last:border-b-0"
            >
              <label className="flex min-w-0 items-center gap-3">
                <Toggle
                  size="sm"
                  checked={selected.has(c.entityType)}
                  onCheckedChange={(checked) => toggleType(c.entityType, checked)}
                  aria-label={c.label}
                />
                <span className="text-[13px] font-medium text-ink">{c.label}</span>
              </label>
              <div className="flex shrink-0 items-center gap-2">
                <Badge tone="grn">{c.released} released</Badge>
                <Badge tone="amb">{c.unreleased} unreleased</Badge>
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      <div className="flex justify-end">
        <Button
          variant="primary"
          size="md"
          loading={busy}
          disabled={selected.size === 0 || invalidRange}
          onClick={onRelease}
        >
          Release
        </Button>
      </div>
    </div>
  );
}