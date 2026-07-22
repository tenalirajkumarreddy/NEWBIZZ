"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Panel, Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Select, Input } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { createItem } from "@/lib/actions/catalog";
import type { ItemType } from "@/lib/data/catalog";
import type { UnitOption, CategoryOption } from "@/lib/data/catalog";

const ITEM_TYPES: { value: ItemType; label: string }[] = [
  { value: "finished_good", label: "Finished good" },
  { value: "raw_material", label: "Raw material" },
  { value: "wip", label: "WIP / Intermediate" },
  { value: "consumable", label: "Consumable" },
  { value: "service", label: "Service" },
];

const GST_RATES = [0, 5, 12, 18, 28];

export function NewItemForm({
  units,
  categories,
}: {
  units: UnitOption[];
  categories: CategoryOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [type, setType] = useState<ItemType>("finished_good");
  const [categoryId, setCategoryId] = useState("");
  const [baseUnitId, setBaseUnitId] = useState(units[0]?.id ?? "");
  const [hsnCode, setHsnCode] = useState("");
  const [gstRate, setGstRate] = useState(18);
  const [defaultPrice, setDefaultPrice] = useState("");
  const [reorderLevel, setReorderLevel] = useState("");
  const [isSellable, setIsSellable] = useState(true);
  const [isPurchasable, setIsPurchasable] = useState(true);
  const [isStocked, setIsStocked] = useState(true);

  const isService = type === "service";

  function submit() {
    if (!name.trim() || !baseUnitId) return;
    startTransition(async () => {
      const res = await createItem({
        name,
        type,
        category_id: categoryId || undefined,
        base_unit_id: baseUnitId,
        hsn_code: hsnCode || undefined,
        gst_rate: gstRate,
        default_price: Number(defaultPrice) || 0,
        reorder_level: Number(reorderLevel) || 0,
        is_sellable: isSellable,
        is_purchasable: isPurchasable,
        is_stocked: isService ? false : isStocked,
      });
      if (res.ok) {
        toast.success("Item created", `${res.sku} added to the catalog.`);
        router.push(`/items/${res.itemId}`);
        router.refresh();
      } else {
        toast.error("Could not create item", res.error);
      }
    });
  }

  const canSubmit = !!name.trim() && !!baseUnitId && !pending;

  return (
    <div className="flex flex-col gap-4">
      <Panel title="Identity">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="SKU" required htmlFor="sku">
            <Input
              id="sku"
              mono
              value="Auto-assigned"
              disabled
              className="opacity-60"
            />
          </Field>
          <Field label="Name" required htmlFor="name">
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="500 ml Bottle Case"
            />
          </Field>
          <Field label="Type" required htmlFor="type">
            <Select id="type" value={type} onChange={(e) => setType(e.target.value as ItemType)}>
              {ITEM_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Category" htmlFor="category">
            <Select id="category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">No category</option>
              {categories.filter((c) => c.status === "active").map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
        </div>
      </Panel>

      <Panel title="Units & tax">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Base unit" required htmlFor="base_unit">
            <Select id="base_unit" value={baseUnitId} onChange={(e) => setBaseUnitId(e.target.value)}>
              {units.map((u) => (
                <option key={u.id} value={u.id}>{u.code} — {u.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="HSN code" htmlFor="hsn">
            <Input
              id="hsn"
              mono
              value={hsnCode}
              onChange={(e) => setHsnCode(e.target.value)}
              placeholder="2201"
            />
          </Field>
          <Field label="GST rate" required htmlFor="gst">
            <Select
              id="gst"
              value={String(gstRate)}
              onChange={(e) => setGstRate(Number(e.target.value))}
            >
              {GST_RATES.map((r) => (
                <option key={r} value={r}>{r}%</option>
              ))}
            </Select>
          </Field>
          <Field label="Default selling price" htmlFor="price" hint="GST-exclusive, per base unit">
            <Input
              id="price"
              mono
              inputMode="decimal"
              className="text-right"
              value={defaultPrice}
              onChange={(e) => setDefaultPrice(e.target.value)}
              placeholder="0.00"
            />
          </Field>
        </div>
      </Panel>

      <Panel title="Stock & flags">
        <div className="grid gap-4 sm:grid-cols-2">
          {!isService && (
            <Field label="Reorder level" htmlFor="reorder" hint="Alert fires when stock ≤ this qty">
              <Input
                id="reorder"
                mono
                inputMode="decimal"
                value={reorderLevel}
                onChange={(e) => setReorderLevel(e.target.value)}
                placeholder="0"
              />
            </Field>
          )}
          <div className="flex flex-col gap-2 pt-1">
            <label className="flex items-center gap-2 text-[13px] text-ink">
              <input
                type="checkbox"
                checked={isSellable}
                onChange={(e) => setIsSellable(e.target.checked)}
                className="h-4 w-4 rounded border-line accent-brand"
              />
              Sellable (can appear on sales orders)
            </label>
            <label className="flex items-center gap-2 text-[13px] text-ink">
              <input
                type="checkbox"
                checked={isPurchasable}
                onChange={(e) => setIsPurchasable(e.target.checked)}
                className="h-4 w-4 rounded border-line accent-brand"
              />
              Purchasable (can appear on purchase orders)
            </label>
            {!isService && (
              <label className="flex items-center gap-2 text-[13px] text-ink">
                <input
                  type="checkbox"
                  checked={isStocked}
                  onChange={(e) => setIsStocked(e.target.checked)}
                  className="h-4 w-4 rounded border-line accent-brand"
                />
                Stocked (tracked in warehouse inventory)
              </label>
            )}
          </div>
        </div>
      </Panel>

      <Card className="flex items-center justify-end gap-2 p-4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/items")}>
          Cancel
        </Button>
        <Button variant="primary" size="md" onClick={submit} loading={pending} disabled={!canSubmit}>
          Create item
        </Button>
      </Card>
    </div>
  );
}
