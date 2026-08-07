import Link from "next/link";
import { getPortalOrders } from "@/lib/data/portal";
import { StatusBadge, Button } from "@/components/ui";
import { PortalNav } from "@/components/portal/PortalNav";
import { PageHeading } from "@/components/portal/PageHeading";
import { dateIST } from "@/lib/format";

export default async function PortalOrdersPage() {
  const orders = await getPortalOrders();

  return (
    <>
      <PortalNav />
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <PageHeading
          eyebrow="Customer portal"
          title="Orders"
          subtitle="Orders you place here are confirmation-capture — we fulfil and invoice them."
        />
        <Link href="/portal/orders/new">
          <Button size="lg">New order →</Button>
        </Link>
      </div>

      {orders.length === 0 ? (
        <div className="rounded-lg border border-line bg-surface p-8 text-center text-[13px] text-ink-3">
          No orders yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-line bg-surface">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-fill text-[11px] uppercase tracking-wide text-ink-4">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Order</th>
                <th className="px-4 py-2.5 font-semibold">Date</th>
                <th className="px-4 py-2.5 font-semibold">Store</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 font-semibold">Notes</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o, i) => (
                <tr key={o.id} className={i > 0 ? "border-t border-line" : ""}>
                  <td className="px-4 py-3 font-mono font-semibold text-ink">{o.orderNo}</td>
                  <td className="px-4 py-3 tabular-nums text-ink-2">{dateIST(o.orderDate)}</td>
                  <td className="px-4 py-3 text-ink-2">{o.storeName}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={o.status} />
                  </td>
                  <td className="px-4 py-3 text-ink-3">{o.notes ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}