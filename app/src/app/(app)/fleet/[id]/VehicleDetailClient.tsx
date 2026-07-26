"use client";

import dynamic from "next/dynamic";
import { Badge } from "@/components/ui/Badge";
import { Panel, Card } from "@/components/ui/Card";
import type { IntanglesVehicleLive } from "@/lib/actions/fleet";
import type { TripRow } from "@/lib/data/fleet";

const FleetMap = dynamic(() => import("../FleetMap"), { ssr: false });

interface WarehouseMarker {
  lat: number;
  lng: number;
  name: string;
}

interface Props {
  regNo: string;
  status: string;
  type: string | null;
  ownedOrHired: string;
  capacity: string | null;
  live: IntanglesVehicleLive | null;
  gps: { lat: number | null; lng: number | null; speed: number | null; ignition: boolean | null; recordedAt: string } | null;
  warehouses: WarehouseMarker[];
  activeTrips: TripRow[];
  runningCost: number;
  totalLitres: number;
  totalDistanceKm: number;
}

function fmtTime(ts: number) {
  return new Date(ts).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
}

export default function VehicleDetailClient({
  regNo, status, type, ownedOrHired, capacity,
  live, gps, warehouses, activeTrips, runningCost, totalLitres, totalDistanceKm,
}: Props) {
  const s = live?.last_state;
  const efficiency = totalLitres > 0 ? (totalDistanceKm / totalLitres) : null;

  return (
    <>
      {/* Info + Live Status grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-3.5">
          <div className="eyebrow text-ink-4">Type</div>
          <div className="mt-1 text-[14px] font-semibold text-ink">{type ?? "—"}</div>
          <div className="mt-1 text-[11px] text-ink-4 capitalize">{ownedOrHired} · {capacity ?? "—"}</div>
        </Card>

        <Card className="p-3.5">
          <div className="eyebrow text-ink-4">Speed</div>
          <div className="mt-1 text-[14px] font-semibold text-ink font-mono tnum">
            {s?.sp != null ? `${s.sp.toFixed(0)} km/h` : gps?.speed != null ? `${gps.speed.toFixed(0)} km/h` : "—"}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px]">
            <span className={`inline-block size-2 rounded-full ${s?.exb === 1 || gps?.ignition ? "bg-grn" : "bg-ink-3"}`} />
            <span className="text-ink-4">Ignition {s?.exb === 1 || gps?.ignition ? "ON" : "OFF"}</span>
          </div>
        </Card>

        <Card className="p-3.5">
          <div className="eyebrow text-ink-4">Fuel</div>
          <div className="mt-1 text-[14px] font-semibold text-ink font-mono tnum">
            {live?.fuel?.percentage != null
              ? `${live.fuel.percentage}%`
              : live?.fuel?.amount != null
              ? `${live.fuel.amount.toFixed(1)} L`
              : "—"}
          </div>
          <div className="mt-0.5 text-[11px] text-ink-4">
            {live?.fuel?.amount != null && <>{live.fuel.amount.toFixed(1)} L</>}
            {live?.is_fuel_level_low && <span className="ml-1 text-red">Low!</span>}
          </div>
        </Card>

        <Card className="p-3.5">
          <div className="eyebrow text-ink-4">Connection</div>
          <div className="mt-1 flex items-center gap-1.5">
            <span className={`inline-block size-2 rounded-full ${live?.connection_status?.status ? "bg-grn" : "bg-red"}`} />
            <span className="text-[14px] font-semibold text-ink">
              {live?.connection_status?.status ? "Online" : "Offline"}
            </span>
          </div>
          {s?.timestamp && (
            <div className="mt-0.5 text-[11px] text-ink-4">{fmtTime(s.timestamp)}</div>
          )}
        </Card>
      </div>

      {/* Second row: Costs + Efficiency */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-3.5">
          <div className="eyebrow text-ink-4">Running Cost</div>
          <div className="mt-1 text-[14px] font-semibold text-ink font-mono tnum">
            {runningCost > 0 ? `₹${runningCost.toLocaleString("en-IN")}` : "—"}
          </div>
        </Card>
        <Card className="p-3.5">
          <div className="eyebrow text-ink-4">Total Fuel</div>
          <div className="mt-1 text-[14px] font-semibold text-ink font-mono tnum">
            {totalLitres > 0 ? `${totalLitres.toFixed(1)} L` : "—"}
          </div>
        </Card>
        <Card className="p-3.5">
          <div className="eyebrow text-ink-4">Total Distance</div>
          <div className="mt-1 text-[14px] font-semibold text-ink font-mono tnum">
            {totalDistanceKm > 0 ? `${totalDistanceKm.toFixed(0)} km` : "—"}
          </div>
        </Card>
        <Card className="p-3.5">
          <div className="eyebrow text-ink-4">Efficiency</div>
          <div className="mt-1 text-[14px] font-semibold text-ink font-mono tnum">
            {efficiency != null ? `${efficiency.toFixed(1)} km/L` : "—"}
          </div>
        </Card>
      </div>

      {/* Active trips + Mini Map */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-3.5">
          <div className="eyebrow text-ink-4">Active Trips</div>
          {activeTrips.length === 0 ? (
            <div className="mt-2 text-[13px] text-ink-3">None</div>
          ) : (
            <div className="mt-2 flex flex-col gap-1.5">
              {activeTrips.map((t) => (
                <div key={t.id} className="flex items-center gap-2 text-[13px]">
                  <span className="inline-block size-1.5 rounded-full bg-grn" />
                  <Badge tone={t.category === "warehouse" ? "amb" : "slate"} size="sm">
                    {t.category ?? t.type}
                  </Badge>
                  <span className="text-ink-3 font-mono tnum">
                    {t.startedAt ? formatDuration(Date.now() - new Date(t.startedAt).getTime()) : ""}
                  </span>
                  {t.distanceKm != null && (
                    <span className="text-ink-3 font-mono tnum">· {t.distanceKm.toFixed(1)} km</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-1 overflow-hidden rounded-lg">
          {(gps?.lat && gps?.lng) ? (
            <div className="size-full min-h-[120px]">
              <FleetMap
                lat={gps.lat}
                lng={gps.lng}
                heading={gps.speed != null && gps.speed > 0 ? undefined : undefined}
                label={regNo}
                warehouses={warehouses}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full min-h-[120px] text-[13px] text-ink-3">
              No GPS data
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

function formatDuration(ms: number): string {
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
