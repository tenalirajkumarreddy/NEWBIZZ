"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { recordPayment } from "@/lib/actions/payroll";
import type { WorkerBalance } from "@/lib/data/payroll";

export function PayModal({
  worker,
  onClose,
}: {
  worker: WorkerBalance;
  onClose: () => void;
}) {
  const toast = useToast();
  const [amount, setAmount] = useState(Math.max(0, worker.balance));
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (amount <= 0) {
      toast.error("Amount must be greater than 0");
      return;
    }
    setSaving(true);
    const result = await recordPayment(worker.userId, amount, method, note || null);
    if (!result.ok) {
      toast.error("Payment failed", result.error);
    } else {
      toast.success("Payment recorded");
      onClose();
    }
    setSaving(false);
  }

  return (
    <Dialog open onClose={onClose} title={`Pay ${worker.fullName}`}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Amount (₹)">
          <Input
            type="number"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            min={1}
            step={1}
            required
          />
        </Field>
        <Field label="Payment Method">
          <Select value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="cash">Cash</option>
            <option value="bank">Bank Transfer</option>
            <option value="upi">UPI</option>
            <option value="other">Other</option>
          </Select>
        </Field>
        <Field label="Note (optional)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g., Weekly payment" />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="subtle" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" loading={saving}>
            Record Payment
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
