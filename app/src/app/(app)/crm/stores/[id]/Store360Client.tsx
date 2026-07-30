"use client";

import { useState } from "react";
import Link from "next/link";
import type { Store360Data, InteractionRow, ComplaintRow } from "@/lib/data/crm";
import type { ActivityRow } from "@/lib/data/customers";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { InfoRow } from "@/components/ui/InfoRow";
import { Kpi } from "@/components/ui";
import { Money } from "@/components/ui/Money";
import { Panel } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PartyLedger } from "@/components/shared/PartyLedger";
import { InteractionLog } from "@/components/crm/InteractionLog";
import { count as fmtCount } from "@/lib/format";

type Tab = "overview" | "orders" | "invoices" | "ledger" | "activity";

const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "orders", label: "Orders" },
  { key: "invoices", label: "Invoices" },
  { key: "ledger", label: "Ledger" },
  { key: "activity", label: "Activity" },
];

interface Props {
  data: Store360Data;
  interactions: InteractionRow[];
  complaints: ComplaintRow[];
  activity: ActivityRow[];
}

export function Store360Client({ data, interactions, complaints, activity }: Props) {
  const [tab, setTab] = useState<Tab>("overview");
  const { store } = data;

  return (
    <>
      {/* Store header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-fill text-[16px] font-bold text-ink-3 ring-1 ring-inset ring-line">
            {store.imageUrl ? (
              <img src={store.imageUrl} alt="" className="h-full w-full rounded-xl object-cover" />
            ) : (
              store.name.split(/\s+/).slice(0, 2).map((x) => x[0]?.toUpperCase() ?? "").join("")
            )}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[22px] font-bold tracking-tight text-ink">{store.name}</h1>
              <span className="font-mono text-[12px] text-ink-4">{store.code}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge tone={store.kind === "retail" ? "grn" : store.kind === "wholesale" ? "brand" : "amb"} size="sm">{store.kind}</Badge>
              {store.city && <span className="text-[12px] text-ink-3">{store.city}</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/customers/${store.customerId}`}>
            <Button variant="ghost" size="sm">{store.customerName}</Button>
          </Link>
        </div>
      </div>

      {/* Tab bar */}
      <div className="-mx-6 flex gap-0 border-b border-line px-6 lg:-mx-8 lg:px-8">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`relative px-4 py-2.5 text-[13px] font-medium transition-colors ${
              tab === t.key
                ? "text-ink after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-full after:bg-brand"
                : "text-ink-3 hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "overview" && <OverviewTab data={data} complaints={complaints} />}
      {tab === "orders" && <OrdersTab storeId={store.id} />}
      {tab === "invoices" && <InvoicesTab storeId={store.id} />}
      {tab === "ledger" && (
        <PartyLedger
          rows={activity}
          title="Store ledger"
          filename={`ledger-${store.code}`}
          showStore={false}
          printStatement={{
            imageUrl: store.imageUrl,
            title: "Store Statement",
            entityName: store.name,
            entityCode: store.code,
            subtitle: `Under ${store.customerName}`,
            info: [
              { label: "Customer", value: store.customerName },
              { label: "Kind", value: store.kind },
              { label: "City", value: store.city ?? "—" },
              { label: "Status", value: store.status === "active" ? "Active" : "Inactive" },
            ],
          }}
        />
      )}
      {tab === "activity" && <InteractionLog interactions={interactions} storeId={store.id} title="Interaction Log" />}
    </>
  );
}

function OverviewTab({ data, complaints }: { data: Store360Data; complaints: ComplaintRow[] }) {
  const { store } = data;
  const scheme = data.schemeProgress;

  return (
    <div className="flex flex-col gap-5">
      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Outstanding" value={<Money value={data.outstanding} />} tone={data.outstanding > 0 ? "amb" : "grn"} sub="Billed to this store" />
        <Kpi label="MTD Sales" value={<Money value={data.mtdSales} />} sub="This month" tone={data.mtdSales > 0 ? "grn" : undefined} />
        <Kpi label="Open complaints" value={fmtCount(data.openComplaints)} tone={data.openComplaints > 0 ? "amb" : "grn"} sub={data.openComplaints > 0 ? "Needs attention" : "None"} />
        <Kpi label="Route" value={store.routeName ?? "—"} sub="Delivery beat" />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        {/* Left — scheme progress + quick info */}
        <div className="flex flex-col gap-4">
          {scheme && (
            <Panel title={`Scheme: ${scheme.schemeName}`}>
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-ink-3">Progress</span>
                  <span className="font-mono text-ink">{scheme.totalVolume.toFixed(0)} / {scheme.targetCases} cases ({scheme.percent.toFixed(0)}%)</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-fill">
                  <div
                    className="h-full rounded-full bg-brand transition-all duration-500"
                    style={{ width: `${Math.min(scheme.percent, 100)}%` }}
                  />
                </div>
                {scheme.percent >= 100 && (
                  <div className="flex items-center gap-1.5 text-[12px] text-grn">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13.5 4.5L6 12L2.5 8.5"/></svg>
                    Target achieved
                  </div>
                )}
              </div>
            </Panel>
          )}

          <Panel title="Quick info">
            <div className="flex flex-col gap-0 divide-y divide-line-soft">
              <InfoRow label="Last order" value={data.lastOrder ? new Date(data.lastOrder.date).toLocaleDateString("en-IN") : "—"} />
              <InfoRow label="Last interaction" value={data.lastInteraction ? new Date(data.lastInteraction.date).toLocaleDateString("en-IN") : "—"} />
              <InfoRow label="Phone" value={store.phone ?? "—"} mono />
              <InfoRow label="Status" value={
                <Badge tone={store.status === "active" ? "grn" : "slate"} size="sm">{store.status}</Badge>
              } />
            </div>
          </Panel>
        </div>

        {/* Right — complaints + quick actions */}
        <div className="flex flex-col gap-4">
          <Panel title={`Complaints`} actions={data.openComplaints > 0 ? <Badge tone="amb" size="sm">{data.openComplaints}</Badge> : undefined} flush>
            {complaints.length === 0 ? (
              <EmptyState title="No complaints" />
            ) : (
              <div className="divide-y divide-line">
                {complaints.slice(0, 3).map((c) => (
                  <div key={c.id} className="flex items-center justify-between px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] text-ink">{c.note ?? "—"}</p>
                      <p className="mt-0.5 text-[11px] text-ink-4">{new Date(c.createdAt).toLocaleDateString("en-IN")}</p>
                    </div>
                    <Badge tone={c.status === "open" ? "amb" : c.status === "in_progress" ? "brand" : "grn"} size="sm">{c.status.replace("_", " ")}</Badge>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <div className="flex flex-col gap-2">
            <Link href={`/orders/new?store=${store.id}&customer=${store.customerId}`}>
              <Button variant="primary" block size="sm">New order</Button>
            </Link>
            <Link href={`/receipts/new?store=${store.id}&customer=${store.customerId}`}>
              <Button variant="secondary" block size="sm">Record payment</Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function OrdersTab({ storeId }: { storeId: string }) {
  return <p className="py-8 text-center text-[13px] text-ink-4">Order history for this store will appear here.</p>;
}

function InvoicesTab({ storeId }: { storeId: string }) {
  return <p className="py-8 text-center text-[13px] text-ink-4">Invoice list for this store will appear here.</p>;
}
