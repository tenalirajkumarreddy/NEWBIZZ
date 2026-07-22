import Link from "next/link";
import { notFound } from "next/navigation";
import { getCustomer, getCustomerActivity } from "@/lib/data/customers";
import { Panel, Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Kpi } from "@/components/ui/Kpi";
import { Money } from "@/components/ui/Money";
import { ImageUpload } from "@/components/ui/ImageUpload";
import { PartyLedger } from "@/components/shared/PartyLedger";
import { count as fmtCount, money, percent, titleCase } from "@/lib/format";
import { StoresPanel } from "./StoresPanel";

const BUCKET_LABEL: Record<string, string> = {
  current: "Not due",
  "0-30": "0–30d",
  "31-60": "31–60d",
  "61-90": "61–90d",
  "90+": "90d+",
};

export default async function CustomerDetailPage({ params }: { params: { id: string } }) {
  const customer = await getCustomer(params.id);
  if (!customer) notFound();
  const activity = await getCustomerActivity(customer.id);

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-5 px-6 py-6 lg:px-8">
      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <ImageUpload target="customer" id={customer.id} imageUrl={customer.imageUrl} name={customer.name} />
          <div>
            <Link href="/customers" className="text-[12px] font-medium text-ink-4 hover:text-brand">
              ← Customers
            </Link>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <h1 className="text-[22px] font-bold tracking-tight text-ink">{customer.name}</h1>
              <span className="font-mono text-[13px] text-ink-4">{customer.code}</span>
              <Badge tone={customer.status === "active" ? "grn" : "slate"} size="sm">{customer.status}</Badge>
              {customer.overLimit && <Badge tone="red" size="sm">Over limit</Badge>}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[13px] text-ink-3">
              {customer.gstin && <span>GSTIN {customer.gstin}</span>}
              {customer.phone && <span>{customer.phone}</span>}
              {customer.email && <span>{customer.email}</span>}
              {!customer.gstin && !customer.phone && !customer.email && <span>No contact info</span>}
            </div>
          </div>
        </div>
        <Link
          href={`/customers/${customer.id}/edit`}
          className="shrink-0 rounded-md border border-line bg-surface px-3 py-1.5 text-[12px] font-medium text-ink-2 hover:bg-fill"
        >
          Edit
        </Link>
      </div>

      {/* ── KPI row — combined across all stores ── */}
      <Card className="p-3">
        <p className="eyebrow text-ink-4">Combined across all stores</p>
      </Card>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Total outstanding"
          value={<Money value={customer.outstanding} />}
          sub="Sum across all stores"
          tone={customer.outstanding > 0 ? "amb" : "grn"}
        />
        <Kpi
          label="Credit limit"
          value={customer.creditLimit > 0 ? money(customer.creditLimit) : "Cash only"}
          sub={customer.creditDays > 0 ? `${customer.creditDays} day terms` : "No credit terms"}
        />
        <Kpi
          label="Credit used"
          value={customer.creditLimit > 0 ? percent(customer.creditUtilisation * 100, { alreadyPct: true, decimals: 0 }) : "—"}
          sub={customer.creditLimit > 0 ? `${money(Math.max(customer.creditLimit - customer.outstanding, 0))} available` : "No limit set"}
          tone={customer.overLimit ? "amb" : customer.creditLimit > 0 ? "grn" : undefined}
        />
        <Kpi label="Stores" value={fmtCount(customer.stores.length)} sub="Delivery points" />
      </div>

      {/* ── Two-column layout: left (aging + info), right (stores) ── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_360px]">

        {/* Left column */}
        <div className="flex flex-col gap-5">

          {/* Aging — combined */}
          {customer.aging.length > 0 ? (
            <Card className="p-4">
              <div className="mb-3 text-[12px] font-semibold text-ink-2">Receivable aging <span className="font-normal text-ink-4">· all stores</span></div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {customer.aging.map((a) => (
                  <div key={a.bucket} className="rounded-md border border-line bg-fill p-3">
                    <div className="text-[11px] font-medium text-ink-4">{BUCKET_LABEL[a.bucket] ?? a.bucket}</div>
                    <div className="mt-1 font-mono text-[15px] font-bold text-ink tnum">
                      <Money value={a.amount} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          {/* Details */}
          <Panel title="Details">
            <div className="divide-y divide-line">
              <div className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
                <Info label="GSTIN" value={customer.gstin ?? "—"} mono />
                <Info label="PAN" value={customer.pan ?? "—"} mono />
                <Info label="Email" value={customer.email ?? "—"} />
                <Info label="State code" value={customer.stateCode} mono />
              </div>
            </div>
          </Panel>

        </div>

        {/* Right column — stores with card/table toggle */}
        <div>
          <StoresPanel customerId={customer.id} stores={customer.stores} />
        </div>

      </div>

      {/* ── Account ledger ── */}
      <PartyLedger rows={activity} title="Account ledger" filename={`ledger-${customer.code}`} showStore />
    </div>
  );
}

function Info({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <div className="eyebrow text-ink-4">{label}</div>
      <div className={"mt-0.5 text-[14px] font-semibold text-ink " + (mono ? "font-mono tnum" : "")}>{value}</div>
    </div>
  );
}
