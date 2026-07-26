"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Panel, Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Select, Input } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { createStore } from "@/lib/actions/customers";
import type { PriceListRow } from "@/lib/data/catalog";

const KINDS = [
  { value: "retail", label: "Retail" },
  { value: "wholesale", label: "Wholesale" },
  { value: "distributor", label: "Distributor" },
  { value: "institution", label: "Institution" },
] as const;

const STATE_CODES = [
  { code: "01", name: "Jammu & Kashmir" }, { code: "02", name: "Himachal Pradesh" },
  { code: "03", name: "Punjab" }, { code: "06", name: "Haryana" },
  { code: "07", name: "Delhi" }, { code: "08", name: "Rajasthan" },
  { code: "09", name: "Uttar Pradesh" }, { code: "10", name: "Bihar" },
  { code: "19", name: "West Bengal" }, { code: "20", name: "Jharkhand" },
  { code: "21", name: "Odisha" }, { code: "22", name: "Chhattisgarh" },
  { code: "23", name: "Madhya Pradesh" }, { code: "24", name: "Gujarat" },
  { code: "27", name: "Maharashtra" }, { code: "29", name: "Karnataka" },
  { code: "30", name: "Goa" }, { code: "32", name: "Kerala" },
  { code: "33", name: "Tamil Nadu" }, { code: "34", name: "Puducherry" },
  { code: "36", name: "Telangana" }, { code: "37", name: "Andhra Pradesh" },
];

export function NewStoreForm({
  customerId,
  priceLists,
  hasExistingStores,
  onClose,
}: {
  customerId: string;
  priceLists: PriceListRow[];
  hasExistingStores: boolean;
  onClose?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [kind, setKind] = useState<"retail" | "wholesale" | "distributor" | "institution">("retail");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [area, setArea] = useState("");
  const [city, setCity] = useState("");
  const [pincode, setPincode] = useState("");
  const [stateCode, setStateCode] = useState("33");
  const [priceListId, setPriceListId] = useState("");
  const [isPrimary, setIsPrimary] = useState(!hasExistingStores);

  const canSubmit = !!name.trim() && !pending;

  function submit() {
    if (!canSubmit) return;
    startTransition(async () => {
      const res = await createStore({
        customer_id: customerId,
        name,
        kind,
        contact_name: contactName || undefined,
        phone: phone || undefined,
        address_line: addressLine || undefined,
        area: area || undefined,
        city: city || undefined,
        pincode: pincode || undefined,
        state_code: stateCode,
        price_list_id: priceListId || undefined,
        is_primary: isPrimary,
      });
      if (res.ok) {
        toast.success("Store added", `${name} is ready for orders.`);
        router.refresh();
        onClose?.();
      } else {
        toast.error("Could not add store", res.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Panel title="Store identity">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Code" hint="Auto-generated on save">
            <Input id="code" mono value="Auto-assigned" disabled className="text-ink-4" />
          </Field>
          <Field label="Store name" required htmlFor="name">
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="MG Road Outlet" />
          </Field>
          <Field label="Kind" required htmlFor="kind">
            <Select id="kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </Select>
          </Field>
          <Field label="Contact name" htmlFor="contact">
            <Input id="contact" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Ravi Kumar" />
          </Field>
          <Field label="Phone" htmlFor="phone">
            <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" />
          </Field>
        </div>
      </Panel>

      <Panel title="Address & place of supply">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Address" htmlFor="address">
            <Input id="address" value={addressLine} onChange={(e) => setAddressLine(e.target.value)} placeholder="12, Main Street" />
          </Field>
          <Field label="Area" htmlFor="area">
            <Input id="area" value={area} onChange={(e) => setArea(e.target.value)} placeholder="Anna Nagar" />
          </Field>
          <Field label="City" htmlFor="city">
            <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Chennai" />
          </Field>
          <Field label="Pincode" htmlFor="pincode">
            <Input id="pincode" mono value={pincode} onChange={(e) => setPincode(e.target.value)} placeholder="600040" />
          </Field>
          <Field label="State (place of supply)" required htmlFor="state">
            <Select id="state" value={stateCode} onChange={(e) => setStateCode(e.target.value)}>
              {STATE_CODES.map((s) => (
                <option key={s.code} value={s.code}>{s.code} — {s.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Price list override" htmlFor="pricelist" hint="Inherits customer default if blank">
            <Select id="pricelist" value={priceListId} onChange={(e) => setPriceListId(e.target.value)}>
              <option value="">Inherit from customer</option>
              {priceLists.filter((p) => p.status === "active").map((p) => (
                <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="mt-4">
          <label className="flex items-center gap-2 text-[13px] text-ink">
            <input
              type="checkbox"
              checked={isPrimary}
              onChange={(e) => setIsPrimary(e.target.checked)}
              className="h-4 w-4 rounded border-line accent-brand"
            />
            Set as the customer&apos;s primary store
          </label>
        </div>
      </Panel>

      <Card className="flex items-center justify-end gap-2 p-4">
        <Button variant="ghost" size="sm" onClick={() => { onClose?.(); router.push(`/customers/${customerId}`); }}>
          Cancel
        </Button>
        <Button variant="primary" size="md" onClick={submit} loading={pending} disabled={!canSubmit}>
          Add store
        </Button>
      </Card>
    </div>
  );
}
