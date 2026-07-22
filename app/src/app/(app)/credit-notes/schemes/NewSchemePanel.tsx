"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Panel, Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { createScheme } from "@/lib/actions/creditnotes";

// Create a volume scheme (§7.5): a name, a date window, one or more rebate
// tiers (min cases → rebate per case), and an explicit GST treatment. The panel
// stays collapsed until the user opts to add one, keeping the register clean.
interface TierDraft {
  min_cases: string;
  rebate_per_case: string;
}

const todayIST = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

export function NewSchemePanel() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [start, setStart] = useState(todayIST());
  const [end, setEnd] = useState(todayIST());
  const [gstAdjusted, setGstAdjusted] = useState(false);
  const [gstRate, setGstRate] = useState("18");
  const [tiers, setTiers] = useState<TierDraft[]>([{ min_cases: "", rebate_per_case: "" }]);

  function reset() {
    setName("");
    setStart(todayIST());
    setEnd(todayIST());
    setGstAdjusted(false);
    setGstRate("18");
    setTiers([{ min_cases: "", rebate_per_case: "" }]);
  }

  function setTier(i: number, key: keyof TierDraft, value: string) {
    setTiers((t) => t.map((row, idx) => (idx === i ? { ...row, [key]: value } : row)));
  }

  function onSubmit() {
    const cleanTiers = tiers
      .map((t) => ({ min_cases: Number(t.min_cases), rebate_per_case: Number(t.rebate_per_case) }))
      .filter((t) => t.min_cases > 0 && t.rebate_per_case > 0);

    if (!name.trim()) {
      toast.error("Name required", "Give the scheme a name.");
      return;
    }
    if (cleanTiers.length === 0) {
      toast.error("Add a tier", "Enter at least one tier with a min-cases threshold and rebate.");
      return;
    }
    if (end < start) {
      toast.error("Bad window", "The end date is before the start date.");
      return;
    }

    startTransition(async () => {
      const res = await createScheme({
        name,
        period_start: start,
        period_end: end,
        tiers: cleanTiers,
        gst_adjusted: gstAdjusted,
        gst_rate: Number(gstRate),
      });
      if (res.ok) {
        toast.success("Scheme created", name);
        reset();
        setOpen(false);
        router.push(`/credit-notes/schemes/${res.schemeId}`);
        router.refresh();
      } else {
        toast.error("Could not create scheme", res.error);
      }
    });
  }

  if (!open) {
    return (
      <div className="flex justify-end">
        <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
          New scheme
        </Button>
      </div>
    );
  }

  return (
    <Panel title="New volume scheme" flush>
      <div className="flex flex-col gap-4 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Scheme name" required className="sm:col-span-3">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Q1 Wholesale Volume Rebate" />
          </Field>
          <Field label="Window start" required>
            <Input type="date" value={start} max={end} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Window end" required>
            <Input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
          </Field>
          <Field label="GST treatment" hint="Adjusted reverses proportional output tax">
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-[13px] text-ink-2">
                <input
                  type="checkbox"
                  checked={gstAdjusted}
                  onChange={(e) => setGstAdjusted(e.target.checked)}
                  className="h-4 w-4 rounded border-line"
                />
                GST-adjusted
              </label>
              {gstAdjusted && (
                <Input
                  type="number"
                  min={0}
                  step="any"
                  value={gstRate}
                  onChange={(e) => setGstRate(e.target.value)}
                  className="w-20"
                  aria-label="GST rate %"
                />
              )}
            </div>
          </Field>
        </div>

        {/* Tiers */}
        <div className="flex flex-col gap-2">
          <div className="eyebrow text-ink-4">Rebate tiers</div>
          {tiers.map((t, i) => (
            <div key={i} className="flex items-end gap-2">
              <Field label={i === 0 ? "Min cases" : undefined} className="flex-1">
                <Input
                  type="number"
                  min={0}
                  step="any"
                  value={t.min_cases}
                  onChange={(e) => setTier(i, "min_cases", e.target.value)}
                  placeholder="100"
                />
              </Field>
              <Field label={i === 0 ? "Rebate / case (₹)" : undefined} className="flex-1">
                <Input
                  type="number"
                  min={0}
                  step="any"
                  value={t.rebate_per_case}
                  onChange={(e) => setTier(i, "rebate_per_case", e.target.value)}
                  placeholder="5"
                />
              </Field>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setTiers((rows) => (rows.length > 1 ? rows.filter((_, idx) => idx !== i) : rows))}
                disabled={tiers.length === 1}
                aria-label="Remove tier"
              >
                Remove
              </Button>
            </div>
          ))}
          <div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setTiers((t) => [...t, { min_cases: "", rebate_per_case: "" }])}
            >
              + Add tier
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line pt-3">
          <Button variant="ghost" size="sm" onClick={() => { reset(); setOpen(false); }} disabled={pending}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={onSubmit} loading={pending}>
            Create scheme
          </Button>
        </div>
      </div>
    </Panel>
  );
}
