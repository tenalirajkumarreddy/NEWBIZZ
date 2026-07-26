"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { upsertVehicle, type ActionResult } from "@/lib/actions/fleet";
import { useRouter } from "next/navigation";

export function VehicleForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<ActionResult | null>(null);

  async function handle(formData: FormData) {
    setPending(true);
    setState(null);
    const res = await upsertVehicle({
      regNo: formData.get("regNo") as string,
      type: (formData.get("type") as string) || undefined,
      capacity: (formData.get("capacity") as string) || undefined,
      ownedOrHired: (formData.get("ownedOrHired") as string) || undefined,
      status: (formData.get("status") as string) || undefined,
    });
    if (res.ok) router.push("/fleet");
    else setState(res);
    setPending(false);
  }

  return (
    <form action={handle} className="flex flex-col gap-4">
      <Field label="Registration number" required>
        <input
          name="regNo"
          className="input-primary"
          placeholder="e.g. MH-12-AB-1234"
          required
        />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Type">
          <input name="type" className="input-primary" placeholder="e.g. Truck, Van" />
        </Field>
        <Field label="Capacity">
          <input name="capacity" className="input-primary" placeholder="e.g. 5 tonnes" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Ownership">
          <select name="ownedOrHired" className="input-primary">
            <option value="owned">Owned</option>
            <option value="hired">Hired</option>
          </select>
        </Field>
        <Field label="Status">
          <select name="status" className="input-primary">
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="maintenance">Maintenance</option>
          </select>
        </Field>
      </div>
      {state && !state.ok && (
        <p className="text-[13px] text-red-600">{state.error}</p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Add Vehicle"}
        </Button>
        <Link href="/fleet" className="text-[13px] text-link hover:underline self-center">
          Cancel
        </Link>
      </div>
    </form>
  );
}
