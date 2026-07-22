"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Panel, Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Select, Input } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { createCustomer } from "@/lib/actions/customers";

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

export function NewCustomerForm() {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [gstin, setGstin] = useState("");
  const [pan, setPan] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [stateCode, setStateCode] = useState("33");
  const [creditLimit, setCreditLimit] = useState("");
  const [creditDays, setCreditDays] = useState("");

  const canSubmit = !!name.trim() && !!phone.trim() && !pending;

  function submit() {
    if (!canSubmit) return;
    startTransition(async () => {
      const res = await createCustomer({
        name,
        gstin: gstin || undefined,
        pan: pan || undefined,
        phone,
        email: email || undefined,
        state_code: stateCode,
        credit_limit: Number(creditLimit) || 0,
        credit_days: Number(creditDays) || 0,
      });
      if (res.ok) {
        toast.success("Customer created", `${res.code} — ${name} added.`);
        router.push(`/customers/${res.customerId}`);
        router.refresh();
      } else {
        toast.error("Could not create customer", res.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Panel title="Identity">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Code" hint="Auto-generated on save">
            <Input id="code" mono value="Auto-assigned" disabled className="text-ink-4" />
          </Field>
          <Field label="Name" required htmlFor="name">
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Sharma Traders" />
          </Field>
          <Field label="State" required htmlFor="state">
            <Select id="state" value={stateCode} onChange={(e) => setStateCode(e.target.value)}>
              {STATE_CODES.map((s) => (
                <option key={s.code} value={s.code}>{s.code} — {s.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="GSTIN" htmlFor="gstin" hint="15-char GST registration number">
            <Input id="gstin" mono value={gstin} onChange={(e) => setGstin(e.target.value)} placeholder="33AAAAA0000A1Z5" />
          </Field>
          <Field label="PAN" htmlFor="pan">
            <Input id="pan" mono value={pan} onChange={(e) => setPan(e.target.value)} placeholder="AAAAA0000A" />
          </Field>
          <Field label="Phone" required htmlFor="phone">
            <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" />
          </Field>
          <Field label="Email" htmlFor="email">
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contact@example.com" />
          </Field>
        </div>
      </Panel>

      <Panel title="Credit terms">
        <div className="grid gap-4 sm:grid-cols-2">
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
        </div>
      </Panel>

      <Card className="flex items-center justify-end gap-2 p-4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/customers")}>Cancel</Button>
        <Button variant="primary" size="md" onClick={submit} loading={pending} disabled={!canSubmit}>
          Create customer
        </Button>
      </Card>
    </div>
  );
}
