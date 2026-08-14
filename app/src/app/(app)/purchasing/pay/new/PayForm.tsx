"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Panel, Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Select, Input } from "@/components/ui/Field";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { Money } from "@/components/ui/Money";
import { useToast } from "@/components/ui/Toast";
import { UnsavedGuard, useFormDirty } from "@/components/ui";
import { paySupplier, fetchOpenBills } from "@/lib/actions/purchases";
import { todayIST } from "@/lib/constants";
import type { SupplierOption } from "@/lib/data/suppliers";
import type { OpenBillRow } from "@/lib/data/purchases";

const MODES = [
  { value: "bank", label: "Bank", account: "1120" },
  { value: "cash", label: "Cash", account: "1110" },
  { value: "upi", label: "UPI", account: "1120" },
  { value: "cheque", label: "Cheque", account: "1120" },
  { value: "card", label: "Card", account: "1120" },
] as const;

// Pay a supplier (§5.4): Dr Accounts Payable / Cr the source account (bank/cash
// by mode). Allocate the payment across open bills; any unallocated remainder
// sits as an advance on the supplier ledger.
export function PaySupplierForm({
  suppliers,
  initialSupplierId,
  onDone,
  onCancel,
}: {
  suppliers: SupplierOption[];
  initialSupplierId?: string;
  // Passed when hosted in a Drawer so the user stays on the list page.
  // Undefined on the standalone /new page.
  onDone?: () => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  const { dirty, reset } = useFormDirty(rootRef);

  const [supplierId, setSupplierId] = useState(initialSupplierId ?? "");
  const [payDate, setPayDate] = useState(todayIST());
  const [mode, setMode] = useState<(typeof MODES)[number]["value"]>("bank");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  const [bills, setBills] = useState<OpenBillRow[]>([]);
  const [alloc, setAlloc] = useState<Record<string, string>>({});
  const [loadingBills, setLoadingBills] = useState(false);

  // Load open bills whenever the supplier changes.
  useEffect(() => {
    if (!supplierId) {
      setBills([]);
      setAlloc({});
      return;
    }
    let live = true;
    setLoadingBills(true);
    fetchOpenBills(supplierId).then((rows) => {
      if (!live) return;
      setBills(rows);
      setAlloc({});
      setLoadingBills(false);
    });
    return () => {
      live = false;
    };
  }, [supplierId]);

  const allocTotal = Object.values(alloc).reduce((s, v) => s + (Number(v) || 0), 0);
  const amt = Number(amount) || 0;
  const advance = Math.max(amt - allocTotal, 0);

  function setBillAlloc(id: string, value: string) {
    setAlloc((a) => ({ ...a, [id]: value }));
  }

  function fillBill(b: OpenBillRow) {
    // fill this bill up to the lesser of its outstanding and the unallocated pay
    const others = Object.entries(alloc).reduce((s, [k, v]) => (k === b.id ? s : s + (Number(v) || 0)), 0);
    const room = Math.max(amt - others, 0);
    const fill = Math.min(b.outstanding, room > 0 ? room : b.outstanding);
    setBillAlloc(b.id, String(Number(fill.toFixed(2))));
  }

  function onSubmit() {
    if (!supplierId) {
      toast.error("Pick a supplier", "Select who you're paying.");
      return;
    }
    if (amt <= 0) {
      toast.error("Enter an amount", "The payment must be greater than zero.");
      return;
    }
    if (allocTotal > amt + 1e-6) {
      toast.error("Over-allocated", "Allocations exceed the payment amount.");
      return;
    }
    const allocations = bills
      .map((b) => ({ bill_id: b.id, amount: Number(alloc[b.id] || 0) }))
      .filter((a) => a.amount > 0);
    const source = MODES.find((m) => m.value === mode)?.account ?? "1120";

    startTransition(async () => {
      const res = await paySupplier({
        supplier_id: supplierId,
        mode,
        amount: amt,
        payment_date: payDate,
        reference: reference || undefined,
        source_account: source,
        notes: notes || undefined,
        allocations,
      });
      if (res.ok) {
        reset();
        toast.success("Payment recorded", "Supplier ledger updated.");
        if (onDone) onDone();
        else router.push("/purchasing/pay");
        router.refresh();
      } else {
        toast.error("Could not record payment", res.error);
      }
    });
  }

  return (
    <div ref={rootRef} className="flex flex-col gap-4">
      <UnsavedGuard dirty={dirty} message="You have unsaved changes to this payment. They'll be lost if you leave this page." />
      <Panel title="Payment">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Supplier" required className="lg:col-span-2">
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">Select a supplier…</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Date" required>
            <Input type="date" value={payDate} max={todayIST()} onChange={(e) => setPayDate(e.target.value)} />
          </Field>
          <Field label="Mode" required>
            <Select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
              {MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </Select>
          </Field>
          <Field label="Amount (₹)" required>
            <Input type="number" min={0} step="any" value={amount} onChange={(e) => setAmount(e.target.value)} className="text-right" placeholder="0.00" />
          </Field>
          <Field label="Reference" hint="UTR / cheque no.">
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UTR-..." />
          </Field>
          <Field label="Notes" className="lg:col-span-2">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Remarks…" />
          </Field>
        </div>
      </Panel>

      <Panel title="Allocate to bills" subtitle="Leave blank to keep as an advance" flush>
        {!supplierId ? (
          <p className="px-4 py-6 text-center text-[13px] text-ink-4">Pick a supplier to see open bills.</p>
        ) : loadingBills ? (
          <p className="px-4 py-6 text-center text-[13px] text-ink-4">Loading open bills…</p>
        ) : bills.length === 0 ? (
          <p className="px-4 py-6 text-center text-[13px] text-ink-4">No open bills — this payment will sit as an advance.</p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Bill No</TH>
                <TH>Vendor Bill</TH>
                <TH>Date</TH>
                <TH numeric>Outstanding</TH>
                <TH numeric className="w-40">Allocate</TH>
              </TR>
            </THead>
            <TBody>
              {bills.map((b) => (
                <TR key={b.id}>
                  <TD className="font-mono text-[12px] font-semibold text-ink">{b.billNo}</TD>
                  <TD className="font-mono text-[11px] text-ink-3">{b.supplierBillNo ?? "—"}</TD>
                  <TD>{b.billDate}</TD>
                  <TD numeric><Money value={b.outstanding} /></TD>
                  <TD numeric>
                    <div className="flex items-center justify-end gap-1.5">
                      <Input type="number" min={0} max={b.outstanding} step="any" value={alloc[b.id] ?? ""} onChange={(e) => setBillAlloc(b.id, e.target.value)} className="w-24 text-right" />
                      <button className="text-[11px] text-brand hover:underline" onClick={() => fillBill(b)}>Fill</button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        <div className="flex items-center justify-end gap-4 border-t border-line px-4 py-3 text-[13px]">
          <span className="text-ink-3">Allocated <span className="font-mono font-semibold text-ink tnum"><Money value={allocTotal} /></span></span>
          {advance > 0.005 && <span className="text-amb">Advance <span className="font-mono font-semibold tnum"><Money value={advance} /></span></span>}
        </div>
      </Panel>

      <Card className="flex items-center justify-end gap-2 p-4">
        <Button variant="ghost" size="sm" onClick={onCancel ?? (() => router.push("/purchasing/pay"))}>Cancel</Button>
        <Button variant="primary" size="md" onClick={onSubmit} loading={pending} disabled={!supplierId || amt <= 0}>Record payment</Button>
      </Card>
    </div>
  );
}
