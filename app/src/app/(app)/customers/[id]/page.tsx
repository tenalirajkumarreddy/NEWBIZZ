import Link from "next/link";
import { notFound } from "next/navigation";
import { getCustomer, getCustomerActivity } from "@/lib/data/customers";
import { listPriceLists } from "@/lib/data/catalog";
import { Panel, Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Kpi } from "@/components/ui";
import { Money } from "@/components/ui/Money";
import { ImageUpload } from "@/components/ui";
import { PartyLedger } from "@/components/shared/PartyLedger";
import { count as fmtCount, money, percent } from "@/lib/format";
import { CustomerProfileActions } from "./CustomerProfileActions";
import { StoresPanel } from "./StoresPanel";
import { DocumentAttachPanel } from "@/components/documents/DocumentAttachPanel";

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
  const [activity, priceLists] = await Promise.all([
    getCustomerActivity(customer.id),
    listPriceLists(),
  ]);

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-5 px-6 py-6 lg:px-8">
      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
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
          </div>
        </div>
        <CustomerProfileActions customer={customer} />
      </div>

      {/* ── KPI row ── */}
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
            <div className="flex flex-col items-center gap-5 p-5 sm:flex-row sm:items-start">
              <ImageUpload target="customer" id={customer.id} imageUrl={customer.imageUrl} name={customer.name} size={160} />
              <div className="grid flex-1 grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                <Info label="GSTIN" value={customer.gstin ?? "—"} mono />
                <Info label="PAN" value={customer.pan ?? "—"} mono />
                <Info label="Phone" value={customer.phone ?? "—"} />
                <Info label="Email" value={customer.email ?? "—"} />
                <Info label="State code" value={customer.stateCode} mono />
                <Info label="Credit limit" value={customer.creditLimit > 0 ? money(customer.creditLimit) : "Cash only"} />
                <Info label="Credit days" value={customer.creditDays > 0 ? `${customer.creditDays} days` : "None"} />
                <Info label="Status" value={customer.status === "active" ? "Active" : "Inactive"} />
              </div>
            </div>
          </Panel>

        </div>

        {/* Right column — stores with card/table toggle */}
        <div>
          <StoresPanel customerId={customer.id} stores={customer.stores} priceLists={priceLists} />
        </div>

      </div>

      {/* ── Account ledger ── */}
      <PartyLedger
        rows={activity}
        title="Account ledger"
        filename={`ledger-${customer.code}`}
        showStore
        printStatement={{
          imageUrl: customer.imageUrl,
          title: "Account Statement",
          entityName: customer.name,
          entityCode: customer.code,
          info: [
            { label: "GSTIN", value: customer.gstin ?? "—" },
            { label: "PAN", value: customer.pan ?? "—" },
            { label: "Phone", value: customer.phone ?? "—" },
            { label: "Email", value: customer.email ?? "—" },
            { label: "State code", value: customer.stateCode },
            { label: "Credit limit", value: customer.creditLimit > 0 ? money(customer.creditLimit) : "Cash only" },
            { label: "Credit days", value: customer.creditDays > 0 ? `${customer.creditDays} days` : "None" },
            { label: "Status", value: customer.status === "active" ? "Active" : "Inactive" },
            { label: "Stores", value: String(customer.stores.length) },
          ],
          aging: customer.aging,
          outstanding: customer.outstanding,
        }}
      />

      <DocumentAttachPanel entityType="customer" entityId={customer.id} entityLabel={customer.code} />
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
