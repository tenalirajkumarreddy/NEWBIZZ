"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import type { AccountType } from "@/lib/data/bank";

interface Props {
  action: (data: any) => Promise<void>;
  initial?: {
    name?: string;
    bankName?: string;
    accountNo?: string;
    ifsc?: string;
    accountType?: AccountType;
    creditLimit?: number;
    paymentDueDay?: number;
    cardLastFour?: string;
    openingBalance?: number;
    openingDate?: string;
  };
}

export function BankAccountForm({ action, initial }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [type, setType] = useState<AccountType>(initial?.accountType ?? "bank");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    try {
      const data = new FormData(e.currentTarget);
      const payload: Record<string, any> = {
        name: data.get("name") as string,
        accountType: type,
        bankName: data.get("bankName") as string || undefined,
        accountNo: data.get("accountNo") as string || undefined,
        ifsc: data.get("ifsc") as string || undefined,
        openingBalance: data.get("openingBalance") ? Number(data.get("openingBalance")) : 0,
        openingDate: data.get("openingDate") as string || undefined,
      };
      if (type === "credit_card") {
        payload.creditLimit = data.get("creditLimit") ? Number(data.get("creditLimit")) : undefined;
        payload.paymentDueDay = data.get("paymentDueDay") ? Number(data.get("paymentDueDay")) : undefined;
        payload.cardLastFour = data.get("cardLastFour") as string || undefined;
      }
      await action(payload);
      toast.success("Account created");
      router.push("/bank");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to create account");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Field label="Account Type" required>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as AccountType)}
          className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink"
        >
          <option value="bank">Bank Account</option>
          <option value="credit_card">Credit Card</option>
        </select>
      </Field>

      <Field label="Account Name" required>
        <input name="name" defaultValue={initial?.name} required placeholder="e.g. HDFC Current Account" className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink" />
      </Field>

      {type === "bank" && (
        <>
          <Field label="Bank Name">
            <input name="bankName" defaultValue={initial?.bankName} placeholder="HDFC Bank" className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink" />
          </Field>
          <Field label="Account Number">
            <input name="accountNo" defaultValue={initial?.accountNo} placeholder="Enter account number" className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink" />
          </Field>
          <Field label="IFSC Code">
            <input name="ifsc" defaultValue={initial?.ifsc} placeholder="HDFC0001234" className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink" />
          </Field>
        </>
      )}

      {type === "credit_card" && (
        <>
          <Field label="Bank / Issuer">
            <input name="bankName" defaultValue={initial?.bankName} placeholder="HDFC Bank" className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink" />
          </Field>
          <Field label="Last 4 Digits">
            <input name="cardLastFour" defaultValue={initial?.cardLastFour} placeholder="1234" maxLength={4} pattern="\d{4}" className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink font-mono" />
          </Field>
          <Field label="Credit Limit (₹)">
            <input name="creditLimit" type="number" defaultValue={initial?.creditLimit} placeholder="e.g. 500000" className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink" />
          </Field>
          <Field label="Payment Due Day">
            <input name="paymentDueDay" type="number" defaultValue={initial?.paymentDueDay} placeholder="e.g. 15" min={1} max={31} className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink" />
          </Field>
        </>
      )}

      <Field label="Opening Balance (₹)">
        <input name="openingBalance" type="number" defaultValue={initial?.openingBalance ?? 0} step="0.01" className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink" />
      </Field>
      <Field label="Opening Balance Date">
        <input name="openingDate" type="date" defaultValue={initial?.openingDate} className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink" />
      </Field>

      <div className="flex gap-2 pt-2">
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? "Saving..." : initial ? "Update Account" : "Create Account"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => router.push("/bank")}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
