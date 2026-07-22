"use client";

import { useState } from "react";
import Link from "next/link";
import { Panel } from "@/components/ui/Card";
import { Field, Select } from "@/components/ui/Field";
import { NewStoreForm } from "../../[id]/stores/new/NewStoreForm";
import type { PriceListRow } from "@/lib/data/catalog";

type CustomerOption = { id: string; code: string; name: string };

export function StorePickerForm({
  customers,
  priceLists,
  initialCustomerId,
}: {
  customers: CustomerOption[];
  priceLists: PriceListRow[];
  initialCustomerId: string;
}) {
  const [customerId, setCustomerId] = useState(initialCustomerId);

  if (customers.length === 0) {
    return (
      <Panel title="Pick a customer">
        <p className="p-4 text-[13px] text-ink-4">
          There are no customers yet. A store must belong to a customer —{" "}
          <Link href="/customers/new" className="text-brand hover:underline">create one first</Link>.
        </p>
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Panel title="Which customer?">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Customer" required htmlFor="customer" hint="The store rolls up to this customer's ledger">
            <Select id="customer" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">Select a customer…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Panel>

      {customerId ? (
        <NewStoreForm customerId={customerId} priceLists={priceLists} hasExistingStores={false} />
      ) : (
        <Panel>
          <p className="p-4 text-[13px] text-ink-4">Select a customer above to fill in the store details.</p>
        </Panel>
      )}
    </div>
  );
}
