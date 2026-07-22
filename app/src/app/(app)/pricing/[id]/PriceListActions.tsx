"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field, Select, Input } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { upsertPriceListItem, deletePriceListItem } from "@/lib/actions/catalog";
import type { ItemListRow } from "@/lib/data/catalog";

// Two modes:
//   "add"  — inline form to add/update a price row (shown at bottom of detail page)
//   "row"  — delete button for an existing row (shown in the table)
export function PriceListActions(
  props:
    | {
        priceListId: string;
        allItems: ItemListRow[];
        mode: "add";
      }
    | {
        priceListId: string;
        itemId: string;
        minQty: number;
        mode?: undefined;
      },
) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  // ---- add/update form ----
  const [itemId, setItemId] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [minQty, setMinQty] = useState("0");
  const [confirmDelete, setConfirmDelete] = useState(false);

  if ("mode" in props && props.mode === "add") {
    const canAdd = !!itemId && Number(unitPrice) >= 0 && !pending;

    function onAdd() {
      if (!canAdd) return;
      startTransition(async () => {
        const res = await upsertPriceListItem(
          props.priceListId,
          itemId,
          Number(unitPrice),
          Number(minQty) || 0,
        );
        if (res.ok) {
          toast.success("Price saved");
          setItemId("");
          setUnitPrice("");
          setMinQty("0");
          router.refresh();
        } else {
          toast.error("Could not save price", res.error);
        }
      });
    }

    return (
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="Item" required htmlFor="add-item">
          <Select id="add-item" value={itemId} onChange={(e) => setItemId(e.target.value)}>
            <option value="">Select item…</option>
            {props.allItems.map((i) => (
              <option key={i.id} value={i.id}>
                {i.sku} — {i.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Unit price (ex-GST)" required htmlFor="add-price">
          <Input
            id="add-price"
            mono
            inputMode="decimal"
            className="text-right"
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
            placeholder="0.00"
          />
        </Field>
        <Field label="Min qty (slab)" htmlFor="add-minqty" hint="0 = base price">
          <Input
            id="add-minqty"
            mono
            inputMode="decimal"
            value={minQty}
            onChange={(e) => setMinQty(e.target.value)}
            placeholder="0"
          />
        </Field>
        <div className="flex items-end">
          <Button
            variant="primary"
            size="sm"
            onClick={onAdd}
            loading={pending}
            disabled={!canAdd}
          >
            Save price
          </Button>
        </div>
      </div>
    );
  }

  // ---- row delete ----
  // props is narrowed to the row variant here; capture into consts so the
  // narrowing survives into the onDelete closure.
  const { priceListId, itemId: rowItemId, minQty: rowMinQty } = props;

  function onDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    startTransition(async () => {
      const res = await deletePriceListItem(priceListId, rowItemId, rowMinQty);
      setConfirmDelete(false);
      if (res.ok) {
        toast.success("Price removed");
        router.refresh();
      } else {
        toast.error("Could not remove price", res.error);
      }
    });
  }

  return confirmDelete ? (
    <div className="flex items-center gap-1">
      <Button variant="danger" size="sm" onClick={onDelete} loading={pending}>
        Confirm
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)} disabled={pending}>
        Keep
      </Button>
    </div>
  ) : (
    <Button variant="ghost" size="sm" onClick={onDelete} disabled={pending}>
      Remove
    </Button>
  );
}
