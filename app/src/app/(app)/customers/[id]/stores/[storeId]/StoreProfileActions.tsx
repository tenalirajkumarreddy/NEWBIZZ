"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Panel } from "@/components/ui/Card";
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
}

// Edit-details drawer + activate/deactivate for a store profile. Rendered in the
// header; the edit form expands inline below the buttons when opened.
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
  const [f, setF] = useState<StoreEditFields>(initial);

  const isActive = status === "active";

  function set<K extends keyof StoreEditFields>(k: K, v: string) {
    setF((prev) => ({ ...prev, [k]: v }));
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
    <div className="flex shrink-0 flex-col items-end gap-2">
      <div className="flex items-center gap-1.5">
        {!editing && (
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>Edit details</Button>
        )}
        {confirmStatus ? (
          <>
            <Button variant={isActive ? "danger" : "primary"} size="sm" onClick={onToggleStatus} loading={pending}>
              Confirm {isActive ? "deactivate" : "reactivate"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmStatus(false)} disabled={pending}>Cancel</Button>
          </>
        ) : (
          <Button variant="ghost" size="sm" onClick={onToggleStatus} disabled={pending}>
            {isActive ? "Deactivate" : "Reactivate"}
          </Button>
        )}
      </div>

      {editing && (
        <Panel title="Edit store" flush className="w-full sm:w-[520px]">
          <div className="flex flex-col gap-3 p-4">
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
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setF(initial); setEditing(false); }} disabled={pending}>Cancel</Button>
              <Button variant="primary" size="sm" onClick={onSave} loading={pending}>Save</Button>
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}
