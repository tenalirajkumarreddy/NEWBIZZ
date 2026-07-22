import Link from "next/link";
import { listSchemes } from "@/lib/data/creditnotes";
import { Panel, Card } from "@/components/ui/Card";
import { Kpi } from "@/components/ui/Kpi";
import { StatusBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { dateIST, count as fmtCount, percent } from "@/lib/format";
import { NewSchemePanel } from "./NewSchemePanel";

// Volume schemes (§7.5) — tiered rebate windows. Month-end, calc_scheme_
// eligibility scores each store's case volume against the tiers; a manager
// approves and posts the rebate as a customer credit note (never cash).
export default async function SchemesPage() {
  const schemes = await listSchemes();

  const active = schemes.filter((s) => s.status === "active").length;
  const pending = schemes.reduce((s, sc) => s + sc.pendingApproval, 0);

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-6 py-6 lg:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/credit-notes" className="text-[12px] font-medium text-ink-4 hover:text-brand">
            ← Credit Notes
          </Link>
          <h1 className="mt-1 text-[22px] font-bold tracking-tight text-ink">Volume Schemes</h1>
          <p className="mt-0.5 text-[13px] text-ink-3">
            {fmtCount(schemes.length)} schemes · tiered rebates issued as credit notes
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Active schemes" value={fmtCount(active)} sub="Open rebate windows" />
        <Kpi label="Total schemes" value={fmtCount(schemes.length)} sub="All windows" />
        <Kpi
          label="Rebates to approve"
          value={fmtCount(pending)}
          sub="Across all schemes"
          tone={pending > 0 ? "amb" : "grn"}
        />
      </div>

      <NewSchemePanel />

      <Panel title="Schemes" flush>
        {schemes.length === 0 ? (
          <EmptyState
            title="No schemes yet"
            description="A volume scheme rewards stores that hit case-volume tiers over a window. Create one above, then run the month-end calc to score eligibility."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Scheme</TH>
                <TH>Window</TH>
                <TH numeric>Tiers</TH>
                <TH>GST</TH>
                <TH numeric>Stores</TH>
                <TH numeric>To approve</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {schemes.map((s) => (
                <TR key={s.id} interactive>
                  <TD className="p-0">
                    <Link
                      href={`/credit-notes/schemes/${s.id}`}
                      className="block px-3 py-2.5 font-semibold text-brand"
                    >
                      {s.name}
                    </Link>
                  </TD>
                  <TD className="text-[12px]">
                    {dateIST(s.periodStart)} – {dateIST(s.periodEnd)}
                  </TD>
                  <TD numeric>{fmtCount(s.tiers.length)}</TD>
                  <TD className="text-[12px] text-ink-3">
                    {s.gstAdjusted ? `Adj @ ${percent(s.gstRate, { alreadyPct: true, decimals: 0 })}` : "None"}
                  </TD>
                  <TD numeric>{fmtCount(s.eligibleStores)}</TD>
                  <TD numeric className={s.pendingApproval > 0 ? "text-amb font-semibold" : "text-ink-4"}>
                    {fmtCount(s.pendingApproval)}
                  </TD>
                  <TD><StatusBadge status={s.status} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Panel>

      <Card className="p-3.5">
        <p className="text-[11px] text-ink-4">
          Rebates never pay out cash — they post as customer credit notes that reduce outstanding.
          GST-adjusted schemes also reverse proportional output tax.
        </p>
      </Card>
    </div>
  );
}
