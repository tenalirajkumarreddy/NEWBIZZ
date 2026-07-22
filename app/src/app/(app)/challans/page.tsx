import Link from "next/link";
import { listChallans } from "@/lib/data/challans";
import { getCurrentFy } from "@/lib/data/fy";
import { Panel } from "@/components/ui/Card";
import { Kpi } from "@/components/ui/Kpi";
import { EmptyState } from "@/components/ui/EmptyState";
import { count as fmtCount } from "@/lib/format";
import { ChallansTable } from "./ChallansTable";

// Delivery Challans — the physical-fulfilment register (§4.4). A challan lists
// which ordered units left the warehouse and tracks transit
// (printed → in_transit → delivered). No money and no stock move here — the
// value event stays on the invoice; delivery just rolls the order state.
export default async function ChallansPage() {
  const [challans, fy] = await Promise.all([listChallans({ limit: 200 }), getCurrentFy()]);

  const printed = challans.filter((c) => c.status === "printed").length;
  const inTransit = challans.filter((c) => c.status === "in_transit").length;
  const delivered = challans.filter((c) => c.status === "delivered").length;

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-6 py-6 lg:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-ink">Delivery Challans</h1>
          <p className="mt-0.5 text-[13px] text-ink-3">
            {fy ? `FY ${fy.code}` : "FY —"} · {fmtCount(challans.length)} challans
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="To dispatch"
          value={fmtCount(printed)}
          sub="Printed, not yet moving"
          tone={printed > 0 ? "amb" : "grn"}
        />
        <Kpi
          label="In transit"
          value={fmtCount(inTransit)}
          sub="On the way"
          tone={inTransit > 0 ? "amb" : "grn"}
        />
        <Kpi label="Delivered" value={fmtCount(delivered)} sub="Fulfilment recorded" />
        <Kpi label="Total" value={fmtCount(challans.length)} sub="This financial year" />
      </div>

      <Panel flush>
        {challans.length === 0 ? (
          <EmptyState
            title="No challans yet"
            description="A delivery challan records which ordered units left the warehouse. Raise one from a confirmed order to start tracking fulfilment."
            action={
              <Link href="/orders" className="text-[12px] font-semibold text-brand hover:underline">
                Go to the Order Book →
              </Link>
            }
          />
        ) : (
          <ChallansTable challans={challans} />
        )}
      </Panel>
    </div>
  );
}
