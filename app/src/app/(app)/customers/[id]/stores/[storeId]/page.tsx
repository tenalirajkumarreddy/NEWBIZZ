import Link from "next/link";
import { notFound } from "next/navigation";
import { getStore, getCustomerActivity } from "@/lib/data/customers";
import { getStore360, listInteractions, listComplaints } from "@/lib/data/crm";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Kpi } from "@/components/ui";
import { Money } from "@/components/ui/Money";
import { titleCase } from "@/lib/format";
import { StoreProfileActions } from "./StoreProfileActions";
import { MoveStoreAction } from "./MoveStoreAction";
import { StoreTabs } from "./StoreTabs";

export default async function StoreProfilePage({ params }: { params: { id: string; storeId: string } }) {
  const { id, storeId } = params;
  const store = await getStore(storeId);
  if (!store || store.customerId !== id) notFound();

  const [data, interactions, complaints, activity] = await Promise.all([
    getStore360(storeId),
    listInteractions({ storeId }),
    listComplaints({ storeId }),
    getCustomerActivity(store.customerId, { storeId: store.id }),
  ]);

  const mapsUrl =
    store.geoLat != null && store.geoLng != null
      ? `https://www.google.com/maps/search/?api=1&query=${store.geoLat},${store.geoLng}`
      : null;
  const addressParts = [store.addressLine, store.area, store.city, store.pincode].filter(Boolean) as string[];

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-5 px-6 py-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href={`/customers/${store.customerId}`} className="inline-flex items-center gap-1 text-[12px] font-medium text-ink-4 hover:text-brand transition-colors">
            <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 12L6 8l4-4"/></svg>
            {store.customerName}
          </Link>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <h1 className="text-[22px] font-bold tracking-tight text-ink">{store.name}</h1>
            <span className="font-mono text-[12px] text-ink-4">{store.code}</span>
            <Badge tone={({ retail: "grn", wholesale: "brand", distributor: "amb", institution: "slate" } as Record<string, "grn" | "brand" | "amb" | "slate">)[store.kind] ?? "slate"} size="sm">{titleCase(store.kind)}</Badge>
            {store.isPrimary && <Badge tone="brand" size="sm">Primary</Badge>}
            <Badge tone={store.status === "active" ? "grn" : "slate"} size="sm">{store.status}</Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/receipts/new?customer=${store.customerId}&store=${store.id}`}>
            <Button variant="secondary" size="sm">Record payment</Button>
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
              geo_lat: store.geoLat ? String(store.geoLat) : "",
              geo_lng: store.geoLng ? String(store.geoLng) : "",
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
        <Kpi label="Outstanding" value={<Money value={store.outstanding} />} sub="Billed to store" tone={store.outstanding > 0 ? "amb" : "grn"} />
        <Kpi label="MTD Sales" value={data ? <Money value={data.mtdSales} /> : "—"} sub="This month" tone={data?.mtdSales && data.mtdSales > 0 ? "grn" : undefined} />
        <Kpi label="Route" value={store.routeName ?? "—"} sub="Delivery beat" />
        <Kpi label="Supply state" value={`State ${store.stateCode}`} sub="GST" />
      </div>

      {/* 360 Tabs */}
      <StoreTabs
        store={store}
        data={data}
        interactions={interactions}
        complaints={complaints}
        activity={activity}
        mapsUrl={mapsUrl}
        addressParts={addressParts}
      />
    </div>
  );
}
