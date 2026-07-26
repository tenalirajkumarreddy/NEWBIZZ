"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { updateFleetThresholds, type ActionResult } from "@/lib/actions/settings";

interface Props {
  thresholds: Record<string, number>;
}

const FIELDS: { key: string; label: string; hint: string }[] = [
  { key: "fuel_refill_threshold_pct", label: "Fuel Refill Threshold (%)", hint: "Min % increase to detect a refill" },
  { key: "fuel_leak_threshold_pct", label: "Fuel Leak Threshold (%)", hint: "Min % decrease (ignition off) to flag as leak" },
  { key: "fraud_tolerance_pct", label: "Fraud Tolerance (%)", hint: "Max deviation between estimated vs reported litres" },
  { key: "warehouse_departure_km", label: "Warehouse Departure (km)", hint: "Distance from warehouse to start a trip" },
  { key: "warehouse_arrival_km", label: "Warehouse Arrival (km)", hint: "Distance to warehouse to end a trip" },
];

export function ThresholdsForm({ thresholds }: Props) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of FIELDS) {
      init[f.key] = (thresholds[f.key] ?? "").toString();
    }
    return init;
  });
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<ActionResult | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setState(null);
    const payload: Record<string, number> = {};
    for (const f of FIELDS) {
      payload[f.key] = parseFloat(values[f.key]);
    }
    const res = await updateFleetThresholds(payload);
    setState(res);
    setPending(false);
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-line bg-surface p-4 shadow-card">
      <h2 className="text-[15px] font-semibold text-ink">Detection Thresholds</h2>
      <p className="text-[11px] text-ink-3 mt-0.5">Tunable parameters for trip and fuel detection logic.</p>

      <div className="mt-3 grid grid-cols-2 gap-3">
        {FIELDS.map((f) => (
          <Field key={f.key} label={f.label} hint={f.hint}>
            <Input
              type="number"
              step="any"
              min="0"
              mono
              value={values[f.key]}
              onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
              required
            />
          </Field>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button type="submit" disabled={pending} size="sm">
          {pending ? "Saving…" : "Save Thresholds"}
        </Button>
      </div>

      {state && !state.ok && (
        <p className="mt-2 text-[12px] text-red">{state.error}</p>
      )}
      {state && state.ok && (
        <p className="mt-2 text-[12px] text-grn">Thresholds saved.</p>
      )}
    </form>
  );
}
