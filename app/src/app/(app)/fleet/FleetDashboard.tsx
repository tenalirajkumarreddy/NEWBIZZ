"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { SyncFleetButton } from "./SyncFleetButton";
import VehicleListPanel from "./VehicleListPanel";
import VehicleStatsCards from "./VehicleStatsCards";
import VehicleActivityPanel from "./VehicleActivityPanel";
import type { IntanglesVehicleLive } from "@/lib/actions/fleet";

const FleetMap = dynamic(() => import("./FleetMap"), { ssr: false });

interface VehicleItem {
  id: string;
  regNo: string;
  type: string | null;
  status: string;
  ownedOrHired: string;
  capacity: string | null;
}

interface WarehouseItem {
  lat: number;
  lng: number;
  name: string;
}

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
  vehicles: VehicleItem[];
  liveData: IntanglesVehicleLive[];
  warehouses?: WarehouseItem[];
  activeTrips?: number;
  tripsMap?: Record<string, TripSummary[]>;
  fuelLogsMap?: Record<string, FuelLogSummary[]>;
  pendingRefillsMap?: Record<string, PendingRefill[]>;
}

export default function FleetDashboard({
  vehicles, liveData, warehouses, activeTrips,
  tripsMap = {}, fuelLogsMap = {}, pendingRefillsMap = {},
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(
    vehicles.length > 0 ? vehicles[0].id : null,
  );
  const [intanglesData, setIntanglesData] = useState(liveData);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const intanglesPlates = new Set(intanglesData.map((v) => v.plate));

  const selectedVehicle = vehicles.find((v) => v.id === selectedId);
  const selectedLive = intanglesData.find(
    (lv) => lv.plate === selectedVehicle?.regNo,
  ) ?? null;

  const doRefresh = useCallback(async () => {
    const { getIntanglesLiveData } = await import("@/lib/actions/fleet");
    const result = await getIntanglesLiveData();
    if (result.ok) {
      setIntanglesData(result.vehicles);
      setLastRefreshed(new Date());
    }
  }, []);

  useEffect(() => {
    doRefresh();
    intervalRef.current = setInterval(doRefresh, 15_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [doRefresh]);

  const selectedRegNo = selectedVehicle?.regNo ?? "";

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-6 py-6 lg:px-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-ink">Vehicles &amp; Fleet</h1>
          <p className="mt-0.5 text-[13px] text-ink-3">
            {vehicles.length} vehicles &middot; {intanglesData.length} tracked live
            {activeTrips != null && <> &middot; {activeTrips} active trips</>}
            <span className="ml-2 text-[11px] text-ink-4">
              last updated {lastRefreshed.toLocaleTimeString("en-IN")}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={doRefresh}>
            Refresh
          </Button>
          <SyncFleetButton />
          <Link href="/fleet/settings">
            <Button variant="secondary" size="sm">Settings</Button>
          </Link>
          <Link href="/fleet/new">
            <Button variant="primary" size="sm">Add Vehicle</Button>
          </Link>
        </div>
      </div>

      {/* Main area */}
      <div className="flex gap-4 h-[calc(100vh-190px)] min-h-[500px]">
        {/* Left panel — vehicle list */}
        <div className="w-[260px] shrink-0 rounded-lg border border-line bg-surface shadow-card overflow-hidden">
          <VehicleListPanel
            vehicles={vehicles}
            intanglesPlates={intanglesPlates}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </div>

        {/* Right area — stats + map + activity */}
        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
          {/* Stats cards */}
          <div className="shrink-0 rounded-lg border border-line bg-surface p-4 shadow-card">
            <VehicleStatsCards vehicle={selectedLive} />
          </div>

          <div className="flex-1 flex gap-4 overflow-hidden min-h-0">
            {/* Map */}
            <div className="flex-1 rounded-lg border border-line bg-surface shadow-card overflow-hidden">
              <FleetMap
                lat={selectedLive?.last_state?.loc?.lat ?? null}
                lng={selectedLive?.last_state?.loc?.lng ?? null}
                heading={selectedLive?.last_state?.hd ?? null}
                label={selectedLive?.plate ?? ""}
                warehouses={warehouses}
              />
            </div>

            {/* Activity panel */}
            {selectedId && (
              <div className="w-[280px] shrink-0 overflow-y-auto">
                <VehicleActivityPanel
                  vehicleId={selectedId}
                  regNo={selectedRegNo}
                  trips={tripsMap[selectedId] ?? []}
                  fuelLogs={fuelLogsMap[selectedId] ?? []}
                  pendingRefills={pendingRefillsMap[selectedId] ?? []}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
