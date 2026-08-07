import { getPortalInvoices } from "@/lib/data/portal";
import { Money, StatusBadge } from "@/components/ui";
import { PortalNav } from "@/components/portal/PortalNav";
import { PageHeading } from "@/components/portal/PageHeading";
import { dateIST } from "@/lib/format";

export default async function PortalInvoicesPage() {
  const invoices = await getPortalInvoices();

  return (
    <>
      <PortalNav />
      <PageHeading
        eyebrow="Customer portal"
        title="Invoices"
        subtitle="Your invoice history across all store locations."
      />

      {invoices.length === 0 ? (
        <div className="rounded-lg border border-line bg-surface p-8 text-center text-[13px] text-ink-3">
          No invoices yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-line bg-surface">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-fill text-[11px] uppercase tracking-wide text-ink-4">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Invoice</th>
                <th className="px-4 py-2.5 font-semibold">Date</th>
                <th className="px-4 py-2.5 font-semibold">Store</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 text-right font-semibold">Total</th>
                <th className="px-4 py-2.5 text-right font-semibold">Due</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv, i) => (
                <tr key={inv.id} className={i > 0 ? "border-t border-line" : ""}>
                  <td className="px-4 py-3 font-mono font-semibold text-ink">{inv.invoiceNo}</td>
                  <td className="px-4 py-3 tabular-nums text-ink-2">{dateIST(inv.invoiceDate)}</td>
                  <td className="px-4 py-3 text-ink-2">{inv.storeName}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={inv.status} />
                  </td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums text-ink">
                    <Money value={inv.grandTotal} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink-2">
                    {Number(inv.due) > 0 ? (
                      <span className="text-red">
                        <Money value={inv.due} />
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}