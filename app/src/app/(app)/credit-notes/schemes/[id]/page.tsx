import { notFound } from "next/navigation";
import { getScheme } from "@/lib/data/creditnotes";
import { Panel, Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/Badge";
import { Money } from "@/components/ui/Money";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { dateIST, count as fmtCount, qty as fmtQty, percent } from "@/lib/format";
import { PageContainer, PageHeader } from "@/components/ui";
import { SchemeEligibilityPanel } from "./SchemeEligibilityPanel";

// Scheme detail (§7.5) — the tier ladder, the date window, and per-store
// eligibility. Managers run the month-end calc, then approve+post each store's
// rebate as a credit note. Posting reverses proportional GST when gst_adjusted.
export default async function SchemeDetailPage({ params }: { params: { id: string } }) {
  const scheme = await getScheme(params.id);
  if (!scheme) notFound();

  return (
    <PageContainer width="report">
      <PageHeader
        backHref="/credit-notes/schemes"
        backLabel="Volume Schemes"
        title={<>{scheme.name} <StatusBadge status={scheme.status} /></>}
        subtitle={`${dateIST(scheme.periodStart)} – ${dateIST(scheme.periodEnd)} · ${
          scheme.gstAdjusted
            ? `GST-adjusted @ ${percent(scheme.gstRate, { alreadyPct: true, decimals: 0 })}`
            : "No GST adjustment"
        }`}
      />

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
    </PageContainer>
  );
}
