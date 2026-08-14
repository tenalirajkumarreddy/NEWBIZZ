"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { createTrip, type ActionResult } from "@/lib/actions/fleet";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";

export function TripForm({
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
    const res = await createTrip({
      vehicleId,
      tripDate: formData.get("tripDate") as string,
      startKm: formData.get("startKm") ? Number(formData.get("startKm")) : undefined,
      notes: (formData.get("notes") as string) || undefined,
    });
    if (res.ok) {
      toast.success("Trip started");
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
      <Field label="Trip date" required>
        <input
          name="tripDate"
          type="date"
          className="input-primary"
          defaultValue={new Date().toISOString().slice(0, 10)}
          required
        />
      </Field>
      <Field label="Starting odometer (km)">
        <input
          name="startKm"
          type="number"
          step="0.1"
          className="input-primary"
          placeholder="e.g. 12000"
        />
      </Field>
      <Field label="Notes">
        <textarea name="notes" className="input-primary" rows={3} placeholder="Optional notes…" />
      </Field>
      {state && !state.ok && (
        <p className="text-[13px] text-red-600">{state.error}</p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Start Trip"}
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
