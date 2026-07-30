import Link from "next/link";
import { listExpenses, getPettyCashBalance } from "@/lib/data/expenses";
import { getCurrentFy } from "@/lib/data/fy";
import { Panel } from "@/components/ui/Card";
import { Kpi } from "@/components/ui";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { count as fmtCount, money } from "@/lib/format";
import { ExpensesTable } from "./ExpensesTable";
import { PettyCashPanel } from "./PettyCashPanel";

// Expenses & Petty Cash (§5.6). Operating expenses paid from user custody, the
// petty-cash box, or the bank — logged pending, then approved (posts the
// journal, decrements the source) or rejected. The petty-cash box (1115) tops
// up by contra from the bank.
export default async function ExpensesPage() {
  const [expenses, petty, fy] = await Promise.all([
    listExpenses({ limit: 300 }),
    getPettyCashBalance(),
    getCurrentFy(),
  ]);

  const pending = expenses.filter((e) => e.status === "pending");
  const approved = expenses.filter((e) => e.status === "approved");
  const pendingValue = pending.reduce((s, e) => s + e.amount, 0);
  const approvedValue = approved.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-6 py-6 lg:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-ink">Expenses &amp; Petty Cash</h1>
          <p className="mt-0.5 text-[13px] text-ink-3">
            {fy ? `FY ${fy.code}` : "FY —"} · {fmtCount(expenses.length)} expenses
          </p>
        </div>
        <Link
          href="/expenses/new"
          className="self-start rounded-md bg-brand px-3 py-2 text-[12px] font-semibold text-white hover:bg-brand-d"
        >
          + Log expense
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Pending approval" value={fmtCount(pending.length)} sub={money(pendingValue)} tone={pending.length > 0 ? "amb" : "grn"} />
        <Kpi label="Approved (posted)" value={fmtCount(approved.length)} sub={money(approvedValue)} />
        <Kpi label="Petty cash balance" value={money(petty)} sub="Box on hand" tone={petty > 0 ? "grn" : "amb"} />
        <Kpi label="Total expenses" value={fmtCount(expenses.length)} sub="This financial year" />
      </div>

      <PettyCashPanel balance={petty} />

      <Panel flush>
        {expenses.length === 0 ? (
          <EmptyState
            title="No expenses yet"
            description="Log an operating expense — fuel, rent, power, transport — paid from a user's cash, the petty-cash box, or the bank. It posts to the ledger once approved."
            action={
              <Link href="/expenses/new">
                <Button variant="secondary" size="sm">Log an expense</Button>
              </Link>
            }
          />
        ) : (
          <ExpensesTable expenses={expenses} />
        )}
      </Panel>
    </div>
  );
}
