import Link from "next/link";
import { listCustomers } from "@/lib/data/customers";
import { Panel } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Kpi, PageContainer, PageHeader } from "@/components/ui";
import { EmptyState } from "@/components/ui/EmptyState";
import { Money } from "@/components/ui/Money";
import { count as fmtCount } from "@/lib/format";
import { CustomersTable } from "./CustomersTable";

export const metadata = { title: "Customers & Stores — NEWBIZZ" };
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
    <PageContainer width="full">
      <PageHeader
        title="Customers"
        subtitle={<>{fmtCount(customers.length)} customers · {fmtCount(active)} active</>}
        actions={
          <>
            <Link href="/customers/stores/new">
              <Button variant="secondary" size="sm">New store</Button>
            </Link>
            <Link href="/customers/new">
              <Button variant="primary" size="sm">New customer</Button>
            </Link>
          </>
        }
      />

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
    </PageContainer>
  );
}
