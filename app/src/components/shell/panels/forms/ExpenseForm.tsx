"use client";

// =====================================================================
// components/shell/panels/forms/ExpenseForm.tsx — minimal expense
// capture for quick-attach: date, category, account, source, amount,
// note. Mirrors the /expenses form semantics (labels follow
// NewExpenseForm; options mirror the ExpenseCategory / ExpenseSource
// union types exported by lib/data/expenses.ts). Approval stays a
// separate act on the register page.
// =====================================================================

import { useState, useTransition } from "react";
import { Field, Input, Select } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { recordExpense } from "@/lib/actions/expenses";
import { pickExpenseAccounts } from "@/lib/actions/quick-attach";
import { todayIST } from "@/lib/constants";
import type { ExpenseCategory, ExpenseSource } from "@/lib/data/expenses";

// Mirrors the `expense_category` DB enum (exported as ExpenseCategory in
// lib/data/expenses.ts); labels match NewExpenseForm's CATEGORIES.
const CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: "fuel", label: "Fuel" },
  { value: "repair", label: "Repair" },
  { value: "salary", label: "Salary" },
  { value: "rent", label: "Rent" },
  { value: "power", label: "Power" },
  { value: "transport", label: "Transport" },
  { value: "office", label: "Office" },
  { value: "bank_charges", label: "Bank charges" },
  { value: "misc", label: "Miscellaneous" },
];

// Mirrors the `expense_source` DB enum (exported as ExpenseSource in
// lib/data/expenses.ts). user_holding needs no picker here — the RPC
// defaults it to the caller's own custody float.
const SOURCES: { value: ExpenseSource; label: string }[] = [
  { value: "petty_cash", label: "Petty cash" },
  { value: "bank", label: "Bank" },
  { value: "user_holding", label: "User custody" },
];

export function ExpenseForm({ onCreated }: { onCreated: (entityType: string, entityId: string) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [accounts, setAccounts] = useState<{ id: string; label: string }[]>([]);
  const [form, setForm] = useState({
    expense_date: todayIST(),
    category: "fuel" as ExpenseCategory,
    account_code: "",
    source: "petty_cash" as ExpenseSource,
    amount: "",
    note: "",
  });

  const canSubmit = !!form.account_code && Number(form.amount) > 0 && !pending;

  function loadAccounts() {
    if (accounts.length) return;
    startTransition(async () => {
      const res = await pickExpenseAccounts();
      if (res.ok && res.options) setAccounts(res.options.map((o) => ({ id: o.id, label: o.label })));
    });
  }

  function submit() {
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      const res = await recordExpense({
        expense_date: form.expense_date,
        category: form.category as ExpenseCategory,
        account_code: form.account_code,
        source: form.source,
        amount: Number(form.amount),
        note: form.note.trim() || undefined,
      });
      if (res.ok) onCreated("expense", res.expenseId);
      else setError(res.error ?? "Could not save the expense.");
    });
  }

  return (
    <div className="flex flex-col gap-3" onMouseDownCapture={loadAccounts}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">
          <Input type="date" max={todayIST()} value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} />
        </Field>
        <Field label="Amount">
          <Input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" className="text-right" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category">
          <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as ExpenseCategory })}>
            {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </Select>
        </Field>
        <Field label="Account">
          <Select value={form.account_code} onChange={(e) => setForm({ ...form, account_code: e.target.value })}>
            <option value="">Pick account…</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Paid from" hint={form.source === "user_holding" ? "Comes out of your own custody float" : undefined}>
        <Select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value as ExpenseSource })}>
          {SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </Select>
      </Field>
      <Field label="Note">
        <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="What was this for?" />
      </Field>
      {error && <p className="text-[11px] font-medium text-red">{error}</p>}
      <Button variant="primary" onClick={submit} loading={pending} disabled={!canSubmit}>Create expense</Button>
    </div>
  );
}
