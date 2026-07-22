"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { runDepreciation } from "@/lib/actions/assets";

const todayIST = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

// Run depreciation across every active asset for a period (§5.7). Posts one
// journal — Dr each depreciation-expense account / Cr Accumulated Depreciation.
export function RunDepreciationPanel() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [date, setDate] = useState(todayIST());
  const [period, setPeriod] = useState("");
  const [months, setMonths] = useState("12");

  function onRun() {
    startTransition(async () => {
      const res = await runDepreciation(date, period || undefined, Number(months) || 12);
      if (res.ok) {
        toast.success("Depreciation posted", "Every active asset depreciated for the period.");
        setOpen(false);
        router.refresh();
      } else {
        toast.error("Could not run depreciation", res.error);
      }
    });
  }

  if (!open) {
    return (
      <Card className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-[13px] font-semibold text-ink">Depreciation run</div>
          <p className="mt-0.5 text-[12px] text-ink-3">Depreciate all active assets for a period (monthly or annual).</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>Run depreciation</Button>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="text-[13px] font-semibold text-ink">Run depreciation</div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Run date" required>
          <Input type="date" value={date} max={todayIST()} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Period" hint="For SLM/WDV the yearly charge is prorated">
          <Select value={months} onChange={(e) => setMonths(e.target.value)}>
            <option value="1">1 month</option>
            <option value="3">Quarter (3 months)</option>
            <option value="6">Half year (6 months)</option>
            <option value="12">Full year (12 months)</option>
          </Select>
        </Field>
        <Field label="Label">
          <Input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="e.g. 2026-07 or FY26-27" />
        </Field>
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
        <Button variant="primary" size="sm" onClick={onRun} loading={pending}>Post depreciation</Button>
      </div>
      <p className="text-[11px] text-ink-4">Posts Dr Depreciation Expense / Cr Accumulated Depreciation (1590) for the period. WDV never falls below salvage.</p>
    </Card>
  );
}
