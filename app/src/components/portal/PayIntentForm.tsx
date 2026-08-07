"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Panel, Button, Field, Input, useToast } from "@/components/ui";
import { submitPortalPayIntent } from "@/lib/actions/portal";

const MODES = ["cash", "upi", "cheque", "bank"];

export function PayIntentForm({ defaultAmount }: { defaultAmount?: number }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [amount, setAmount] = useState(defaultAmount ? String(Math.round(defaultAmount)) : "");
  const [mode, setMode] = useState<string>("upi");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");

  function submit() {
    startTransition(async () => {
      const res = await submitPortalPayIntent({
        amount: Number(amount),
        mode: mode as "cash" | "upi" | "cheque" | "bank",
        reference: reference.trim() || undefined,
        note: note.trim() || undefined,
      });
      if (res.ok) {
        toast.success("Payment recorded — we'll match it shortly");
        setNote("");
        setReference("");
        router.refresh();
      } else {
        toast.error("Could not record payment", res.error);
      }
    });
  }

  return (
    <Panel
      title="Record a payment you've made"
      subtitle="Enter the amount and how you sent it."
      bodyClassName="p-5"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Field label="Amount (₹)" hint="Leave blank to use the full balance">
            <Input
              inputMode="decimal"
              mono
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </Field>
        </div>
        <div>
          <Field label="Mode">
            <div className="flex flex-wrap gap-2">
              {MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`rounded-lg border px-3 py-2 text-[13px] font-semibold capitalize transition-colors ${
                    mode === m
                      ? "border-brand bg-brand-wash text-brand-d"
                      : "border-line bg-white text-ink-2 hover:border-line-strong"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </Field>
        </div>
        <div>
          <Field label="Reference (optional)">
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="UPI reference / cheque no."
            />
          </Field>
        </div>
        <div>
          <Field label="Note (optional)">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Any details for our team"
            />
          </Field>
        </div>
      </div>

      <div className="mt-5">
        <Button type="submit" onClick={submit} loading={pending}>
          Submit payment record
        </Button>
      </div>
    </Panel>
  );
}