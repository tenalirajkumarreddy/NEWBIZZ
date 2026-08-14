"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { TripForm } from "./trips/new/TripForm";
import { FuelForm } from "./fuel/new/FuelForm";

// "Start Trip" / "Log Fuel" header actions for a vehicle. Each opens its form
// in a right-side Drawer instead of routing to the deep /fleet/[id]/.../new
// page; those routes remain as deep-link fallbacks. Saving stays on the
// vehicle and revalidates in place.
export function VehicleRecordActions({ vehicleId }: { vehicleId: string }) {
  const router = useRouter();
  const [tripOpen, setTripOpen] = useState(false);
  const [fuelOpen, setFuelOpen] = useState(false);

  const close = (setter: (v: boolean) => void) => () => {
    setter(false);
    router.refresh();
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => setTripOpen(true)}>
          Start Trip
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setFuelOpen(true)}>
          Add Fuel
        </Button>
      </div>

      <Drawer
        open={tripOpen}
        onClose={() => setTripOpen(false)}
        title="Start a trip"
        description="Record a manual trip for this vehicle."
        size="md"
      >
        <TripForm vehicleId={vehicleId} onDone={close(setTripOpen)} onCancel={() => setTripOpen(false)} />
      </Drawer>

      <Drawer
        open={fuelOpen}
        onClose={() => setFuelOpen(false)}
        title="Log fuel"
        description="Record a fuel purchase to track running costs."
        size="md"
      >
        <FuelForm vehicleId={vehicleId} onDone={close(setFuelOpen)} onCancel={() => setFuelOpen(false)} />
      </Drawer>
    </>
  );
}