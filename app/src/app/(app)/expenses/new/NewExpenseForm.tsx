"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Panel, Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Select, Input, Textarea } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { UnsavedGuard, useFormDirty } from "@/components/ui";
import { recordExpense } from "@/lib/actions/expenses";
import type { ExpenseAccountOption, ExpenseCategory, ExpenseSource } from "@/lib/data/expenses";
import type { UserOption } from "@/lib/data/holdings";

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

const SOURCES: { value: ExpenseSource; label: string; hint: string }[] = [
  { value: "petty_cash", label: "Petty cash", hint: "From the petty-cash box (1115)" },
  { value: "bank", label: "Bank", hint: "Paid directly from bank (1120)" },
  { value: "user_holding", label: "User custody", hint: "From a user's cash float (2140)" },
];

const todayIST = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

export function NewExpenseForm({
  accounts,
  users,
}: {
  accounts: ExpenseAccountOption[];
  users: UserOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  const { dirty, reset } = useFormDirty(rootRef);

  const [date, setDate] = useState(todayIST());
  const [category, setCategory] = useState<ExpenseCategory>("fuel");
  const [accountCode, setAccountCode] = useState(accounts[0]?.code ?? "");
  const [source, setSource] = useState<ExpenseSource>("petty_cash");
  const [userId, setUserId] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const sourceHint = SOURCES.find((s) => s.value === source)?.hint;
  const canSubmit = !!accountCode && Number(amount) > 0 && !pending && (source !== "user_holding" || !!userId);

  function submit() {
    if (!canSubmit) return;
    startTransition(async () => {
      const res = await recordExpense({
        expense_date: date,
        category,
        account_code: accountCode,
        source,
        amount: Number(amount),
        user_id: source === "user_holding" ? userId : undefined,
        note: note || undefined,
      });
      if (res.ok) {
        reset();
        toast.success("Expense logged", "Pending approval — money moves once approved.");
        router.push(`/expenses/${res.expenseId}`);
        router.refresh();
      } else {
        toast.error("Could not log expense", res.error);
      }
    });
  }

  return (
    <div ref={rootRef} className="flex flex-col gap-4">
      <UnsavedGuard dirty={dirty} message="You have unsaved changes to this expense. They'll be lost if you leave this page." />
      <Panel title="Expense details">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date" required htmlFor="date">
            <Input id="date" type="date" value={date} max={todayIST()} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Amount (₹)" required htmlFor="amount">
            <Input id="amount" type="number" min={0} step="any" value={amount} onChange={(e) => setAmount(e.target.value)} className="text-right" placeholder="0.00" />
          </Field>
          <Field label="Category" required htmlFor="category">
            <Select id="category" value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Select>
          </Field>
          <Field label="Expense account" required htmlFor="account" hint="Which ledger the debit lands in">
            <Select id="account" value={accountCode} onChange={(e) => setAccountCode(e.target.value)}>
              {accounts.length === 0 && <option value="">No expense accounts</option>}
              {accounts.map((a) => <option key={a.code} value={a.code}>{a.code} — {a.name}</option>)}
            </Select>
          </Field>
        </div>
      </Panel>

      <Panel title="Paid from">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Source" required htmlFor="source" hint={sourceHint}>
            <Select id="source" value={source} onChange={(e) => setSource(e.target.value as ExpenseSource)}>
              {SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </Select>
          </Field>
          {source === "user_holding" && (
            <Field label="User" required htmlFor="user" hint="Whose cash float this comes out of">
              <Select id="user" value={userId} onChange={(e) => setUserId(e.target.value)}>
                <option value="">Select a user…</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
              </Select>
            </Field>
          )}
        </div>
      </Panel>

      <Panel title="Note">
        <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was this for? (optional)" />
      </Panel>

      <Card className="flex items-center justify-end gap-2 p-4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/expenses")}>Cancel</Button>
        <Button variant="primary" size="md" onClick={submit} loading={pending} disabled={!canSubmit}>Log expense</Button>
      </Card>
      <p className="text-[11px] text-ink-4">Logging creates a pending expense — no money moves until it&rsquo;s approved.</p>
    </div>
  );
}
