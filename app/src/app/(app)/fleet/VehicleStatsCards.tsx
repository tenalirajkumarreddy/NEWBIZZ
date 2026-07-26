"use client";

import { Badge } from "@/components/ui/Badge";

interface Props {
  vehicle: {
    plate: string;
    status: string;
    last_state: {
      sp: number;
      hd: number;
      exb: number;
      timestamp: number;
    };
    fuel: { amount: number; percentage: number };
    odom: { vehicle_odo_km: number };
    ad_blue: { lvl: number; per: number };
    connection_status: { status: boolean; info_string: string };
    is_fuel_level_low: boolean;
    is_ad_blue_level_low: boolean;
  } | null;
}

function fmtTime(ts: number) {
  const d = new Date(ts);
  return d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
}

export default function VehicleStatsCards({ vehicle }: Props) {
  if (!vehicle) {
    return (
      <div className="flex items-center justify-center h-full text-[13px] text-ink-3">
        Select a vehicle to view stats
      </div>
    );
  }

  const s = vehicle.last_state;
  const ignitionOn = s.exb === 1;

  const cards = [
    {
      label: "Status",
      value: vehicle.status,
      badge:
        vehicle.status === "MOVING" ? "grn" as const
        : vehicle.status === "PARKED" ? "amb" as const
        : "slate" as const,
    },
    {
      label: "Speed",
      value: s.sp != null ? `${s.sp.toFixed(0)} km/h` : "—",
    },
    {
      label: "Ignition",
      value: ignitionOn ? "ON" : "OFF",
      dot: ignitionOn ? "bg-grn" : "bg-ink-3",
    },
    {
      label: "Heading",
      value: s.hd != null ? `${s.hd.toFixed(1)}°` : "—",
    },
    {
      label: "Odometer",
      value: vehicle.odom?.vehicle_odo_km != null
        ? `${(vehicle.odom.vehicle_odo_km / 1000).toFixed(1)}k km`
        : "—",
    },
    {
      label: "Fuel",
      value: vehicle.fuel?.percentage != null
        ? `${vehicle.fuel.percentage}%`
        : "—",
      warn: vehicle.is_fuel_level_low,
    },
    {
      label: "AdBlue",
      value: vehicle.ad_blue?.per != null
        ? `${vehicle.ad_blue.per}%`
        : "—",
      warn: vehicle.is_ad_blue_level_low,
    },
    {
      label: "Connection",
      value: vehicle.connection_status?.status ? "Connected" : "Offline",
      dot: vehicle.connection_status?.status ? "bg-grn" : "bg-red",
    },
  ];

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-[15px] font-bold tracking-tight text-ink">
          {vehicle.plate}
        </h2>
        <span className="text-[11px] text-ink-3">
          {s.timestamp ? fmtTime(s.timestamp) : ""}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {cards.map((c) => (
          <div key={c.label} className="rounded-lg border border-line bg-surface p-3 shadow-card">
            <div className="text-[10px] font-medium uppercase tracking-wider text-ink-3">
              {c.label}
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              {"dot" in c && c.dot ? (
                <span className={`inline-block size-2 rounded-full ${c.dot}`} />
              ) : null}
              {"badge" in c && c.badge ? (
                <Badge tone={c.badge} size="sm">{c.value}</Badge>
              ) : (
                <span className={`font-mono text-[13px] font-semibold ${
                  "warn" in c && c.warn ? "text-red" : "text-ink"
                }`}>
                  {c.value}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
