"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/Badge";

interface TripSummary {
  id: string;
  category: string | null;
  type: string;
  status: string;
  startedAt: string | null;
  endedAt: string | null;
  distanceKm: number | null;
}

interface FuelLogSummary {
  id: string;
  logDate: string;
  litres: number;
  amount: number;
}

interface PendingRefill {
  id: string;
  eventType: string;
  detectedAt: string;
  deltaLitres: number;
}

interface Props {
  vehicleId: string;
  regNo: string;
  trips: TripSummary[];
  fuelLogs: FuelLogSummary[];
  pendingRefills: PendingRefill[];
}

function fmtDuration(startedAt: string | null, endedAt: string | null): string {
  if (!startedAt) return "—";
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  const ms = end - start;
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export default function VehicleActivityPanel({ vehicleId, regNo, trips, fuelLogs, pendingRefills }: Props) {
  const activeTrips = trips.filter((t) => t.status === "active");
  const recentTrips = trips.filter((t) => t.status === "completed").slice(0, 5);

  return (
    <div className="rounded-lg border border-line bg-surface shadow-card">
      <div className="px-4 py-3 border-b border-line flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-ink">Activity — {regNo}</h3>
        <Link href={`/fleet/${vehicleId}`} className="text-[12px] text-link hover:underline">
          View Full History →
        </Link>
      </div>

      <div className="divide-y divide-line text-[12px]">
        {activeTrips.length > 0 && (
          <div className="px-4 py-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">Active Trips</span>
            {activeTrips.map((t) => (
              <div key={t.id} className="mt-1 flex items-center gap-2">
                <span className="inline-block size-1.5 rounded-full bg-grn" />
                <Badge tone={t.category === "warehouse" ? "amb" : "slate"} size="sm">
                  {t.category ?? t.type}
                </Badge>
                <span className="text-ink-3">{fmtDuration(t.startedAt, null)}</span>
                {t.distanceKm != null && <span className="text-ink-3">· {t.distanceKm.toFixed(1)} km</span>}
              </div>
            ))}
          </div>
        )}

        {pendingRefills.length > 0 && (
          <div className="px-4 py-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">
              Pending Refills
              <span className="ml-1.5 inline-flex items-center justify-center size-4 rounded-full bg-amb text-[10px] font-bold text-white">{pendingRefills.length}</span>
            </span>
            {pendingRefills.slice(0, 3).map((r) => (
              <div key={r.id} className="mt-1 flex items-center gap-2">
                <Badge tone={r.eventType === "leak" ? "red" : "amb"} size="sm">
                  {r.eventType === "leak" ? "Leak" : "Refill"}
                </Badge>
                <span className="text-ink-3">{r.deltaLitres > 0 ? "+" : ""}{r.deltaLitres.toFixed(1)} L</span>
                <span className="text-ink-4">{new Date(r.detectedAt).toLocaleTimeString("en-IN")}</span>
              </div>
            ))}
          </div>
        )}

        {recentTrips.length > 0 && (
          <div className="px-4 py-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">Recent Trips</span>
            {recentTrips.map((t) => (
              <div key={t.id} className="mt-1 flex items-center gap-2">
                <Badge tone={t.category === "warehouse" ? "amb" : "slate"} size="sm">
                  {t.category ?? t.type}
                </Badge>
                <span className="text-ink-3">{fmtDuration(t.startedAt, t.endedAt)}</span>
                {t.distanceKm != null && <span className="text-ink-3">· {t.distanceKm.toFixed(1)} km</span>}
              </div>
            ))}
          </div>
        )}

        {fuelLogs.length > 0 && (
          <div className="px-4 py-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">Recent Fuel Logs</span>
            {fuelLogs.map((f) => (
              <div key={f.id} className="mt-1 flex items-center gap-2">
                <span className="text-ink-3">{f.logDate}</span>
                <span className="font-mono text-ink">{f.litres.toFixed(1)} L</span>
                <span className="text-ink-4">· ₹{f.amount.toFixed(0)}</span>
              </div>
            ))}
          </div>
        )}

        {activeTrips.length === 0 && recentTrips.length === 0 && fuelLogs.length === 0 && pendingRefills.length === 0 && (
          <div className="px-4 py-6 text-center text-ink-3">No activity for this vehicle yet.</div>
        )}
      </div>
    </div>
  );
}
