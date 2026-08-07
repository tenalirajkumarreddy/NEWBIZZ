import Link from "next/link";
import { getPortalProfile, getPortalInvoices } from "@/lib/data/portal";
import { Money, Button, StatusBadge } from "@/components/ui";
import { PortalNav } from "@/components/portal/PortalNav";
import { dateIST } from "@/lib/format";

export default async function PortalHomePage() {
  const [profile, invoices] = await Promise.all([getPortalProfile(), getPortalInvoices()]);
  if (!profile) return null; // layout already guards; safety net

  const recent = invoices.slice(0, 5);

  return (
    <>
      <PortalNav />
      <div className="mb-6">
        <p className="eyebrow text-brand">Customer portal</p>
        <h1 className="mt-1 text-[24px] font-bold tracking-tight text-ink">
          Hello, {profile.name}
        </h1>
        <p className="mt-1 text-[13px] text-ink-3">
          {profile.code ? <span className="font-mono">{profile.code}</span> : null}
          {profile.gstin ? (
            <span className="ml-3 font-mono text-ink-4">GSTIN {profile.gstin}</span>
          ) : null}
        </p>
      </div>

      <div className="rounded-lg border border-line bg-surface p-5 shadow-card">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-4">
          Balance due
        </p>
        <div className="mt-2 text-[32px] font-bold tabular-nums text-ink">
          <Money value={profile.outstanding} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/portal/pay">
            <Button variant="secondary" size="sm">
              Pay towards this →
            </Button>
          </Link>
          <Link href="/portal/orders">
            <Button variant="secondary" size="sm">
              Place an order
            </Button>
          </Link>
        </div>
      </div>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-ink">Recent invoices</h2>
          <Link href="/portal/invoices" className="text-[13px] font-semibold text-brand hover:text-brand-d">
            View all
          </Link>
        </div>

        {recent.length === 0 ? (
          <div className="rounded-lg border border-line bg-surface p-8 text-center text-[13px] text-ink-3">
            No invoices yet for your account.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-line bg-surface">
            {recent.map((inv, i) => (
              <div
                key={inv.id}
                className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${
                  i > 0 ? "border-t border-line" : ""
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[13px] font-semibold text-ink">
                      {inv.invoiceNo}
                    </span>
                    <StatusBadge status={inv.status} />
                  </div>
                  <p className="mt-0.5 text-[12px] text-ink-3">
                    {inv.storeName} · {dateIST(inv.invoiceDate)}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-[14px] font-bold tabular-nums text-ink">
                    <Money value={inv.grandTotal} />
                  </div>
                  {Number(inv.due) > 0 ? (
                    <div className="text-[12px] tabular-nums text-red">Due <Money value={inv.due} /></div>
                  ) : (
                    <div className="text-[12px] text-green">Paid</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}