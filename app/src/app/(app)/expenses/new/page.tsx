import { listExpenseAccounts } from "@/lib/data/expenses";
import { listActiveUsers } from "@/lib/data/holdings";
import { EmptyState } from "@/components/ui/EmptyState";
import { Panel } from "@/components/ui/Card";
import { PageContainer, PageHeader } from "@/components/ui";
import { NewExpenseForm } from "./NewExpenseForm";

export default async function NewExpensePage() {
  const [accounts, users] = await Promise.all([listExpenseAccounts(), listActiveUsers()]);

  return (
    <PageContainer width="form">
      <PageHeader
        title="Log expense"
        subtitle="Capture an operating expense. It posts to the ledger once approved."
        backHref="/expenses"
        backLabel="Expenses"
      />
      {accounts.length === 0 ? (
        <Panel flush>
          <EmptyState title="No expense accounts" description="The chart of accounts has no postable expense ledgers yet." />
        </Panel>
      ) : (
        <NewExpenseForm accounts={accounts} users={users} />
      )}
    </PageContainer>
  );
}
