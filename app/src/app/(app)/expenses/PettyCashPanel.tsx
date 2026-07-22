"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { money } from "@/lib/format";
import { topupPettyCash } from "@/lib/actions/expenses";

const todayIST = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

// Petty-cash box top-up (§5.6) — a contra from the bank (Dr 1115 / Cr 1120).
// Collapsed by default; shows the current box balance inline.
export function PettyCashPanel({ balance }: { balance: number }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayIST());
  const [note, setNote] = useState("");

  function onSubmit() {
    const amt = Number(amount);
    if (!(amt > 0)) {
      toast.error("Enter an amount", "The top-up must be greater than zero.");
      return;
    }
    startTransition(async () => {
      const res = await topupPettyCash(amt, date, note || undefined);
      if (res.ok) {
        toast.success("Petty cash topped up", `${money(amt)} moved from bank.`);
        setAmount("");
        setNote("");
        setOpen(false);
        router.refresh();
      } else {
        toast.error("Could not top up", res.error);
      }
    });
  }

  if (!open) {
    return (
      <Card className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-[13px] font-semibold text-ink">Petty cash box</div>
          <p className="mt-0.5 text-[12px] text-ink-3">
            On hand <span className="font-mono font-semibold text-ink">{money(balance)}</span> · top up by contra from the bank.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>Top up petty cash</Button>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="text-[13px] font-semibold text-ink">Top up petty cash</div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Amount (₹)" required>
          <Input type="number" min={0} step="any" value={amount} onChange={(e) => setAmount(e.target.value)} className="text-right" placeholder="0.00" />
        </Field>
        <Field label="Date" required>
          <Input type="date" value={date} max={todayIST()} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Note">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
        </Field>
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => { setAmount(""); setNote(""); setOpen(false); }} disabled={pending}>Cancel</Button>
        <Button variant="primary" size="sm" onClick={onSubmit} loading={pending}>Post top-up</Button>
      </div>
      <p className="text-[11px] text-ink-4">Posts Dr Petty Cash (1115) / Cr Bank (1120) — moves money into the box.</p>
    </Card>
  );
}
