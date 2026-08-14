"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { upsertVehicle, type ActionResult } from "@/lib/actions/fleet";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { UnsavedGuard, useFormDirty } from "@/components/ui";

export function VehicleForm() {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<ActionResult | null>(null);
  const rootRef = useRef<HTMLFormElement>(null);
  const { dirty, reset } = useFormDirty(rootRef);

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
    if (res.ok) {
      reset();
      toast.success("Vehicle saved");
      router.push("/fleet");
    } else {
      toast.error(res.error);
      setState(res);
    }
    setPending(false);
  }

  return (
    <form ref={rootRef} action={handle} className="flex flex-col gap-4">
      <UnsavedGuard dirty={dirty} message="You have unsaved changes to this vehicle. They'll be lost if you leave this page." />
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
