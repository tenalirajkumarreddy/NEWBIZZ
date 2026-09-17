"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { payWorker } from "@/lib/actions/payroll";
import type { WorkerBalance } from "@/lib/data/payroll";

type PayKind = "payment" | "advance";

export function PayModal({
  worker,
  entityType,
  defaultKind = "payment",
  onClose,
}: {
  worker: WorkerBalance;
  entityType: "user" | "worker";
  defaultKind?: PayKind;
  onClose: () => void;
}) {
  const toast = useToast();
  const router = useRouter();
  const owed = Math.max(0, worker.balance);
  const [kind, setKind] = useState<PayKind>(defaultKind);
  const [amount, setAmount] = useState(owed);
  const [method, setMethod] = useState<"cash" | "bank">("cash");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const overBalance = kind === "payment" && amount > owed;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Amount must be greater than 0");
      return;
    }
    setSaving(true);
    const result = await payWorker({
      entityType,
      entityId: worker.userId,
      kind,
      amount,
      method,
      note: note.trim() ? note.trim() : undefined,
    });
    if (!result.ok) {
      toast.error(kind === "payment" ? "Payment failed" : "Advance failed", result.error);
    } else {
      toast.success(
        kind === "payment" ? "Payment recorded — journal posted" : "Advance recorded",
      );
      onClose();
      router.refresh();
    }
    setSaving(false);
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`${kind === "payment" ? "Pay" : "Advance"} — ${worker.fullName}`}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div
          role="group"
          aria-label="Payment kind"
          className="grid grid-cols-2 gap-1 rounded-lg bg-fill p-1"
        >
          {(["payment", "advance"] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
              className={`h-8 rounded-[7px] text-[13px] font-semibold transition-colors ${
                kind === k
                  ? "bg-white text-ink shadow-card dark:bg-surface"
                  : "text-ink-3 hover:text-ink"
              }`}
            >
              {k === "payment" ? "Payment" : "Advance"}
            </button>
          ))}
        </div>
        <Field
          label="Amount (₹)"
          hint={
            overBalance
              ? "Paying more than owed carries the excess as advance — balance goes negative (red)"
              : `Owed: ₹${owed.toLocaleString("en-IN")}`
          }
        >
          <Input
            type="number"
            value={Number.isFinite(amount) ? amount : 0}
            onChange={(e) => setAmount(Number(e.target.value))}
            min={1}
            step={1}
            required
          />
        </Field>
        <Field label="Method">
          <Select
            value={method}
            onChange={(e) => setMethod(e.target.value as "cash" | "bank")}
          >
            <option value="cash">Cash (1110)</option>
            <option value="bank">Bank (1120)</option>
          </Select>
        </Field>
        <Field label="Note (optional)">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              kind === "payment" ? "e.g., Weekly payment" : "e.g., Festival advance"
            }
          />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="subtle" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" loading={saving}>
            {kind === "payment" ? "Record Payment" : "Record Advance"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
