"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Panel, Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { supplierOpeningBalance } from "@/lib/actions/suppliers";
import { todayIST } from "@/lib/constants";

// One-time opening payable seed for a supplier migrated mid-book (§5.3). Posts a
// journal (Dr 3900 Opening Equity / Cr 2110 AP) via RPC — never a direct write.
// Hidden once the supplier already carries an outstanding balance.
export function SupplierOpeningBalance({
  supplierId,
  hasOutstanding,
}: {
  supplierId: string;
  hasOutstanding: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [amount, setAmount] = useState("");
  const [asOf, setAsOf] = useState(todayIST());

  function onSubmit() {
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast.error("Enter an amount", "The opening payable must be greater than zero.");
      return;
    }
    startTransition(async () => {
      const res = await supplierOpeningBalance(supplierId, amt, asOf, "Opening payable");
      if (res.ok) {
        toast.success("Opening balance posted", "Payable seeded to the ledger.");
        setAmount("");
        setOpen(false);
        router.refresh();
      } else {
        toast.error("Could not post opening balance", res.error);
      }
    });
  }

  if (!open) {
    return (
      <Card className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-[13px] font-semibold text-ink">Opening balance</div>
          <p className="mt-0.5 text-[12px] text-ink-3">
            {hasOutstanding
              ? "This supplier already carries a balance. Add another opening entry only to correct a migration."
              : "Seed a payable this supplier was already owed when the books started."}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>Add opening balance</Button>
      </Card>
    );
  }

  return (
    <Panel title="Opening balance" flush>
      <div className="flex flex-col gap-3 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Amount owed (₹)" required>
            <Input type="number" min={0} step="any" value={amount} onChange={(e) => setAmount(e.target.value)} className="text-right" placeholder="0.00" />
          </Field>
          <Field label="As of" required>
            <Input type="date" value={asOf} max={todayIST()} onChange={(e) => setAsOf(e.target.value)} />
          </Field>
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => { setAmount(""); setOpen(false); }} disabled={pending}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={onSubmit} loading={pending}>Post opening balance</Button>
        </div>
        <p className="text-[11px] text-ink-4">
          Posts Dr Opening Balance Equity / Cr Accounts Payable — the supplier&rsquo;s outstanding rises by this amount.
        </p>
      </div>
    </Panel>
  );
}
