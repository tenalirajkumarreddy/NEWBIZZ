import Link from "next/link";
import { notFound } from "next/navigation";
import { getStore, getCustomerActivity } from "@/lib/data/customers";
import { Panel, Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Kpi } from "@/components/ui/Kpi";
import { titleCase } from "@/lib/format";
import { Money } from "@/components/ui/Money";
import { ImageUpload } from "@/components/ui/ImageUpload";
import { PartyLedger } from "@/components/shared/PartyLedger";
import { StoreProfileActions } from "./StoreProfileActions";
import { MoveStoreAction } from "./MoveStoreAction";

export default async function StoreProfilePage({
  params,
}: {
  params: { id: string; storeId: string };
}) {
  const store = await getStore(params.storeId);
  if (!store || store.customerId !== params.id) notFound();
  const activity = await getCustomerActivity(store.customerId, { storeId: store.id });

  const mapsUrl =
    store.geoLat != null && store.geoLng != null
      ? `https://www.google.com/maps/search/?api=1&query=${store.geoLat},${store.geoLng}`
      : null;
  const addressParts = [store.addressLine, store.area, store.city, store.pincode].filter(Boolean);

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-4 px-6 py-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <ImageUpload target="store" id={store.id} customerId={store.customerId} imageUrl={store.imageUrl} name={store.name} />
          <div>
            <Link href={`/customers/${store.customerId}`} className="text-[12px] font-medium text-ink-4 hover:text-brand">
              ← {store.customerName}
            </Link>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <h1 className="text-[22px] font-bold tracking-tight text-ink">{store.name}</h1>
              <span className="font-mono text-[13px] text-ink-4">{store.code}</span>
              <Badge tone={({ retail: "grn", wholesale: "brand", distributor: "amb", institution: "slate" } as Record<string, "grn" | "brand" | "amb" | "slate">)[store.kind] ?? "slate"} size="sm">{titleCase(store.kind)}</Badge>
              {store.isPrimary && <Badge tone="brand" size="sm">Primary</Badge>}
              <Badge tone={store.status === "active" ? "grn" : "slate"} size="sm">{store.status}</Badge>
            </div>
            <p className="mt-0.5 text-[13px] text-ink-3">
              {store.contactName ? `${store.contactName} · ` : ""}
              {store.phone ?? "no phone"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/receipts/new?customer=${store.customerId}&store=${store.id}`}
            className="shrink-0 rounded-md border border-line bg-surface px-3 py-1.5 text-[12px] font-medium text-ink-2 hover:bg-fill"
          >
            Record payment
          </Link>
          <StoreProfileActions
            storeId={store.id}
            customerId={store.customerId}
            status={store.status}
            initial={{
              kind: store.kind,
              contact_name: store.contactName ?? "",
              phone: store.phone ?? "",
              address_line: store.addressLine ?? "",
              area: store.area ?? "",
              city: store.city ?? "",
              pincode: store.pincode ?? "",
              state_code: store.stateCode,
            }}
          />
          <MoveStoreAction
            storeId={store.id}
            currentCustomerId={store.customerId}
            currentCustomerName={store.customerName}
          />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Store outstanding" value={<Money value={store.outstanding} />} sub="Billed to this store" tone={store.outstanding > 0 ? "amb" : "grn"} />
        <Kpi label="Price list" value={store.priceListName ?? "Customer default"} sub="Rate applied" />
        <Kpi label="Route" value={store.routeName ?? "—"} sub="Delivery beat" />
        <Kpi label="Place of supply" value={`State ${store.stateCode}`} sub="GST state code" />
      </div>

      {/* Details + location */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <Panel title="Details">
          <div className="grid grid-cols-2 gap-4">
            <Fact label="Contact" value={store.contactName ?? "—"} />
            <Fact label="Phone" value={store.phone ?? "—"} />
            <Fact label="Address" value={addressParts.length ? addressParts.join(", ") : "—"} span />
            <Fact label="Area" value={store.area ?? "—"} />
            <Fact label="City" value={store.city ?? "—"} />
            <Fact label="Pincode" value={store.pincode ?? "—"} mono />
            <Fact label="State code" value={store.stateCode} mono />
          </div>
        </Panel>

        <Panel title="Location">
          {mapsUrl ? (
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-3">
                <Fact label="Latitude" value={store.geoLat?.toFixed(6) ?? "—"} mono />
                <Fact label="Longitude" value={store.geoLng?.toFixed(6) ?? "—"} mono />
              </div>
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center justify-center rounded-md bg-brand px-3 py-2 text-[12px] font-semibold text-white hover:bg-brand-d"
              >
                Open in Google Maps →
              </a>
            </div>
          ) : (
            <p className="text-[13px] text-ink-4">
              No GPS coordinates recorded. They&rsquo;re captured when an agent checks in at the store, or you can add them by editing the store.
            </p>
          )}
        </Panel>
      </div>

      {/* Store-scoped passbook */}
      <PartyLedger rows={activity} title="Store ledger" filename={`ledger-${store.code}`} showStore={false} />
    </div>
  );
}

function Fact({ label, value, mono, span }: { label: string; value: React.ReactNode; mono?: boolean; span?: boolean }) {
  return (
    <Card className={"p-3.5 " + (span ? "col-span-2" : "")}>
      <div className="eyebrow text-ink-4">{label}</div>
      <div className={"mt-1 text-[14px] font-semibold text-ink " + (mono ? "font-mono tnum" : "")}>{value}</div>
    </Card>
  );
}
