import Link from "next/link";
import { listFixedAssets } from "@/lib/data/assets";
import { getCurrentFy } from "@/lib/data/fy";
import { Panel } from "@/components/ui/Card";
import { Kpi, PageContainer, PageHeader } from "@/components/ui";
import { Button } from "@/components/ui/Button";
import { StatusBadge, Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Money } from "@/components/ui/Money";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { dateIST, count as fmtCount, titleCase } from "@/lib/format";
import { RunDepreciationPanel } from "./RunDepreciationPanel";

const CLASS_LABEL: Record<string, string> = {
  plant_machinery: "Plant & Machinery",
  vehicle: "Vehicle",
  building: "Building",
  furniture: "Furniture",
  computer: "Computer",
};

// Fixed Assets & Depreciation (§5.7). Register capital assets, depreciate them
// (SLM or WDV), and dispose with gain/loss. Gross block − accumulated
// depreciation = net block, which flows straight to the Balance Sheet.
export const metadata = { title: "Fixed Assets — NEWBIZZ" };
export default async function AssetsPage() {
  const [assets, fy] = await Promise.all([listFixedAssets({ limit: 300 }), getCurrentFy()]);

  const active = assets.filter((a) => a.status === "active");
  const grossBlock = active.reduce((s, a) => s + a.capitalizedValue, 0);
  const accumDep = active.reduce((s, a) => s + a.accumulatedDep, 0);
  const netBlock = grossBlock - accumDep;

  return (
    <PageContainer>
      <PageHeader
        title="Fixed Assets"
        subtitle={
          <>
            {fy ? `FY ${fy.code}` : "FY —"} · {fmtCount(active.length)} active assets
          </>
        }
        actions={
          <>
            <Link href="/assets/depreciation" className="self-start rounded-md bg-fill px-3 py-2 text-[12px] font-semibold text-ink-2 ring-1 ring-inset ring-line hover:text-brand">
              Depreciation runs →
            </Link>
            <Link href="/assets/new" className="self-start rounded-md bg-brand px-3 py-2 text-[12px] font-semibold text-white hover:bg-brand-d">
              + Register asset
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Gross block" value={<Money value={grossBlock} />} sub="Capitalized cost" />
        <Kpi label="Accumulated dep." value={<Money value={accumDep} />} sub="Booked to date" />
        <Kpi label="Net block" value={<Money value={netBlock} />} sub="Written-down value" tone="grn" />
        <Kpi label="Active assets" value={fmtCount(active.length)} sub={`${fmtCount(assets.length - active.length)} disposed`} />
      </div>

      <RunDepreciationPanel />

      <Panel flush>
        {assets.length === 0 ? (
          <EmptyState
            title="No assets registered yet"
            description="Register a machine, vehicle, building, or computer to depreciate it over its life and keep the Balance Sheet correct."
            action={<Link href="/assets/new"><Button variant="secondary" size="sm">Register an asset</Button></Link>}
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Asset No</TH>
                <TH>Name</TH>
                <TH>Class</TH>
                <TH>Method</TH>
                <TH numeric>Cost</TH>
                <TH numeric>Accum. dep.</TH>
                <TH numeric>WDV</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {assets.map((a) => (
                <TR key={a.id} interactive>
                  <TD className="p-0">
                    <Link href={`/assets/${a.id}`} className="block px-3 py-2.5 font-mono text-[12px] font-semibold text-brand">{a.assetNo}</Link>
                  </TD>
                  <TD className="font-medium text-ink">{a.name}</TD>
                  <TD><Badge tone="slate" size="sm">{CLASS_LABEL[a.assetClass] ?? a.assetClass}</Badge></TD>
                  <TD className="text-[12px] text-ink-3">
                    {a.method === "slm" ? `SLM · ${a.usefulLifeYears}y` : `WDV · ${a.depRate}%`}
                  </TD>
                  <TD numeric><Money value={a.capitalizedValue} /></TD>
                  <TD numeric><Money value={a.accumulatedDep} /></TD>
                  <TD numeric className="font-semibold"><Money value={a.wdv} /></TD>
                  <TD><StatusBadge status={a.status} label={a.status === "disposed" ? `Disposed ${a.disposedOn ? dateIST(a.disposedOn) : ""}` : titleCase(a.status)} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Panel>
    </PageContainer>
  );
}
