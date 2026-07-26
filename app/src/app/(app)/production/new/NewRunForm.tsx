"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Panel, Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { postProductionRun } from "@/lib/actions/production";
import type { ItemListRow } from "@/lib/data/catalog";

export function NewRunForm({ items }: { items: ItemListRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [stage, setStage] = useState("1");
  const [outputItemId, setOutputItemId] = useState("");
  const [outputQty, setOutputQty] = useState("1");
  const [runDate, setRunDate] = useState(
    new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }),
  );
  const [abnormalWastage, setAbnormalWastage] = useState("");
  const [notes, setNotes] = useState("");

  // Filter output items by stage: Stage 1 → wip, Stage 2 → finished_good
  const stageNum = Number(stage);
  const outputOptions = items.filter((i) => {
    if (stageNum === 1) return i.type === "wip";
    if (stageNum === 2) return i.type === "finished_good";
    return false;
  });

  const canSubmit = !!outputItemId && Number(outputQty) > 0 && !pending;

  function submit() {
    if (!canSubmit) return;
    startTransition(async () => {
      const res = await postProductionRun({
        outputItemId,
        outputQty: Number(outputQty),
        stage: stageNum,
        runDate,
        abnormalWastage: abnormalWastage ? Number(abnormalWastage) : undefined,
        notes: notes.trim() || undefined,
      });
      if (res.ok) {
        toast.success("Run posted", `Production run created — inputs auto-resolved from BOM.`);
        router.push(`/production/${res.runId}`);
        router.refresh();
      } else {
        toast.error("Could not post run", res.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Panel title="Run Details">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Stage" required htmlFor="stage">
            <Select
              id="stage"
              value={stage}
              onChange={(e) => { setStage(e.target.value); setOutputItemId(""); }}
            >
              <option value="1">Stage 1 — Blowing (raw → WIP)</option>
              <option value="2">Stage 2 — Filling (WIP → FG)</option>
            </Select>
          </Field>
          <Field label="Output item" required htmlFor="output_item">
            <Select
              id="output_item"
              value={outputItemId}
              onChange={(e) => setOutputItemId(e.target.value)}
            >
              <option value="">Select {stageNum === 1 ? "a WIP item…" : "a finished good…"}</option>
              {outputOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.sku} — {item.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Output quantity" required htmlFor="output_qty">
            <Input
              id="output_qty"
              mono
              value={outputQty}
              onChange={(e) => setOutputQty(e.target.value)}
              placeholder="1"
            />
          </Field>
          <Field label="Run date" required htmlFor="run_date">
            <Input
              id="run_date"
              type="date"
              mono
              value={runDate}
              onChange={(e) => setRunDate(e.target.value)}
            />
          </Field>
          <Field label="Abnormal wastage (₹)" htmlFor="abnormal" hint="Optional — scrap/breakage value to expense">
            <Input
              id="abnormal"
              mono
              value={abnormalWastage}
              onChange={(e) => setAbnormalWastage(e.target.value)}
              placeholder="0"
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Notes" htmlFor="notes">
              <textarea
                id="notes"
                rows={2}
                className="w-full rounded-lg border border-line bg-white px-3 py-2 text-[13px] text-ink placeholder:text-ink-4 transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes about this run…"
              />
            </Field>
          </div>
        </div>
      </Panel>

      <Card className="flex items-center justify-between gap-2 p-4">
        <p className="text-[12px] text-ink-4 leading-relaxed">
          Input quantities will be auto-resolved from the active <strong>Stage {stageNum}</strong> BOM.
        </p>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => router.push("/production")}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={submit}
            loading={pending}
            disabled={!canSubmit}
          >
            Post Production Run
          </Button>
        </div>
      </Card>
    </div>
  );
}
