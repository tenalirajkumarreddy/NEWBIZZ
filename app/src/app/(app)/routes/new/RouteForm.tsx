"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { upsertRoute, type ActionResult } from "@/lib/actions/routes";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { UnsavedGuard, useFormDirty } from "@/components/ui";

export function RouteForm() {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<ActionResult | null>(null);
  const rootRef = useRef<HTMLFormElement>(null);
  const { dirty, reset } = useFormDirty(rootRef);

  async function handle(formData: FormData) {
    setPending(true);
    setState(null);
    const res = await upsertRoute({
      name: formData.get("name") as string,
      isDefault: formData.get("isDefault") === "on",
    });
    if (res.ok) {
      reset();
      toast.success("Route created");
      router.push("/routes");
    } else {
      toast.error(res.error);
      setState(res);
    }
    setPending(false);
  }

  return (
    <form ref={rootRef} action={handle} className="flex flex-col gap-4">
      <UnsavedGuard dirty={dirty} message="You have unsaved changes to this route. They'll be lost if you leave this page." />
      <Field label="Route name" required>
        <input
          name="name"
          className="input-primary"
          placeholder="e.g. North Zone Morning"
          required
        />
      </Field>
      <label className="flex items-center gap-2 text-[13px] text-ink">
        <input name="isDefault" type="checkbox" className="size-4" />
        Set as default route
      </label>
      {state && !state.ok && (
        <p className="text-[13px] text-red-600">{state.error}</p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Create Route"}
        </Button>
        <Link href="/routes" className="text-[13px] text-link hover:underline self-center">
          Cancel
        </Link>
      </div>
    </form>
  );
}
