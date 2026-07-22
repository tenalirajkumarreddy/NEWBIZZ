import Link from "next/link";
import { notFound } from "next/navigation";
import { getScheme } from "@/lib/data/creditnotes";
import { Panel, Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/Badge";
import { Money } from "@/components/ui/Money";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { dateIST, count as fmtCount, qty as fmtQty, percent } from "@/lib/format";
import { SchemeEligibilityPanel } from "./SchemeEligibilityPanel";

// Scheme detail (§7.5) — the tier ladder, the date window, and per-store
// eligibility. Managers run the month-end calc, then approve+post each store's
// rebate as a credit note. Posting reverses proportional GST when gst_adjusted.
export default async function SchemeDetailPage({ params }: { params: { id: string } }) {
  const scheme = await getScheme(params.id);
  if (!scheme) notFound();

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-4 px-6 py-6 lg:px-8">
      {/* Breadcrumb + header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/credit-notes/schemes" className="text-[12px] font-medium text-ink-4 hover:text-brand">
            ← Volume Schemes
          </Link>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="text-[22px] font-bold tracking-tight text-ink">{scheme.name}</h1>
            <StatusBadge status={scheme.status} />
          </div>
          <p className="mt-0.5 text-[13px] text-ink-3">
            {dateIST(scheme.periodStart)} – {dateIST(scheme.periodEnd)} ·{" "}
            {scheme.gstAdjusted
              ? `GST-adjusted @ ${percent(scheme.gstRate, { alreadyPct: true, decimals: 0 })}`
              : "No GST adjustment"}
          </p>
        </div>
      </div>

      {/* Tier ladder */}
      <Panel title="Rebate tiers" flush>
        <Table>
          <THead>
            <TR>
              <TH className="w-16">Tier</TH>
              <TH numeric>Min cases</TH>
              <TH numeric>Rebate / case</TH>
            </TR>
          </THead>
          <TBody>
            {scheme.tiers.map((t, i) => (
              <TR key={i}>
                <TD className="text-ink-4">{i + 1}</TD>
                <TD numeric>{fmtQty(t.min_cases)}</TD>
                <TD numeric><Money value={t.rebate_per_case} /></TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {scheme.tiers.length === 0 && (
          <p className="px-4 py-3 text-[12px] text-ink-4">No tiers configured.</p>
        )}
      </Panel>

      {/* Eligibility — client island for calc + per-row post */}
      <SchemeEligibilityPanel
        schemeId={scheme.id}
        schemeStatus={scheme.status}
        rows={scheme.rows}
      />

      <Card className="p-3.5">
        <p className="text-[11px] text-ink-4">
          {fmtCount(scheme.eligibleStores)} stores scored ·{" "}
          {fmtCount(scheme.pendingApproval)} awaiting approval. Posting a rebate creates a customer
          credit note and marks the row posted.
        </p>
      </Card>
    </div>
  );
}
