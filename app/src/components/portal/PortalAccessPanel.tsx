"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Panel, Button, Field, Input, useToast, Badge } from "@/components/ui";
import { adminPortalCustomer } from "@/lib/actions/portal";

export function PortalAccessPanel({
  customerId,
  defaultPhone,
  status,
  contactPhone,
}: {
  customerId: string;
  defaultPhone: string | null;
  status: string | null; // active | inactive | suspended | null (not enabled)
  contactPhone: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [phone, setPhone] = useState(contactPhone ?? defaultPhone ?? "");

  const enabled = status === "active";
  const saving = (on: boolean) => {
    startTransition(async () => {
      const res = await adminPortalCustomer({
        customer_id: customerId,
        contact_phone: phone,
        active: on,
      });
      if (res.ok) {
        toast.success(on ? "Portal enabled" : "Portal disabled", `${phone} is the sign-in number.`);
        router.refresh();
      } else {
        toast.error("Could not update portal", res.error);
      }
    });
  };

  return (
    <Panel
      title="Customer portal"
      subtitle="Customers sign in at /portal with this phone number to see invoices, statements, and place orders."
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Badge tone={enabled ? "grn" : "slate"} dot>
            {status ? status : "not enabled"}
          </Badge>
          {contactPhone && (
            <span className="font-mono text-[12px] text-ink-3">{contactPhone}</span>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Field label="Contact phone" hint="Defaults to the customer phone. Matches auth users.">
            <Input
              mono
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Registered mobile number"
            />
          </Field>
          <div className="flex items-end gap-2">
            <Button
              variant="secondary"
              size="md"
              disabled={enabled || pending}
              onClick={() => saving(true)}
              loading={pending}
            >
              Enable
            </Button>
            <Button
              variant="ghost"
              size="md"
              disabled={!enabled || pending}
              onClick={() => saving(false)}
            >
              Disable
            </Button>
          </div>
        </div>
      </div>
    </Panel>
  );
}