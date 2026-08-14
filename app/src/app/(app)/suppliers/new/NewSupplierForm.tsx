"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Panel, Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Select, Input } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { UnsavedGuard, useFormDirty } from "@/components/ui";
import { createSupplier } from "@/lib/actions/suppliers";
import { STATE_CODES, SUPPLIER_KINDS } from "@/lib/constants";
import type { Database } from "@/lib/supabase/database.types";

type SupplierKind = Database["public"]["Enums"]["supplier_kind"];

// Add a supplier (§5.3). Code is auto-assigned server-side (SUPP####); state
// code drives interstate GST on this supplier's bills.
export function NewSupplierForm() {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  const { dirty, reset } = useFormDirty(rootRef);

  const [name, setName] = useState("");
  const [kind, setKind] = useState<SupplierKind>("material");
  const [gstin, setGstin] = useState("");
  const [pan, setPan] = useState("");
  const [stateCode, setStateCode] = useState("33");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [city, setCity] = useState("");
  const [pincode, setPincode] = useState("");
  const [creditDays, setCreditDays] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");

  const canSubmit = !!name.trim() && !pending;

  function submit() {
    if (!canSubmit) return;
    startTransition(async () => {
      const res = await createSupplier({
        name,
        kind,
        gstin: gstin || undefined,
        pan: pan || undefined,
        state_code: stateCode,
        phone: phone || undefined,
        email: email || undefined,
        address_line: addressLine || undefined,
        city: city || undefined,
        pincode: pincode || undefined,
        credit_days: Number(creditDays) || 0,
        payment_terms: paymentTerms || undefined,
      });
      if (res.ok) {
        reset();
        toast.success("Supplier created", `${name} added.`);
        router.push(`/suppliers/${res.supplierId}`);
        router.refresh();
      } else {
        toast.error("Could not create supplier", res.error);
      }
    });
  }

  return (
    <div ref={rootRef} className="flex flex-col gap-4">
      <UnsavedGuard dirty={dirty} message="You have unsaved changes. They'll be lost if you leave this page." />
      <Panel title="Identity">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required htmlFor="name" className="sm:col-span-2">
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Prime Plastics Pvt Ltd" />
          </Field>
          <Field label="Kind" required htmlFor="kind">
            <Select id="kind" value={kind} onChange={(e) => setKind(e.target.value as SupplierKind)}>
              {SUPPLIER_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </Select>
          </Field>
          <Field label="State" required htmlFor="state">
            <Select id="state" value={stateCode} onChange={(e) => setStateCode(e.target.value)}>
              {STATE_CODES.map((s) => <option key={s.code} value={s.code}>{s.code} — {s.name}</option>)}
            </Select>
          </Field>
          <Field label="GSTIN" htmlFor="gstin" hint="15-char GST number; blank if unregistered">
            <Input id="gstin" mono value={gstin} onChange={(e) => setGstin(e.target.value)} placeholder="33AAAAA0000A1Z5" />
          </Field>
          <Field label="PAN" htmlFor="pan">
            <Input id="pan" mono value={pan} onChange={(e) => setPan(e.target.value)} placeholder="AAAAA0000A" />
          </Field>
          <Field label="Phone" htmlFor="phone">
            <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" />
          </Field>
          <Field label="Email" htmlFor="email">
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="sales@example.com" />
          </Field>
        </div>
      </Panel>

      <Panel title="Address & terms">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Address" htmlFor="addr" className="sm:col-span-2">
            <Input id="addr" value={addressLine} onChange={(e) => setAddressLine(e.target.value)} placeholder="Plot 14, Industrial Estate" />
          </Field>
          <Field label="City" htmlFor="city">
            <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Coimbatore" />
          </Field>
          <Field label="Pincode" htmlFor="pin">
            <Input id="pin" mono value={pincode} onChange={(e) => setPincode(e.target.value)} placeholder="641004" />
          </Field>
          <Field label="Credit days" htmlFor="cd" hint="Bill due = bill date + this">
            <Input id="cd" mono inputMode="numeric" value={creditDays} onChange={(e) => setCreditDays(e.target.value)} placeholder="0" />
          </Field>
          <Field label="Payment terms" htmlFor="pt">
            <Input id="pt" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder="Net 30 / Advance" />
          </Field>
        </div>
      </Panel>

      <Card className="flex items-center justify-end gap-2 p-4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/suppliers")}>Cancel</Button>
        <Button variant="primary" size="md" onClick={submit} loading={pending} disabled={!canSubmit}>
          Create supplier
        </Button>
      </Card>
    </div>
  );
}
