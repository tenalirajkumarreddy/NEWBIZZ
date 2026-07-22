import Link from "next/link";
import { listExpenseAccounts } from "@/lib/data/expenses";
import { listActiveUsers } from "@/lib/data/holdings";
import { EmptyState } from "@/components/ui/EmptyState";
import { Panel } from "@/components/ui/Card";
import { NewExpenseForm } from "./NewExpenseForm";

export default async function NewExpensePage() {
  const [accounts, users] = await Promise.all([listExpenseAccounts(), listActiveUsers()]);

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-4 px-6 py-6 lg:px-8">
      <div>
        <Link href="/expenses" className="text-[12px] font-medium text-ink-4 hover:text-brand">← Expenses</Link>
        <h1 className="mt-1 text-[22px] font-bold tracking-tight text-ink">Log expense</h1>
        <p className="mt-0.5 text-[13px] text-ink-3">Capture an operating expense. It posts to the ledger once approved.</p>
      </div>
      {accounts.length === 0 ? (
        <Panel flush>
          <EmptyState title="No expense accounts" description="The chart of accounts has no postable expense ledgers yet." />
        </Panel>
      ) : (
        <NewExpenseForm accounts={accounts} users={users} />
      )}
    </div>
  );
}
