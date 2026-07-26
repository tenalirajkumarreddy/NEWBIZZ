"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { updateBranchLocation, type ActionResult } from "@/lib/actions/branches";
import type { BranchRow } from "@/lib/data/branches";

function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) reject(new Error("Geolocation not available"));
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
    });
  });
}

interface Props {
  branch: BranchRow;
}

export function WarehouseSettingsForm({ branch }: Props) {
  const [lat, setLat] = useState(branch.lat?.toString() ?? "");
  const [lng, setLng] = useState(branch.lng?.toString() ?? "");
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<ActionResult | null>(null);

  useEffect(() => {
    setLat(branch.lat?.toString() ?? "");
    setLng(branch.lng?.toString() ?? "");
  }, [branch.lat, branch.lng]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setState(null);
    const res = await updateBranchLocation(
      branch.id,
      parseFloat(lat),
      parseFloat(lng),
    );
    setState(res);
    setPending(false);
  }

  async function handleUseCurrentLocation() {
    try {
      const pos = await getCurrentPosition();
      setLat(pos.coords.latitude.toFixed(6));
      setLng(pos.coords.longitude.toFixed(6));
    } catch {
      setState({ ok: false, error: "Could not get current location. Ensure location access is granted." });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-line bg-surface p-4 shadow-card">
      <h2 className="text-[15px] font-semibold text-ink">{branch.name}</h2>
      <p className="text-[11px] text-ink-3 mt-0.5">{branch.code} · {branch.address ?? "No address"}</p>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field label="Latitude">
          <Input
            type="number"
            step="any"
            placeholder="e.g. 16.306652"
            mono
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            required
          />
        </Field>
        <Field label="Longitude">
          <Input
            type="number"
            step="any"
            placeholder="e.g. 80.436540"
            mono
            value={lng}
            onChange={(e) => setLng(e.target.value)}
            required
          />
        </Field>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button type="submit" disabled={pending} size="sm">
          {pending ? "Saving…" : "Save Location"}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={handleUseCurrentLocation}>
          Use Current Location
        </Button>
        {branch.lat && branch.lng && (
          <a
            href={`https://www.google.com/maps?q=${branch.lat},${branch.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[12px] text-link hover:underline ml-auto"
          >
            Open in Maps
          </a>
        )}
      </div>

      {state && !state.ok && (
        <p className="mt-2 text-[12px] text-red">{state.error}</p>
      )}
      {state && state.ok && (
        <p className="mt-2 text-[12px] text-grn">Location saved.</p>
      )}
    </form>
  );
}
