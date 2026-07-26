"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { convertLead } from "@/lib/actions/crm";
import type { LeadRow } from "@/lib/data/crm";
import type { Database } from "@/lib/supabase/database.types";

interface Props {
  lead: LeadRow;
  onClose: () => void;
}

export function ConvertLeadDialog({ lead, onClose }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState<"confirm" | "done">("confirm");
  const [customerId, setCustomerId] = useState<string | null>(null);

  const [customerName, setCustomerName] = useState(lead.company ?? lead.name);
  const [phone, setPhone] = useState(lead.phone ?? "");
  const [email, setEmail] = useState(lead.email ?? "");
  const [gstin, setGstin] = useState("");
  const [creditLimit, setCreditLimit] = useState("0");
  const [creditDays, setCreditDays] = useState("0");

  const [storeName, setStoreName] = useState("Main Store");
  const [storeKind, setStoreKind] = useState<Database["public"]["Enums"]["customer_kind"]>("retail");
  const [storeCity, setStoreCity] = useState("");

  const canSubmit = !!customerName.trim() && !pending;

  function submit() {
    startTransition(async () => {
      const res = await convertLead({
        leadId: lead.id,
        customerName: customerName.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        gstin: gstin.trim() || undefined,
        creditLimit: Number(creditLimit) || undefined,
        creditDays: Number(creditDays) || undefined,
        storeName: storeName.trim() || undefined,
        storeKind,
        storeCity: storeCity.trim() || undefined,
      });

      if (res.ok) {
        setCustomerId(res.customerId);
        setStep("done");
        toast.success("Lead converted", `Customer created from ${lead.name}.`);
        router.refresh();
      } else {
        toast.error("Could not convert lead", res.error);
      }
    });
  }

  if (step === "done") {
    return (
      <Dialog open onClose={onClose} title="Lead converted" size="sm"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
            {customerId && (
              <Button variant="primary" size="sm" onClick={() => { router.push(`/customers/${customerId}`); }}>
                View customer
              </Button>
            )}
          </div>
        }
      >
        <p className="text-[14px] text-ink-3">Customer and store created successfully from this lead.</p>
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Convert: ${lead.name}`}
      size="md"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={submit} loading={pending} disabled={!canSubmit}>
            Convert to customer
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <div>
          <h3 className="text-[13px] font-semibold text-ink">Customer details</h3>
          <div className="mt-2 grid gap-4 sm:grid-cols-2">
            <Field label="Name" required htmlFor="conv-name">
              <Input id="conv-name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            </Field>
            <Field label="Phone" htmlFor="conv-phone">
              <Input id="conv-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
            <Field label="Email" htmlFor="conv-email">
              <Input id="conv-email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="GSTIN" htmlFor="conv-gstin">
              <Input id="conv-gstin" value={gstin} onChange={(e) => setGstin(e.target.value)} />
            </Field>
            <Field label="Credit limit" htmlFor="conv-cl">
              <Input id="conv-cl" type="number" min="0" value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} />
            </Field>
            <Field label="Credit days" htmlFor="conv-cd">
              <Input id="conv-cd" type="number" min="0" value={creditDays} onChange={(e) => setCreditDays(e.target.value)} />
            </Field>
          </div>
        </div>

        <div>
          <h3 className="text-[13px] font-semibold text-ink">First store</h3>
          <div className="mt-2 grid gap-4 sm:grid-cols-2">
            <Field label="Store name" required htmlFor="conv-store-name">
              <Input id="conv-store-name" value={storeName} onChange={(e) => setStoreName(e.target.value)} />
            </Field>
            <Field label="Kind" htmlFor="conv-store-kind">
              <Select id="conv-store-kind" value={storeKind} onChange={(e) => setStoreKind(e.target.value as typeof storeKind)}>
                <option value="retail">Retail</option>
                <option value="wholesale">Wholesale</option>
                <option value="distributor">Distributor</option>
                <option value="institution">Institution</option>
              </Select>
            </Field>
            <Field label="City" htmlFor="conv-store-city">
              <Input id="conv-store-city" value={storeCity} onChange={(e) => setStoreCity(e.target.value)} />
            </Field>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
