"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { Select } from "@/components/ui/Field";
import { updateStore, setStoreStatus } from "@/lib/actions/customers";

const KINDS = [
  { value: "retail", label: "Retail" },
  { value: "wholesale", label: "Wholesale" },
  { value: "distributor", label: "Distributor" },
  { value: "institution", label: "Institution" },
] as const;

interface StoreEditFields {
  kind: "retail" | "wholesale" | "distributor" | "institution";
  contact_name: string;
  phone: string;
  address_line: string;
  area: string;
  city: string;
  pincode: string;
  state_code: string;
  geo_lat: string;
  geo_lng: string;
}

export function StoreProfileActions({
  storeId,
  customerId,
  status,
  initial,
}: {
  storeId: string;
  customerId: string;
  status: string;
  initial: StoreEditFields;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [confirmStatus, setConfirmStatus] = useState(false);
  const [locating, setLocating] = useState(false);
  const [f, setF] = useState<StoreEditFields>(initial);

  const isActive = status === "active";

  function set<K extends keyof StoreEditFields>(k: K, v: string) {
    setF((prev) => ({ ...prev, [k]: v }));
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      toast.error("Not supported", "Geolocation is not available in this browser.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setF((prev) => ({ ...prev, geo_lat: pos.coords.latitude.toFixed(6), geo_lng: pos.coords.longitude.toFixed(6) }));
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        toast.error("Location failed", err.message);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  function onSave() {
    startTransition(async () => {
      const res = await updateStore(storeId, customerId, {
        kind: f.kind,
        contact_name: f.contact_name,
        phone: f.phone,
        address_line: f.address_line,
        area: f.area,
        city: f.city,
        pincode: f.pincode,
        state_code: f.state_code,
        geo_lat: f.geo_lat ? parseFloat(f.geo_lat) : null,
        geo_lng: f.geo_lng ? parseFloat(f.geo_lng) : null,
      });
      if (res.ok) {
        toast.success("Store updated", "Details saved.");
        setEditing(false);
        router.refresh();
      } else {
        toast.error("Could not save", res.error);
      }
    });
  }

  function onToggleStatus() {
    if (!confirmStatus) {
      setConfirmStatus(true);
      return;
    }
    startTransition(async () => {
      const res = await setStoreStatus(storeId, customerId, isActive ? "inactive" : "active");
      setConfirmStatus(false);
      if (res.ok) {
        toast.success(isActive ? "Store deactivated" : "Store reactivated", "");
        router.refresh();
      } else {
        toast.error("Could not update status", res.error);
      }
    });
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
      <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>Edit details</Button>

      {confirmStatus ? (
        <>
          <Button variant={isActive ? "danger" : "primary"} size="sm" onClick={onToggleStatus} loading={pending}>
            Confirm {isActive ? "deactivate" : "reactivate"}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setConfirmStatus(false)} disabled={pending}>Cancel</Button>
        </>
      ) : (
        <Button variant="secondary" size="sm" onClick={onToggleStatus} disabled={pending}>
          {isActive ? "Deactivate" : "Reactivate"}
        </Button>
      )}

      <Drawer open={editing} onClose={() => { setF(initial); setEditing(false); }} title="Edit store details" size="lg">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Kind">
              <Select value={f.kind} onChange={(e) => set("kind", e.target.value as typeof f.kind)}>
                {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
              </Select>
            </Field>
            <Field label="Contact name"><Input value={f.contact_name} onChange={(e) => set("contact_name", e.target.value)} /></Field>
            <Field label="Phone"><Input value={f.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
            <Field label="Address" className="col-span-2"><Input value={f.address_line} onChange={(e) => set("address_line", e.target.value)} /></Field>
            <Field label="Area"><Input value={f.area} onChange={(e) => set("area", e.target.value)} /></Field>
            <Field label="City"><Input value={f.city} onChange={(e) => set("city", e.target.value)} /></Field>
            <Field label="Pincode"><Input mono value={f.pincode} onChange={(e) => set("pincode", e.target.value)} /></Field>
            <Field label="State code" hint="Place of supply"><Input mono value={f.state_code} onChange={(e) => set("state_code", e.target.value)} /></Field>
            <Field label="Latitude"><Input mono inputMode="decimal" value={f.geo_lat} onChange={(e) => set("geo_lat", e.target.value)} placeholder="e.g. 12.971599" /></Field>
            <Field label="Longitude"><Input mono inputMode="decimal" value={f.geo_lng} onChange={(e) => set("geo_lng", e.target.value)} placeholder="e.g. 77.594566" /></Field>
          </div>
          <div className="flex items-center justify-between pt-1">
            <Button variant="secondary" size="sm" onClick={useCurrentLocation} loading={locating}>
              <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 0v2M8 14v2M0 8h2M14 8h2M4 8a4 4 0 118 0 4 4 0 01-8 0"/></svg>
              Use my location
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setF(initial); setEditing(false); }} disabled={pending}>Cancel</Button>
              <Button variant="primary" size="sm" onClick={onSave} loading={pending}>Save</Button>
            </div>
          </div>
        </div>
      </Drawer>
    </div>
  );
}
