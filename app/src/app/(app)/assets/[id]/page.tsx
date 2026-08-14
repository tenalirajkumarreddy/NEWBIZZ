import Link from "next/link";
import { notFound } from "next/navigation";
import { getFixedAsset } from "@/lib/data/assets";
import { Panel, Card } from "@/components/ui/Card";
import { StatusBadge, Badge } from "@/components/ui/Badge";
import { Money } from "@/components/ui/Money";
import { EmptyState } from "@/components/ui/EmptyState";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { dateIST } from "@/lib/format";
import { PageContainer } from "@/components/ui";
import { DisposeAssetPanel } from "./DisposeAssetPanel";

const CLASS_LABEL: Record<string, string> = {
  plant_machinery: "Plant & Machinery",
  vehicle: "Vehicle",
  building: "Building",
  furniture: "Furniture & Fixtures",
  computer: "Computer",
};

// Fixed-asset detail (§5.7). Cost, accumulated depreciation, live WDV, the
// depreciation history, and — while active — the dispose action (books gain/loss
// vs WDV and removes the asset from the block).
export default async function AssetDetailPage({ params }: { params: { id: string } }) {
  const asset = await getFixedAsset(params.id);
  if (!asset) notFound();

  return (
    <PageContainer width="report">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/assets" className="text-[12px] font-medium text-ink-4 hover:text-brand">← Fixed Assets</Link>
          <div className="mt-1 flex items-center gap-3">
            <span className="font-mono text-[13px] text-ink-4">{asset.assetNo}</span>
            <h1 className="text-[22px] font-bold tracking-tight text-ink">{asset.name}</h1>
            <StatusBadge status={asset.status} />
          </div>
          <p className="mt-0.5 text-[13px] text-ink-3">
            {dateIST(asset.purchaseDate)} · <Badge tone="slate" size="sm">{CLASS_LABEL[asset.assetClass] ?? asset.assetClass}</Badge>
            {" · "}
            {asset.method === "slm" ? `SLM over ${asset.usefulLifeYears}y` : `WDV @ ${asset.depRate}%/yr`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Fact label="Capitalized cost" value={<Money value={asset.capitalizedValue} />} mono />
        <Fact label="Accumulated dep." value={<Money value={asset.accumulatedDep} />} mono />
        <Fact label="Written-down value" value={<Money value={asset.wdv} />} mono tone="grn" />
        <Fact label="Salvage value" value={<Money value={asset.salvageValue} />} mono />
      </div>

      {asset.status === "active" && <DisposeAssetPanel assetId={asset.id} assetNo={asset.assetNo} wdv={asset.wdv} />}

      {asset.status === "disposed" && asset.disposalJournalId && (
        <Card className="flex items-center justify-between p-4">
          <div className="text-[13px] text-ink-2">Disposed on {asset.disposedOn ? dateIST(asset.disposedOn) : "—"}.</div>
          <Link href={`/journal/${asset.disposalJournalId}`} className="text-[12px] font-semibold text-brand hover:underline">
            View disposal entry →
          </Link>
        </Card>
      )}

      <Panel title="Depreciation history" flush>
        {asset.depHistory.length === 0 ? (
          <EmptyState
            title="No depreciation booked yet"
            description="Depreciation accrues on this asset once monthly runs are executed."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Run</TH>
                <TH>Date</TH>
                <TH>Period</TH>
                <TH numeric>WDV before</TH>
                <TH numeric>Charge</TH>
                <TH numeric>WDV after</TH>
              </TR>
            </THead>
            <TBody>
              {asset.depHistory.map((h, i) => (
                <TR key={`${h.runNo}-${i}`}>
                  <TD className="font-mono text-[12px] text-ink-3">{h.runNo}</TD>
                  <TD>{h.runDate ? dateIST(h.runDate) : "—"}</TD>
                  <TD className="text-[12px] text-ink-3">{h.periodLabel ?? "—"}</TD>
                  <TD numeric><Money value={h.wdvBefore} /></TD>
                  <TD numeric><Money value={h.amount} /></TD>
                  <TD numeric><Money value={h.wdvAfter} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Panel>

      {asset.note && (
        <Card className="p-4">
          <div className="eyebrow text-ink-4">Note</div>
          <p className="mt-1 text-[13px] text-ink-2">{asset.note}</p>
        </Card>
      )}
    </PageContainer>
  );
}

function Fact({ label, value, mono, tone }: { label: string; value: React.ReactNode; mono?: boolean; tone?: "grn" }) {
  const toneClass = tone === "grn" ? "text-grn" : "text-ink";
  return (
    <Card className="p-3.5">
      <div className="eyebrow text-ink-4">{label}</div>
      <div className={"mt-1 text-[15px] font-semibold " + toneClass + (mono ? " font-mono tnum" : "")}>{value}</div>
    </Card>
  );
}
