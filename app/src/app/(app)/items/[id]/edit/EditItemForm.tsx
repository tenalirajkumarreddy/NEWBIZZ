"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Panel, Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Select, Input } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { updateItem } from "@/lib/actions/catalog";
import type { ItemType, ItemDetail, UnitOption, CategoryOption } from "@/lib/data/catalog";

const ITEM_TYPES: { value: ItemType; label: string }[] = [
  { value: "finished_good", label: "Finished good" },
  { value: "raw_material", label: "Raw material" },
  { value: "wip", label: "WIP / Intermediate" },
  { value: "consumable", label: "Consumable" },
  { value: "service", label: "Service" },
];

const GST_RATES = [0, 5, 12, 18, 28];

export function EditItemForm({
  item,
  units,
  categories,
}: {
  item: ItemDetail;
  units: UnitOption[];
  categories: CategoryOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState(item.name);
  const [type, setType] = useState<ItemType>(item.type);
  const [categoryId, setCategoryId] = useState(
    categories.find((c) => c.name === item.categoryName)?.id ?? "",
  );
  const [baseUnitId, setBaseUnitId] = useState(
    units.find((u) => u.code === item.baseUnitCode)?.id ?? units[0]?.id ?? "",
  );
  const [hsnCode, setHsnCode] = useState(item.hsnCode ?? "");
  const [gstRate, setGstRate] = useState(item.gstRate);
  const [defaultPrice, setDefaultPrice] = useState(String(item.defaultPrice));
  const [reorderLevel, setReorderLevel] = useState(String(item.reorderLevel));
  const [isSellable, setIsSellable] = useState(item.isSellable);
  const [isPurchasable, setIsPurchasable] = useState(item.isPurchasable);
  const [isStocked, setIsStocked] = useState(item.isStocked);
  const [status, setStatus] = useState(item.status);

  const isService = type === "service";

  function submit() {
    startTransition(async () => {
      const res = await updateItem(item.id, {
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
        status,
      });
      if (res.ok) {
        toast.success("Item updated", `${item.sku} saved.`);
        router.push(`/items/${item.id}`);
        router.refresh();
      } else {
        toast.error("Could not update item", res.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Panel title="Identity">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="SKU" htmlFor="sku" hint="Read-only — contact admin to change">
            <div className="flex h-9 items-center font-mono text-[13px] text-ink-3">{item.sku}</div>
          </Field>
          <Field label="Name" required htmlFor="name">
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
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
          <Field label="Status" htmlFor="status">
            <Select id="status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="discontinued">Discontinued</option>
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
            <Input id="hsn" mono value={hsnCode} onChange={(e) => setHsnCode(e.target.value)} placeholder="2201" />
          </Field>
          <Field label="GST rate" required htmlFor="gst">
            <Select id="gst" value={String(gstRate)} onChange={(e) => setGstRate(Number(e.target.value))}>
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
            <Field label="Reorder level" htmlFor="reorder">
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
              <input type="checkbox" checked={isSellable} onChange={(e) => setIsSellable(e.target.checked)} className="h-4 w-4 rounded border-line accent-brand" />
              Sellable
            </label>
            <label className="flex items-center gap-2 text-[13px] text-ink">
              <input type="checkbox" checked={isPurchasable} onChange={(e) => setIsPurchasable(e.target.checked)} className="h-4 w-4 rounded border-line accent-brand" />
              Purchasable
            </label>
            {!isService && (
              <label className="flex items-center gap-2 text-[13px] text-ink">
                <input type="checkbox" checked={isStocked} onChange={(e) => setIsStocked(e.target.checked)} className="h-4 w-4 rounded border-line accent-brand" />
                Stocked
              </label>
            )}
          </div>
        </div>
      </Panel>

      <Card className="flex items-center justify-end gap-2 p-4">
        <Button variant="ghost" size="sm" onClick={() => router.push(`/items/${item.id}`)}>
          Cancel
        </Button>
        <Button variant="primary" size="md" onClick={submit} loading={pending} disabled={pending}>
          Save changes
        </Button>
      </Card>
    </div>
  );
}
