import Link from "next/link";
import { listOrders, listStores, listSellableItems } from "@/lib/data/sales";
import { getCurrentFy } from "@/lib/data/fy";
import { Panel } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Kpi, PageContainer, PageHeader } from "@/components/ui";
import { EmptyState } from "@/components/ui/EmptyState";
import { Money } from "@/components/ui/Money";
import { count as fmtCount } from "@/lib/format";
import { OrdersTable } from "./OrdersTable";
import { NewOrderAction } from "./NewOrderAction";

// Order Book — the register of sales orders (§4.4, demand documents). Each row
// carries its own actions: a confirmed order can raise its invoice (the value
// event) or be cancelled right from the list; the detail page has the same.
export const metadata = { title: "Order Book — NEWBIZZ" };
export default async function OrdersPage() {
  const [orders, fy, stores, items] = await Promise.all([
    listOrders({ limit: 200 }),
    getCurrentFy(),
    listStores(),
    listSellableItems(),
  ]);

  const confirmed = orders.filter((o) => o.status === "confirmed");
  const confirmedValue = confirmed.reduce((s, o) => s + o.netValue, 0);
  const invoiced = orders.filter((o) => o.status === "invoiced").length;
  const draft = orders.filter((o) => o.status === "draft").length;

  return (
    <PageContainer width="full">
      <PageHeader
        title="Order Book"
        subtitle={
          <>
            {fy ? `FY ${fy.code}` : "FY —"} · {fmtCount(orders.length)} orders
          </>
        }
        actions={<NewOrderAction stores={stores} items={items} />}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Awaiting invoice"
          value={fmtCount(confirmed.length)}
          sub="Confirmed orders"
          tone={confirmed.length > 0 ? "amb" : "grn"}
        />
        <Kpi
          label="Value awaiting invoice"
          value={<Money value={confirmedValue} />}
          sub="Posts when invoiced"
        />
        <Kpi label="Invoiced" value={fmtCount(invoiced)} sub="Converted to sales" />
        <Kpi label="Drafts" value={fmtCount(draft)} sub="Not yet confirmed" />
      </div>

      <Panel flush>
        {orders.length === 0 ? (
          <EmptyState
            title="No orders yet"
            description="Orders capture demand with no accounting impact — value posts when an order is invoiced."
            action={
              <Link href="/orders/new">
                <Button variant="secondary" size="sm">Place an order</Button>
              </Link>
            }
          />
        ) : (
          <OrdersTable orders={orders} />
        )}
      </Panel>
    </PageContainer>
  );
}
