"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { postFuelLog, type ActionResult } from "@/lib/actions/fleet";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";

export function FuelForm({
  vehicleId,
  onDone,
  onCancel,
}: {
  vehicleId: string;
  // Passed when hosted in a Drawer so the user stays on the vehicle detail
  // page. Undefined on the standalone /new page.
  onDone?: () => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<ActionResult | null>(null);

  async function handle(formData: FormData) {
    setPending(true);
    setState(null);
    const res = await postFuelLog({
      vehicleId,
      litres: Number(formData.get("litres")),
      amount: Number(formData.get("amount")),
      logDate: (formData.get("logDate") as string) || undefined,
      odometer: formData.get("odometer") ? Number(formData.get("odometer")) : undefined,
      payFrom: (formData.get("payFrom") as "cash" | "bank") || "cash",
    });
    if (res.ok) {
      toast.success("Fuel log posted");
      if (onDone) onDone();
      else router.push(`/fleet/${vehicleId}`);
    } else {
      toast.error(res.error);
      setState(res);
    }
    setPending(false);
  }

  return (
    <form action={handle} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Litres" required>
          <input
            name="litres"
            type="number"
            step="0.001"
            min="0.001"
            className="input-primary"
            placeholder="e.g. 50.000"
            required
          />
        </Field>
        <Field label="Amount (₹)" required>
          <input
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            className="input-primary"
            placeholder="e.g. 4500.00"
            required
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Date">
          <input name="logDate" type="date" className="input-primary" defaultValue={new Date().toISOString().slice(0, 10)} />
        </Field>
        <Field label="Odometer (km)">
          <input name="odometer" type="number" step="0.1" className="input-primary" placeholder="e.g. 12500" />
        </Field>
      </div>
      <Field label="Pay from">
        <select name="payFrom" className="input-primary">
          <option value="cash">Cash</option>
          <option value="bank">Bank</option>
        </select>
      </Field>
      {state && !state.ok && (
        <p className="text-[13px] text-red-600">{state.error}</p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Posting…" : "Post Fuel"}
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" size="md" onClick={onCancel}>
            Cancel
          </Button>
        ) : (
          <Link href={`/fleet/${vehicleId}`} className="text-[13px] text-link hover:underline self-center">
            Cancel
          </Link>
        )}
      </div>
    </form>
  );
}
