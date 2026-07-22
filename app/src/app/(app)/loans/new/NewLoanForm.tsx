"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Panel, Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { money } from "@/lib/format";
import { createLoan } from "@/lib/actions/loans";

const todayIST = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

// Compute the standard annuity EMI for a live preview (the RPC recomputes it
// server-side, so this is illustrative only).
function annuityEmi(principal: number, annualRate: number, months: number): number {
  if (!(principal > 0) || !(months > 0)) return 0;
  const r = annualRate / 1200;
  if (r === 0) return Math.round((principal / months) * 100) / 100;
  const emi = (principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
  return Math.round(emi * 100) / 100;
}

export function NewLoanForm() {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [lender, setLender] = useState("");
  const [principal, setPrincipal] = useState("");
  const [rate, setRate] = useState("");
  const [start, setStart] = useState(todayIST());
  const [tenure, setTenure] = useState("");
  const [emiOverride, setEmiOverride] = useState("");
  const [disburse, setDisburse] = useState(true);
  const [note, setNote] = useState("");

  const previewEmi = useMemo(
    () => annuityEmi(Number(principal), Number(rate), Number(tenure)),
    [principal, rate, tenure],
  );

  const canSubmit = !!lender.trim() && Number(principal) > 0 && Number(tenure) > 0 && !pending;

  function submit() {
    if (!canSubmit) return;
    startTransition(async () => {
      const res = await createLoan({
        lender,
        principal: Number(principal),
        annual_rate: Number(rate) || 0,
        start_date: start,
        tenure_months: Number(tenure),
        emi_amount: Number(emiOverride) > 0 ? Number(emiOverride) : undefined,
        disburse,
        note: note || undefined,
      });
      if (res.ok) {
        toast.success("Loan added", disburse ? "Disbursed and scheduled." : "Schedule generated.");
        router.push(`/loans/${res.loanId}`);
        router.refresh();
      } else {
        toast.error("Could not add loan", res.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Panel title="Loan details">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Lender" required htmlFor="lender" className="sm:col-span-2">
            <Input id="lender" value={lender} onChange={(e) => setLender(e.target.value)} placeholder="State Bank of India" />
          </Field>
          <Field label="Principal (₹)" required htmlFor="principal">
            <Input id="principal" type="number" min={0} step="any" value={principal} onChange={(e) => setPrincipal(e.target.value)} className="text-right" placeholder="0.00" />
          </Field>
          <Field label="Annual rate (%)" required htmlFor="rate">
            <Input id="rate" type="number" min={0} step="any" value={rate} onChange={(e) => setRate(e.target.value)} className="text-right" placeholder="12.00" />
          </Field>
          <Field label="Start date" required htmlFor="start">
            <Input id="start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Tenure (months)" required htmlFor="tenure">
            <Input id="tenure" type="number" min={1} step="1" value={tenure} onChange={(e) => setTenure(e.target.value)} className="text-right" placeholder="36" />
          </Field>
          <Field label="EMI override (₹)" htmlFor="emi" hint="Blank = computed by annuity formula">
            <Input id="emi" type="number" min={0} step="any" value={emiOverride} onChange={(e) => setEmiOverride(e.target.value)} className="text-right" placeholder={previewEmi > 0 ? String(previewEmi) : "0.00"} />
          </Field>
        </div>
        {previewEmi > 0 && (
          <div className="mt-2 flex items-center justify-between rounded-md bg-fill px-3 py-2 text-[12px]">
            <span className="text-ink-3">Computed EMI</span>
            <span className="font-mono font-semibold tnum text-ink">{money(Number(emiOverride) > 0 ? Number(emiOverride) : previewEmi)} / month</span>
          </div>
        )}
      </Panel>

      <Panel title="Disbursement">
        <label className="flex items-start gap-2 text-[13px] text-ink-2">
          <input type="checkbox" checked={disburse} onChange={(e) => setDisburse(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-line" />
          <span>
            Disburse now — post Dr Bank / Cr Loan for the principal.
            <span className="block text-[11px] text-ink-4">Uncheck if the money already arrived and was booked elsewhere.</span>
          </span>
        </label>
      </Panel>

      <Panel title="Note">
        <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Account no., security… (optional)" />
      </Panel>

      <Card className="flex items-center justify-end gap-2 p-4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/loans")}>Cancel</Button>
        <Button variant="primary" size="md" onClick={submit} loading={pending} disabled={!canSubmit}>Add loan</Button>
      </Card>
    </div>
  );
}
