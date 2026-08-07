import Link from "next/link";
import { getPortalStatement } from "@/lib/data/portal";
import { Money } from "@/components/ui";
import { PortalNav } from "@/components/portal/PortalNav";
import { PageHeading } from "@/components/portal/PageHeading";
import { dateTimeIST } from "@/lib/format";

export default async function PortalStatementPage() {
  const [statement] = await Promise.all([getPortalStatement(200, 0)]);

  return (
    <>
      <PortalNav />
      <PageHeading
        eyebrow="Customer portal"
        title="Statement"
        subtitle="Running balance across invoices and payments."
      />

      {statement.length === 0 ? (
        <div className="rounded-lg border border-line bg-surface p-8 text-center text-[13px] text-ink-3">
          No transactions yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-line bg-surface">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-fill text-[11px] uppercase tracking-wide text-ink-4">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Date</th>
                <th className="px-4 py-2.5 font-semibold">Type</th>
                <th className="px-4 py-2.5 font-semibold">Reference</th>
                <th className="px-4 py-2.5 font-semibold">Store</th>
                <th className="px-4 py-2.5 text-right font-semibold">Amount</th>
                <th className="px-4 py-2.5 text-right font-semibold">Balance</th>
              </tr>
            </thead>
            <tbody>
              {statement.map((t, i) => (
                <tr key={t.id} className={i > 0 ? "border-t border-line" : ""}>
                  <td className="px-4 py-3 tabular-nums text-ink-2">
                    {dateTimeIST(t.createdAt)}
                  </td>
                  <td className="px-4 py-3 capitalize text-ink">{t.txnType.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3">
                    {t.referenceType ? (
                      <Link
                        href={
                          t.referenceType === "invoices"
                            ? `/portal/invoices`
                            : `/portal/statement`
                        }
                        className="font-mono text-brand hover:text-brand-d"
                      >
                        {t.invoiceNo ?? t.receiptNo ?? "—"}
                      </Link>
                    ) : (
                      <span className="text-ink-4">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-2">{t.storeName ?? "—"}</td>
                  <td
                    className={`px-4 py-3 text-right font-bold tabular-nums ${
                      t.amount < 0 ? "text-red" : "text-green"
                    }`}
                  >
                    <Money value={t.amount} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink-2">
                    <Money value={t.balanceAfter} />
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