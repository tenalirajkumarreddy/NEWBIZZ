import Link from "next/link";
import { notFound } from "next/navigation";
import { getVehicle, listTrips, listFuelLogs, getLatestGps, getVehicleRunningCost } from "@/lib/data/fleet";
import { listWarehouses } from "@/lib/data/branches";
import { getIntanglesLiveData } from "@/lib/actions/fleet";
import { Panel, Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { money } from "@/lib/format";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { FleetActions } from "./FleetActions";
import { VehicleRecordActions } from "./VehicleRecordActions";
import { createClient } from "@/lib/supabase/server";
import PendingRefillsSection from "./PendingRefillsSection";
import VehicleDetailClient from "./VehicleDetailClient";
import { DocumentAttachPanel } from "@/components/documents/DocumentAttachPanel";
import { PageContainer } from "@/components/ui";

export const metadata = { title: "Vehicle Detail — NEWBIZZ" };
export const dynamic = "force-dynamic";

function formatDuration(ms: number): string {
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export default async function VehicleDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const supabase = createClient();

  const [vehicle, trips, fuelLogs, gps, refillsResult, liveResult, warehouses, runningCost] = await Promise.all([
    getVehicle(id),
    listTrips(id),
    listFuelLogs(id),
    getLatestGps(id),
    supabase
      .from("fuel_refill_events" as any)
      .select("id, event_type, detected_at, prev_amount, new_amount, delta_litres, status, fraud_alert")
      .eq("vehicle_id", id)
      .order("detected_at", { ascending: false })
      .limit(20),
    getIntanglesLiveData(),
    listWarehouses(),
    getVehicleRunningCost(id),
  ]);

  if (!vehicle) notFound();

  const liveData = liveResult.ok ? liveResult.vehicles.find((v) => v.plate === vehicle.regNo) ?? null : null;

  const warehouseMarkers = warehouses
    .filter((w): w is typeof w & { lat: number; lng: number } => w.lat != null && w.lng != null)
    .map((w) => ({ lat: w.lat, lng: w.lng, name: w.name }));

  const activeTrips = trips.filter((t) => t.status === "active");
  const totalLitres = fuelLogs.reduce((s, f) => s + f.litres, 0);
  const totalDistanceKm = trips
    .filter((t) => t.distanceKm != null && t.status === "completed")
    .reduce((s, t) => s + (t.distanceKm ?? 0), 0);

  return (
    <PageContainer width="detail">
      <Link href="/fleet" className="text-[12px] font-medium text-ink-4 hover:text-brand">← Vehicles</Link>

      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="font-mono text-[22px] font-bold tracking-tight text-ink">{vehicle.regNo}</h1>
          <Badge tone={vehicle.status === "active" ? "grn" : vehicle.status === "maintenance" ? "amb" : "slate"} size="sm">{vehicle.status}</Badge>
        </div>
        <div className="flex flex-col items-end gap-2 sm:items-center">
          <VehicleRecordActions vehicleId={vehicle.id} />
          <FleetActions vehicleId={vehicle.id} />
        </div>
      </div>

      <VehicleDetailClient
        regNo={vehicle.regNo}
        status={vehicle.status}
        type={vehicle.type}
        ownedOrHired={vehicle.ownedOrHired}
        capacity={vehicle.capacity}
        live={liveData}
        gps={gps}
        warehouses={warehouseMarkers}
        activeTrips={activeTrips}
        runningCost={runningCost}
        totalLitres={totalLitres}
        totalDistanceKm={totalDistanceKm}
      />

      {/* Pending Fuel Refills */}
      <Panel title="Fuel Events" flush>
        <PendingRefillsSection
          refills={(refillsResult.data ?? []).map((r: any) => ({
            id: r.id,
            eventType: r.event_type,
            detectedAt: r.detected_at,
            prevAmount: Number(r.prev_amount),
            newAmount: Number(r.new_amount),
            deltaLitres: Number(r.delta_litres),
            status: r.status,
            fraudAlert: r.fraud_alert,
          }))}
          vehicleId={id}
        />
      </Panel>

      {/* Trips */}
      <Panel
        title="Trips"
        flush
      >
        {trips.length === 0 ? (
          <EmptyState title="No trips" description="No trips recorded for this vehicle." />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Type</TH>
                <TH>Date</TH>
                <TH numeric>Duration</TH>
                <TH numeric>Dist (km)</TH>
                <TH numeric>Max Spd</TH>
                <TH numeric>Avg Spd</TH>
              </TR>
            </THead>
            <TBody>
              {trips.map((t) => (
                <TR key={t.id}>
                  <TD>
                    <div className="flex items-center gap-1">
                      {t.type === "auto" ? (
                        <Badge tone={t.category === "warehouse" ? "amb" : "slate"} size="sm">
                          {t.category === "warehouse" ? "Warehouse" : t.category === "ignition" ? "Ignition" : "Auto"}
                        </Badge>
                      ) : (
                        <Badge tone="brand" size="sm">Manual</Badge>
                      )}
                      {t.status === "active" && (
                        <span className="inline-block size-1.5 rounded-full bg-grn" title="Active" />
                      )}
                    </div>
                  </TD>
                  <TD className="font-mono text-[12px] text-ink-3">
                    {t.startedAt
                      ? new Date(t.startedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })
                      : t.tripDate}
                  </TD>
                  <TD numeric className="font-mono tnum text-[12px] text-ink-3">
                    {t.startedAt && t.endedAt
                      ? formatDuration(new Date(t.endedAt).getTime() - new Date(t.startedAt).getTime())
                      : t.startedAt ? "ongoing" : "—"}
                  </TD>
                  <TD numeric className="font-mono tnum">
                    {t.distanceKm != null ? t.distanceKm.toFixed(1) : "—"}
                  </TD>
                  <TD numeric className="font-mono tnum text-[12px] text-ink-3">
                    {t.maxSpeed != null ? `${t.maxSpeed.toFixed(0)}` : "—"}
                  </TD>
                  <TD numeric className="font-mono tnum text-[12px] text-ink-3">
                    {t.avgSpeed != null ? `${t.avgSpeed.toFixed(0)}` : "—"}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Panel>

      {/* Fuel logs */}
      <Panel title="Fuel Logs" flush>
        {fuelLogs.length === 0 ? (
          <EmptyState title="No fuel logs" description="Log fuel purchases to track running costs." />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Date</TH>
                <TH numeric>Litres</TH>
                <TH numeric>Amount</TH>
                <TH numeric>Rate/L</TH>
              </TR>
            </THead>
            <TBody>
              {fuelLogs.map((f) => (
                <TR key={f.id}>
                  <TD className="font-mono text-[12px] text-ink-3">{f.logDate}</TD>
                  <TD numeric className="font-mono tnum">{f.litres.toFixed(1)}</TD>
                  <TD numeric className="font-mono tnum">{money(f.amount)}</TD>
                  <TD numeric className="font-mono tnum">{money(f.amount / f.litres)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Panel>

      <DocumentAttachPanel entityType="vehicle" entityId={vehicle.id} entityLabel={vehicle.regNo} />
    </PageContainer>
  );
}
