"use client";

import { useState } from "react";
import Link from "next/link";
import type { Store360Data, InteractionRow, ComplaintRow } from "@/lib/data/crm";
import type { StoreDetail, ActivityRow } from "@/lib/data/customers";
import { Badge } from "@/components/ui/Badge";
import { titleCase } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { InfoRow } from "@/components/ui/InfoRow";
import { Panel } from "@/components/ui/Card";
import { ImageUpload } from "@/components/ui";
import { PartyLedger } from "@/components/shared/PartyLedger";
import { InteractionLog } from "@/components/crm/InteractionLog";

type Tab = "details" | "overview" | "ledger";

interface Props {
  store: StoreDetail;
  data: Store360Data | null;
  interactions: InteractionRow[];
  complaints: ComplaintRow[];
  activity: ActivityRow[];
  mapsUrl: string | null;
  addressParts: string[];
}

export function StoreTabs({ store, data, interactions, complaints, activity, mapsUrl, addressParts }: Props) {
  const [tab, setTab] = useState<Tab>("details");

  const tabs: { key: Tab; label: string }[] = [
    { key: "details", label: "Details" },
    { key: "overview", label: "Overview" },
    { key: "ledger", label: "Ledger" },
  ];

  return (
    <>
      {/* Tab bar */}
      <div className="-mx-6 flex gap-0 border-b border-line px-6 lg:-mx-8 lg:px-8">
        {tabs.map((t) => (
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
      {tab === "details" && <DetailsTab store={store} mapsUrl={mapsUrl} addressParts={addressParts} />}
      {tab === "overview" && <OverviewTab data={data} complaints={complaints} interactions={interactions} store={store} />}
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
              { label: "Contact", value: store.contactName ?? "—" },
              { label: "Phone", value: store.phone ?? "—" },
              { label: "Address", value: [store.addressLine, store.area, store.city].filter(Boolean).join(", ") || "—" },
              { label: "Pincode", value: store.pincode ?? "—" },
              { label: "State code", value: store.stateCode },
              { label: "Route", value: store.routeName ?? "—" },
              { label: "Status", value: store.status === "active" ? "Active" : "Inactive" },
            ],
            outstanding: store.outstanding,
          }}
        />
      )}
    </>
  );
}

/* ── Details ──────────────────────────────────────────────────────────────── */

function DetailsTab({ store, mapsUrl, addressParts }: {
  store: StoreDetail;
  mapsUrl: string | null;
  addressParts: string[];
}) {
  const address = addressParts.length ? addressParts.join(", ") : "—";
  const hasCoords = !!store.geoLat && !!store.geoLng;

  return (
    <div className="grid grid-cols-1 gap-5">
      <Panel title="Store details">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[auto_1fr]">
          {/* Left — photo + maps link */}
          <div className="flex flex-col items-center gap-4">
            <ImageUpload target="store" id={store.id} customerId={store.customerId} imageUrl={store.imageUrl} name={store.name} size={160} />
            {hasCoords && mapsUrl && (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-brand px-3 py-2 text-[12px] font-semibold text-white hover:bg-brand-d transition-colors"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 10v3a1 1 0 01-1 1H3a1 1 0 01-1-1V6a1 1 0 011-1h3"/><path d="M9 1v7h7"/></svg>
                View in Google Maps
              </a>
            )}
          </div>

          {/* Right — info grid */}
          <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
            <span className="text-ink-3">Customer</span>
            <span className="font-semibold text-ink">{store.customerName}</span>

            <span className="text-ink-3">Phone</span>
            <span className="font-mono font-semibold text-ink">{store.phone ?? "—"}</span>

            <span className="text-ink-3">Kind</span>
            <div className="grid grid-cols-2 gap-3">
              <span className="font-semibold text-ink">{titleCase(store.kind)}</span>
              <div className="flex items-center gap-2">
                <span className="text-ink-3">Status</span>
                <Badge tone={store.status === "active" ? "grn" : "slate"} size="sm">{titleCase(store.status)}</Badge>
              </div>
            </div>

            <span className="text-ink-3">Route</span>
            <span className="font-semibold text-ink">{store.routeName ?? "—"}</span>

            <span className="text-ink-3">Address</span>
            <span className="font-semibold text-ink">{address}</span>

            <span className="text-ink-3">Area</span>
            <span className="font-semibold text-ink">{store.area ?? "—"}</span>

            <span className="text-ink-3">City</span>
            <div className="grid grid-cols-2 gap-3">
              <span className="font-semibold text-ink">{store.city ?? "—"}</span>
              <div className="flex items-center gap-2">
                <span className="text-ink-3">Pincode</span>
                <span className="font-mono font-semibold text-ink">{store.pincode ?? "—"}</span>
              </div>
            </div>

            <span className="text-ink-3">Coordinate</span>
            <div className="flex gap-4">
              <span className="font-mono font-semibold text-ink">{store.geoLat?.toFixed(6) ?? "—"}</span>
              <span className="font-mono font-semibold text-ink">{store.geoLng?.toFixed(6) ?? "—"}</span>
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}

/* ── Overview ─────────────────────────────────────────────────────────────── */

function OverviewTab({ data, complaints, interactions, store }: {
  data: Store360Data | null;
  complaints: ComplaintRow[];
  interactions: InteractionRow[];
  store: StoreDetail;
}) {
  const scheme = data?.schemeProgress;

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
      {/* Left column */}
      <div className="flex flex-col gap-4">
        {/* Scheme progress */}
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

        {/* Interactions */}
        <Panel title="Interactions" flush>
          <InteractionLog interactions={interactions} storeId={store.id} title="" />
        </Panel>
      </div>

      {/* Right column */}
      <div className="flex flex-col gap-4">
        {/* Complaints */}
        <Panel title="Complaints" actions={complaints.length > 0 ? <Badge tone="amb" size="sm">{complaints.length}</Badge> : undefined} flush>
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

        {/* Quick info */}
        <Panel title="Quick info">
          <div className="flex flex-col gap-0 divide-y divide-line-soft">
            <InfoRow label="Last order" value={data?.lastOrder ? new Date(data.lastOrder.date).toLocaleDateString("en-IN") : "—"} />
            <InfoRow label="Last interaction" value={data?.lastInteraction ? new Date(data.lastInteraction.date).toLocaleDateString("en-IN") : "—"} />
          </div>
        </Panel>

        {/* Actions */}
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
  );
}


