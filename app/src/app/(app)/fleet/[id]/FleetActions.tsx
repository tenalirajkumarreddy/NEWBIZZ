"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import {
  deleteVehicle,
  triggerIntanglesPoll,
  type PollResult,
} from "@/lib/actions/fleet";

export function FleetActions({ vehicleId }: { vehicleId: string }) {
  const router = useRouter();
  const [deletePending, setDeletePending] = useState(false);
  const [deleteState, setDeleteState] = useState<{ ok: boolean; error?: string } | null>(null);
  const [pollPending, setPollPending] = useState(false);
  const [pollState, setPollState] = useState<PollResult | null>(null);

  async function handleDelete() {
    setDeletePending(true);
    setDeleteState(null);
    const res = await deleteVehicle(vehicleId);
    if (res.ok) router.push("/fleet");
    else setDeleteState(res);
    setDeletePending(false);
  }

  async function handlePoll() {
    setPollPending(true);
    setPollState(null);
    const res = await triggerIntanglesPoll();
    if (res.ok) router.refresh();
    setPollState(res);
    setPollPending(false);
  }

  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="secondary" size="sm" disabled={pollPending} onClick={handlePoll}>
        {pollPending ? "Polling…" : "Refresh GPS"}
      </Button>
      {pollState && !pollState.ok && (
        <p className="text-[13px] text-red-600">{pollState.error}</p>
      )}
      {pollState && pollState.ok && (
        <p className="text-[13px] text-grn-600">
          {pollState.inserted} pos · {pollState.tripsStarted} trips started · {pollState.tripsEnded} ended
          {pollState.refillsDetected > 0 && <> · {pollState.refillsDetected} refills</>}
          {pollState.leaksDetected > 0 && <> · ⚠ {pollState.leaksDetected} leaks</>}
        </p>
      )}
      <Button type="button" variant="danger" size="sm" disabled={deletePending} onClick={handleDelete}>
        {deletePending ? "Deleting…" : "Delete"}
      </Button>
      {deleteState && !deleteState.ok && (
        <p className="text-[13px] text-red-600">{deleteState.error}</p>
      )}
    </div>
  );
}
