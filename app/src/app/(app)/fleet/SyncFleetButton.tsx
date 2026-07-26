"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { syncVehiclesFromIntangles, type SyncResult } from "@/lib/actions/fleet";

export function SyncFleetButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<SyncResult | null>(null);

  async function handle() {
    setPending(true);
    setState(null);
    const res = await syncVehiclesFromIntangles();
    if (res.ok) router.refresh();
    setState(res);
    setPending(false);
  }

  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={handle}>
        {pending ? "Syncing…" : "Sync from Intangles"}
      </Button>
      {state && !state.ok && (
        <p className="text-[13px] text-red-600">{state.error}</p>
      )}
      {state && state.ok && (
        <p className="text-[13px] text-grn-600">Synced {state.created} vehicles</p>
      )}
    </div>
  );
}
