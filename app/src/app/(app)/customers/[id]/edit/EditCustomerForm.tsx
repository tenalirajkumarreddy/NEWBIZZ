"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Panel, Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Select, Input } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { UnsavedGuard, useFormDirty } from "@/components/ui";
import { updateCustomer } from "@/lib/actions/customers";
import type { CustomerDetail } from "@/lib/data/customers";

const STATE_CODES = [
  { code: "01", name: "Jammu & Kashmir" }, { code: "02", name: "Himachal Pradesh" },
  { code: "03", name: "Punjab" }, { code: "04", name: "Chandigarh" },
  { code: "05", name: "Uttarakhand" }, { code: "06", name: "Haryana" },
  { code: "07", name: "Delhi" }, { code: "08", name: "Rajasthan" },
  { code: "09", name: "Uttar Pradesh" }, { code: "10", name: "Bihar" },
  { code: "11", name: "Sikkim" }, { code: "12", name: "Arunachal Pradesh" },
  { code: "13", name: "Nagaland" }, { code: "14", name: "Manipur" },
  { code: "15", name: "Mizoram" }, { code: "16", name: "Tripura" },
  { code: "17", name: "Meghalaya" }, { code: "18", name: "Assam" },
  { code: "19", name: "West Bengal" }, { code: "20", name: "Jharkhand" },
  { code: "21", name: "Odisha" }, { code: "22", name: "Chhattisgarh" },
  { code: "23", name: "Madhya Pradesh" }, { code: "24", name: "Gujarat" },
  { code: "27", name: "Maharashtra" }, { code: "29", name: "Karnataka" },
  { code: "30", name: "Goa" }, { code: "32", name: "Kerala" },
  { code: "33", name: "Tamil Nadu" }, { code: "34", name: "Puducherry" },
  { code: "36", name: "Telangana" }, { code: "37", name: "Andhra Pradesh" },
];

export function EditCustomerForm({ customer }: { customer: CustomerDetail }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  const { dirty, reset } = useFormDirty(rootRef);

  const [name, setName] = useState(customer.name);
  const [gstin, setGstin] = useState(customer.gstin ?? "");
  const [pan, setPan] = useState(customer.pan ?? "");
  const [phone, setPhone] = useState(customer.phone ?? "");
  const [email, setEmail] = useState(customer.email ?? "");
  const [stateCode, setStateCode] = useState(customer.stateCode);
  const [creditLimit, setCreditLimit] = useState(String(customer.creditLimit || ""));
  const [creditDays, setCreditDays] = useState(String(customer.creditDays || ""));
  const [status, setStatus] = useState(customer.status);

  const canSubmit = !!name.trim() && !!phone.trim() && !pending;

  function submit() {
    if (!canSubmit) return;
    startTransition(async () => {
      const res = await updateCustomer(customer.id, {
        name,
        gstin,
        pan,
        phone,
        email,
        state_code: stateCode,
        credit_limit: Number(creditLimit) || 0,
        credit_days: Number(creditDays) || 0,
        status,
      });
      if (res.ok) {
        reset();
        toast.success("Customer updated", `${name} saved.`);
        router.push(`/customers/${customer.id}`);
        router.refresh();
      } else {
        toast.error("Could not save", res.error);
      }
    });
  }

  return (
    <div ref={rootRef} className="flex flex-col gap-4">
      <UnsavedGuard dirty={dirty} message="You have unsaved changes to this customer. They'll be lost if you leave this page." />
      <Panel title="Identity">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Code" htmlFor="code" hint="Fixed after creation">
            <Input id="code" mono value={customer.code} disabled />
          </Field>
          <Field label="Name" required htmlFor="name">
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="State" required htmlFor="state">
            <Select id="state" value={stateCode} onChange={(e) => setStateCode(e.target.value)}>
              {STATE_CODES.map((s) => (
                <option key={s.code} value={s.code}>{s.code} — {s.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="GSTIN" htmlFor="gstin">
            <Input id="gstin" mono value={gstin} onChange={(e) => setGstin(e.target.value)} placeholder="33AAAAA0000A1Z5" />
          </Field>
          <Field label="PAN" htmlFor="pan">
            <Input id="pan" mono value={pan} onChange={(e) => setPan(e.target.value)} placeholder="AAAAA0000A" />
          </Field>
          <Field label="Phone" required htmlFor="phone">
            <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label="Email" htmlFor="email">
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
        </div>
      </Panel>

      <Panel title="Credit terms & status">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Credit limit" htmlFor="credit_limit" hint="0 = cash only, no credit">
            <Input
              id="credit_limit"
              mono
              inputMode="decimal"
              className="text-right"
              value={creditLimit}
              onChange={(e) => setCreditLimit(e.target.value)}
              placeholder="0.00"
            />
          </Field>
          <Field label="Credit days" htmlFor="credit_days" hint="Due date = invoice date + this">
            <Input
              id="credit_days"
              mono
              inputMode="numeric"
              value={creditDays}
              onChange={(e) => setCreditDays(e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label="Status" htmlFor="status" hint="Inactive customers can't take new orders">
            <Select id="status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </Field>
        </div>
      </Panel>

      <Card className="flex items-center justify-end gap-2 p-4">
        <Button variant="ghost" size="sm" onClick={() => router.push(`/customers/${customer.id}`)}>
          Cancel
        </Button>
        <Button variant="primary" size="md" onClick={submit} loading={pending} disabled={!canSubmit}>
          Save changes
        </Button>
      </Card>
    </div>
  );
}
