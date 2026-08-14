"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Panel, Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Select, Input, Textarea } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { UnsavedGuard, useFormDirty } from "@/components/ui";
import { createFixedAsset } from "@/lib/actions/assets";
import type { AssetClass, DepMethod } from "@/lib/data/assets";

const CLASSES: { value: AssetClass; label: string }[] = [
  { value: "plant_machinery", label: "Plant & Machinery" },
  { value: "vehicle", label: "Vehicle" },
  { value: "building", label: "Building" },
  { value: "furniture", label: "Furniture & Fixtures" },
  { value: "computer", label: "Computer" },
];

const todayIST = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

export function NewAssetForm() {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  const { dirty, reset } = useFormDirty(rootRef);

  const [name, setName] = useState("");
  const [assetClass, setAssetClass] = useState<AssetClass>("plant_machinery");
  const [purchaseDate, setPurchaseDate] = useState(todayIST());
  const [cost, setCost] = useState("");
  const [salvage, setSalvage] = useState("");
  const [method, setMethod] = useState<DepMethod>("slm");
  const [life, setLife] = useState("");
  const [rate, setRate] = useState("");
  const [capitalize, setCapitalize] = useState(false);
  const [note, setNote] = useState("");

  const canSubmit =
    !!name.trim() &&
    Number(cost) > 0 &&
    (method === "slm" ? Number(life) > 0 : Number(rate) > 0) &&
    !pending;

  function submit() {
    if (!canSubmit) return;
    startTransition(async () => {
      const res = await createFixedAsset({
        name,
        asset_class: assetClass,
        purchase_date: purchaseDate,
        capitalized_value: Number(cost),
        salvage_value: Number(salvage) || 0,
        method,
        useful_life_years: method === "slm" ? Number(life) : undefined,
        dep_rate: method === "wdv" ? Number(rate) : undefined,
        capitalize,
        note: note || undefined,
      });
      if (res.ok) {
        reset();
        toast.success("Asset registered", capitalize ? "Capitalized to the ledger." : name);
        router.push(`/assets/${res.assetId}`);
        router.refresh();
      } else {
        toast.error("Could not register asset", res.error);
      }
    });
  }

  return (
    <div ref={rootRef} className="flex flex-col gap-4">
      <UnsavedGuard dirty={dirty} message="You have unsaved changes to this asset. They'll be lost if you leave this page." />
      <Panel title="Asset details">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required htmlFor="name" className="sm:col-span-2">
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Bottle blowing machine #2" />
          </Field>
          <Field label="Class" required htmlFor="class">
            <Select id="class" value={assetClass} onChange={(e) => setAssetClass(e.target.value as AssetClass)}>
              {CLASSES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Select>
          </Field>
          <Field label="Purchase date" required htmlFor="pdate">
            <Input id="pdate" type="date" value={purchaseDate} max={todayIST()} onChange={(e) => setPurchaseDate(e.target.value)} />
          </Field>
          <Field label="Capitalized cost (₹)" required htmlFor="cost">
            <Input id="cost" type="number" min={0} step="any" value={cost} onChange={(e) => setCost(e.target.value)} className="text-right" placeholder="0.00" />
          </Field>
          <Field label="Salvage value (₹)" htmlFor="salvage" hint="Residual at end of life; default 0">
            <Input id="salvage" type="number" min={0} step="any" value={salvage} onChange={(e) => setSalvage(e.target.value)} className="text-right" placeholder="0.00" />
          </Field>
        </div>
      </Panel>

      <Panel title="Depreciation">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Method" required htmlFor="method">
            <Select id="method" value={method} onChange={(e) => setMethod(e.target.value as DepMethod)}>
              <option value="slm">Straight-line (SLM)</option>
              <option value="wdv">Written-down value (WDV)</option>
            </Select>
          </Field>
          {method === "slm" ? (
            <Field label="Useful life (years)" required htmlFor="life">
              <Input id="life" type="number" min={1} step="1" value={life} onChange={(e) => setLife(e.target.value)} className="text-right" placeholder="10" />
            </Field>
          ) : (
            <Field label="Depreciation rate (% / year)" required htmlFor="rate">
              <Input id="rate" type="number" min={0} step="any" value={rate} onChange={(e) => setRate(e.target.value)} className="text-right" placeholder="15" />
            </Field>
          )}
        </div>
      </Panel>

      <Panel title="Booking">
        <label className="flex items-start gap-2 text-[13px] text-ink-2">
          <input type="checkbox" checked={capitalize} onChange={(e) => setCapitalize(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-line" />
          <span>
            Capitalize now — post Dr asset / Cr bank to bring it onto the books.
            <span className="block text-[11px] text-ink-4">Leave unchecked if it already arrived via a purchase / GRN.</span>
          </span>
        </label>
      </Panel>

      <Panel title="Note">
        <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Serial no., location… (optional)" />
      </Panel>

      <Card className="flex items-center justify-end gap-2 p-4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/assets")}>Cancel</Button>
        <Button variant="primary" size="md" onClick={submit} loading={pending} disabled={!canSubmit}>Register asset</Button>
      </Card>
    </div>
  );
}
