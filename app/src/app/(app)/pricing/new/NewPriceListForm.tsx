"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Panel, Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { createPriceList } from "@/lib/actions/catalog";

export function NewPriceListForm() {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [validFrom, setValidFrom] = useState(
    new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }),
  );
  const [validTo, setValidTo] = useState("");

  const canSubmit = !!code.trim() && !!name.trim() && !pending;

  function submit() {
    if (!canSubmit) return;
    startTransition(async () => {
      const res = await createPriceList({
        code,
        name,
        is_default: isDefault,
        valid_from: validFrom,
        valid_to: validTo || undefined,
      });
      if (res.ok) {
        toast.success("Price list created", `${code.toUpperCase()} is ready — add items to it.`);
        router.push(`/pricing/${res.priceListId}`);
        router.refresh();
      } else {
        toast.error("Could not create price list", res.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Panel title="Details">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Code" required htmlFor="code" hint="Auto-uppercased — e.g. RETAIL, WHOLESALE">
            <Input
              id="code"
              mono
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="RETAIL"
            />
          </Field>
          <Field label="Name" required htmlFor="name">
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Retail price list"
            />
          </Field>
          <Field label="Valid from" required htmlFor="valid_from">
            <Input
              id="valid_from"
              type="date"
              mono
              value={validFrom}
              onChange={(e) => setValidFrom(e.target.value)}
            />
          </Field>
          <Field label="Valid to" htmlFor="valid_to" hint="Leave blank for open-ended">
            <Input
              id="valid_to"
              type="date"
              mono
              value={validTo}
              onChange={(e) => setValidTo(e.target.value)}
            />
          </Field>
          <div className="flex items-center gap-2 pt-1">
            <input
              id="is_default"
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="h-4 w-4 rounded border-line accent-brand"
            />
            <label htmlFor="is_default" className="text-[13px] text-ink">
              Set as the system default price list
            </label>
          </div>
        </div>
      </Panel>

      <Card className="flex items-center justify-end gap-2 p-4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/pricing")}>
          Cancel
        </Button>
        <Button variant="primary" size="md" onClick={submit} loading={pending} disabled={!canSubmit}>
          Create price list
        </Button>
      </Card>
    </div>
  );
}
