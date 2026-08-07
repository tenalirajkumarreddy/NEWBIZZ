import { getPortalProfile, getPortalPayIntents } from "@/lib/data/portal";
import { Money, StatusBadge, Panel } from "@/components/ui";
import { PortalNav } from "@/components/portal/PortalNav";
import { PageHeading } from "@/components/portal/PageHeading";
import { PayIntentForm } from "@/components/portal/PayIntentForm";

export default async function PortalPayPage() {
  const [profile, intents] = await Promise.all([getPortalProfile(), getPortalPayIntents()]);

  return (
    <>
      <PortalNav />
      <PageHeading
        eyebrow="Customer portal"
        title="Make a payment"
        subtitle="Tell us you&apos;ve paid — we&apos;ll reconcile it once it arrives."
      />

      <div className="rounded-lg border border-line bg-surface p-5 shadow-card">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-4">Balance due</p>
        <div className="mt-1 text-[28px] font-bold tabular-nums text-ink">
          <Money value={profile?.outstanding ?? 0} />
        </div>
        <p className="mt-2 text-[12px] text-ink-4">
          Payments are made directly by cash, UPI, or cheque. We don&apos;t collect
          payments online — send yours through your usual channel, then record it
          here so we can match it.
        </p>
      </div>

      <div className="mt-6">
        <PayIntentForm defaultAmount={profile?.outstanding ?? undefined} />
      </div>

      <Panel title="Your submissions" bodyClassName="p-0" className="mt-6">
        {intents.length === 0 ? (
          <div className="px-4 py-8 text-center text-[13px] text-ink-3">
            No payment submissions yet.
          </div>
        ) : (
          <div className="divide-y divide-line">
            {intents.map((n) => (
              <div key={n.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-bold tabular-nums text-ink">
                      <Money value={n.amount} />
                    </span>
                    <StatusBadge status={n.status} />
                  </div>
                  <p className="mt-0.5 capitalize text-[12px] text-ink-3">
                    {n.mode}
                    {n.reference ? ` · ${n.reference}` : ""} ·{" "}
                    {new Date(n.createdAt).toLocaleString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}