import Link from "next/link";
import { listCustomers } from "@/lib/data/customers";
import { Panel } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Kpi } from "@/components/ui";
import { EmptyState } from "@/components/ui/EmptyState";
import { Money } from "@/components/ui/Money";
import { count as fmtCount } from "@/lib/format";
import { CustomersTable } from "./CustomersTable";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; kind?: string; status?: string }>;
}) {
  const sp = await searchParams;
  const customers = await listCustomers({
    query: sp.q,
    kind: sp.kind as any,
    status: sp.status,
  });

  const active = customers.filter((c) => c.status === "active").length;
  const storeTotal = customers.reduce((s, c) => s + c.storeCount, 0);
  const onCredit = customers.filter((c) => c.creditLimit > 0);
  const creditExtended = onCredit.reduce((s, c) => s + c.creditLimit, 0);

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-6 py-6 lg:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-ink">Customers</h1>
          <p className="mt-0.5 text-[13px] text-ink-3">
            {fmtCount(customers.length)} customers · {fmtCount(active)} active
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/customers/stores/new">
            <Button variant="secondary" size="sm">New store</Button>
          </Link>
          <Link href="/customers/new">
            <Button variant="primary" size="sm">New customer</Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Customers" value={fmtCount(customers.length)} sub={`${fmtCount(active)} active`} />
        <Kpi label="Stores" value={fmtCount(storeTotal)} sub="Ship-to outlets" />
        <Kpi
          label="On credit"
          value={fmtCount(onCredit.length)}
          sub={`${fmtCount(customers.length - onCredit.length)} cash-only`}
        />
        <Kpi
          label="Credit extended"
          value={<Money value={creditExtended} />}
          sub="Sum of credit limits"
        />
      </div>

      <Panel flush>
        {customers.length === 0 ? (
          <EmptyState
            title="No customers yet"
            description="Add customers and their stores before placing orders or recording sales."
            action={
              <Link href="/customers/new">
                <Button variant="secondary" size="sm">Add a customer</Button>
              </Link>
            }
          />
        ) : (
          <CustomersTable customers={customers} />
        )}
      </Panel>
    </div>
  );
}
