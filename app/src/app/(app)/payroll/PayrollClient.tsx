"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Panel } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { Field, Input, Select } from "@/components/ui/Field";
import { Dialog } from "@/components/ui/Dialog";
import { Money } from "@/components/ui/Money";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { MonthPicker } from "@/components/payroll/MonthPicker";
import { payWorker } from "@/lib/actions/payroll";
import type { PersonMonthStatement, WagesSummary } from "@/lib/data/payroll";

function periodLabel(month: string): string {
  const d = new Date(month + "T00:00:00");
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    month: "long",
    year: "numeric",
  }).format(d);
}

export function PayrollClient({
  month,
  statement,
  summary,
  canManage,
}: {
  month: string;
  statement: PersonMonthStatement[];
  summary: WagesSummary;
  canManage: boolean;
}) {
  const router = useRouter();
  const toast = useToast();

  const [payPerson, setPayPerson] = useState<PersonMonthStatement | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "bank">("cash");
  const [note, setNote] = useState("");
  const [paying, setPaying] = useState(false);

  function openPay(p: PersonMonthStatement) {
    setPayPerson(p);
    setAmount(p.balance > 0 ? String(p.balance) : "");
    setMethod("cash");
    setNote("");
  }

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    if (!payPerson) return;
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Amount must be greater than 0");
      return;
    }
    setPaying(true);
    const res = await payWorker({
      entityType: payPerson.entityType,
      entityId: payPerson.entityId,
      kind: "payment",
      amount: value,
      method,
      note: note.trim() ? note.trim() : undefined,
    });
    if (!res.ok) {
      toast.error("Payment failed", res.error);
    } else {
      toast.success("Payment recorded — journal posted");
      setPayPerson(null);
      router.refresh();
    }
    setPaying(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthPicker current={month} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-line bg-surface p-3.5 shadow-card">
          <p className="text-[11px] font-medium uppercase tracking-wider text-ink-3">Accrued</p>
          <p className="mt-1 text-[22px] font-bold text-ink">
            <Money value={summary.accrued} compact />
          </p>
        </div>
        <div className="rounded-lg border border-line bg-surface p-3.5 shadow-card">
          <p className="text-[11px] font-medium uppercase tracking-wider text-ink-3">Paid out</p>
          <p className="mt-1 text-[22px] font-bold text-green-600 dark:text-emerald-400">
            <Money value={summary.paidOut} compact />
          </p>
        </div>
        <div className="rounded-lg border border-line bg-surface p-3.5 shadow-card">
          <p className="text-[11px] font-medium uppercase tracking-wider text-ink-3">Net owed</p>
          <p className="mt-1 text-[22px] font-bold text-red-500 dark:text-red-400">
            <Money value={summary.netOwed} compact />
          </p>
        </div>
      </div>

      <Panel
        title={`Wages — ${periodLabel(month)}`}
        subtitle="Wages accrue daily; payment journals hit the books immediately."
      >
        {statement.length === 0 ? (
          <EmptyState
            title="No payroll people yet"
            description="Add workers or staff to start accruing daily wages."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Person</TH>
                <TH numeric className="w-12">P</TH>
                <TH numeric className="w-12">½</TH>
                <TH numeric className="w-12">L</TH>
                <TH numeric>Credited</TH>
                <TH numeric>Paid</TH>
                <TH numeric>Balance</TH>
                <TH className="w-20" />
              </TR>
            </THead>
            <TBody>
              {statement.map((p) => (
                <TR key={`${p.entityType}-${p.entityId}`}>
                  <TD className="font-medium text-ink">{p.fullName}</TD>
                  <TD numeric>{p.daysPresent}</TD>
                  <TD numeric>{p.daysHalfDay}</TD>
                  <TD numeric>{p.daysLeave}</TD>
                  <TD numeric>
                    <Money value={p.credited} />
                  </TD>
                  <TD numeric>
                    <Money value={p.paid} />
                  </TD>
                  <TD numeric>
                    <span
                      className={
                        p.balance < 0
                          ? "text-red-500 dark:text-red-400"
                          : "text-green-600 dark:text-emerald-400"
                      }
                    >
                      <Money value={p.balance} />
                    </span>
                  </TD>
                  <TD>
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={!canManage}
                      title={!canManage ? "Requires HR manage permission" : undefined}
                      onClick={() => openPay(p)}
                    >
                      Pay
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Panel>

      {payPerson && (
        <Dialog open onClose={() => setPayPerson(null)} title={`Pay ${payPerson.fullName}`}>
          <form onSubmit={handlePay} className="flex flex-col gap-4">
            <Field label="Amount (₹)">
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min={1}
                step="0.01"
                required
              />
            </Field>
            <Field label="Pay from">
              <Select
                value={method}
                onChange={(e) => setMethod(e.target.value === "cash" ? "cash" : "bank")}
              >
                <option value="cash">Cash</option>
                <option value="bank">Bank Transfer</option>
              </Select>
            </Field>
            <Field label="Note (optional)">
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g., Weekly payment"
              />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="subtle" type="button" onClick={() => setPayPerson(null)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" loading={paying}>
                Pay
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
