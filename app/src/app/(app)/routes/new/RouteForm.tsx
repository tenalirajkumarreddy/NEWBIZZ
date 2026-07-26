"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { upsertRoute, type ActionResult } from "@/lib/actions/routes";
import { useRouter } from "next/navigation";

export function RouteForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<ActionResult | null>(null);

  async function handle(formData: FormData) {
    setPending(true);
    setState(null);
    const res = await upsertRoute({
      name: formData.get("name") as string,
      isDefault: formData.get("isDefault") === "on",
    });
    if (res.ok) router.push("/routes");
    else setState(res);
    setPending(false);
  }

  return (
    <form action={handle} className="flex flex-col gap-4">
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
