"use client";

import { useState } from "react";
import { Panel, Badge, Button, Table, THead, TBody, TR, TH, TD, Field, Input } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import {
  updateCompany, createFinancialYear, closeFinancialYear,
  updateNumberSeries, createBranch, updateBranch,
  createPaymentMethod, updatePaymentMethod, updateFleetThresholds,
} from "@/lib/actions/settings";
import type { CompanyRow, FyRow, NumberSeriesRow, PaymentMethodRow, EntitySerialRow, FleetThresholds } from "@/lib/data/settings";
import type { BranchRow } from "@/lib/data/branches";

interface Props {
  company: CompanyRow | null;
  financialYears: FyRow[];
  numberSeries: NumberSeriesRow[];
  paymentMethods: PaymentMethodRow[];
  entitySerials: EntitySerialRow[];
  thresholds: FleetThresholds;
  branches: BranchRow[];
}

type Tab = "company" | "fy" | "series" | "branches" | "payments" | "thresholds" | "entity";

const TABS: { key: Tab; label: string }[] = [
  { key: "company", label: "Company" },
  { key: "fy", label: "Financial Years" },
  { key: "series", label: "Number Series" },
  { key: "branches", label: "Branches" },
  { key: "payments", label: "Payment Methods" },
  { key: "thresholds", label: "Thresholds" },
  { key: "entity", label: "Entity Codes" },
];

export function SettingsPage(props: Props) {
  const [tab, setTab] = useState<Tab>("company");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 border-b border-line overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`shrink-0 border-b-2 px-4 py-2 text-[13px] font-medium transition-colors ${
              tab === t.key ? "border-brand text-brand" : "border-transparent text-ink-3 hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "company" && <CompanyTab company={props.company} />}
      {tab === "fy" && <FyTab fys={props.financialYears} />}
      {tab === "series" && <SeriesTab series={props.numberSeries} />}
      {tab === "branches" && <BranchesTab branches={props.branches} />}
      {tab === "payments" && <PaymentsTab methods={props.paymentMethods} />}
      {tab === "thresholds" && <ThresholdsTab thresholds={props.thresholds} />}
      {tab === "entity" && <EntityTab serials={props.entitySerials} />}
    </div>
  );
}

// =====================================================================
// Company
// =====================================================================
function CompanyTab({ company }: { company: CompanyRow | null }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    try {
      const d = new FormData(e.currentTarget);
      const result = await updateCompany({
        legalName: d.get("legalName") as string,
        tradeName: d.get("tradeName") as string || undefined,
        primaryGstin: d.get("primaryGstin") as string || undefined,
        pan: d.get("pan") as string || undefined,
        stateCode: d.get("stateCode") as string || undefined,
        address: d.get("address") as string || undefined,
        fssaiNo: d.get("fssaiNo") as string || undefined,
        bisNo: d.get("bisNo") as string || undefined,
        invoiceFooter: d.get("invoiceFooter") as string || undefined,
        baseCurrency: d.get("baseCurrency") as string || undefined,
      });
      if (result.ok) toast.success("Company profile saved");
      else toast.error(result.error);
    } catch (err: any) {
      toast.error(err.message ?? "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel>
      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
        <Field label="Legal Name" required>
          <input name="legalName" defaultValue={company?.legalName ?? ""} required className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink" />
        </Field>
        <Field label="Trade Name">
          <input name="tradeName" defaultValue={company?.tradeName ?? ""} className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink" />
        </Field>
        <Field label="GSTIN">
          <input name="primaryGstin" defaultValue={company?.primaryGstin ?? ""} className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink font-mono" />
        </Field>
        <Field label="PAN">
          <input name="pan" defaultValue={company?.pan ?? ""} className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink font-mono" />
        </Field>
        <Field label="State Code">
          <input name="stateCode" defaultValue={company?.stateCode ?? "33"} className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink" />
        </Field>
        <Field label="Base Currency">
          <select name="baseCurrency" defaultValue={company?.baseCurrency ?? "INR"} className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink">
            <option value="INR">INR (₹)</option>
            <option value="USD">USD ($)</option>
          </select>
        </Field>
        <Field label="FSSAI No.">
          <input name="fssaiNo" defaultValue={company?.fssaiNo ?? ""} className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink font-mono" />
        </Field>
        <Field label="BIS / ISI No.">
          <input name="bisNo" defaultValue={company?.bisNo ?? ""} className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink font-mono" />
        </Field>
        <Field label="Address" className="col-span-2">
          <textarea name="address" defaultValue={company?.address ?? ""} rows={3} className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink" />
        </Field>
        <Field label="Invoice Footer" className="col-span-2">
          <textarea name="invoiceFooter" defaultValue={company?.invoiceFooter ?? ""} rows={2} className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink" />
        </Field>
        <div className="col-span-2 flex gap-2 pt-2">
          <Button type="submit" variant="primary" disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
        </div>
      </form>
    </Panel>
  );
}

// =====================================================================
// Financial Years
// =====================================================================
function FyTab({ fys }: { fys: FyRow[] }) {
  const toast = useToast();
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    try {
      const d = new FormData(e.currentTarget);
      const result = await createFinancialYear({
        code: d.get("code") as string,
        startDate: d.get("startDate") as string,
        endDate: d.get("endDate") as string,
      });
      if (result.ok) { toast.success("Financial year created"); setShowForm(false); }
      else toast.error(result.error);
    } catch (err: any) {
      toast.error(err.message ?? "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleClose(id: string) {
    if (!confirm("Close this financial year? This cannot be undone.")) return;
    const result = await closeFinancialYear(id);
    if (result.ok) toast.success("Financial year closed");
    else toast.error(result.error);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[13px] text-ink-3">{fys.length} year(s)</span>
        <Button variant="primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "+ New FY"}
        </Button>
      </div>

      {showForm && (
        <Panel>
          <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3">
            <Field label="Code" required>
              <input name="code" required placeholder="FY26-27" className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink" />
            </Field>
            <Field label="Start Date" required>
              <input name="startDate" type="date" required className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink" />
            </Field>
            <Field label="End Date" required>
              <input name="endDate" type="date" required className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink" />
            </Field>
            <Button type="submit" variant="primary" disabled={saving}>{saving ? "Creating..." : "Create"}</Button>
          </form>
        </Panel>
      )}

      <div className="overflow-x-auto rounded-lg border border-line">
        <Table>
          <THead>
            <TR><TH>Code</TH><TH>Start</TH><TH>End</TH><TH>Status</TH><TH className="text-center">Actions</TH></TR>
          </THead>
          <TBody>
            {fys.map((fy) => (
              <TR key={fy.id}>
                <TD className="font-medium text-[13px]">{fy.code}</TD>
                <TD className="text-[13px] text-ink-3">{fy.startDate}</TD>
                <TD className="text-[13px] text-ink-3">{fy.endDate}</TD>
                <TD><Badge tone={fy.status === "open" ? "grn" : "slate"}>{fy.status}</Badge></TD>
                <TD className="text-center">
                  {fy.status === "open" && (
                    <button onClick={() => handleClose(fy.id)} className="rounded bg-amb-wash px-2 py-0.5 text-[11px] font-medium text-amb hover:bg-amb/20">Close</button>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
    </div>
  );
}

// =====================================================================
// Number Series
// =====================================================================
function SeriesTab({ series }: { series: NumberSeriesRow[] }) {
  const toast = useToast();
  const [editing, setEditing] = useState<string | null>(null);

  async function handleSave(id: string, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const result = await updateNumberSeries(id, {
      prefix: d.get("prefix") as string || undefined,
      padWidth: d.get("padWidth") ? Number(d.get("padWidth")) : undefined,
      nextVal: d.get("nextVal") ? Number(d.get("nextVal")) : undefined,
    });
    if (result.ok) { toast.success("Updated"); setEditing(null); }
    else toast.error(result.error);
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <Table>
        <THead>
          <TR><TH>Doc Type</TH><TH>Prefix</TH><TH>Next Val</TH><TH>Pad Width</TH><TH className="text-center">Actions</TH></TR>
        </THead>
        <TBody>
          {series.map((s) => (
            <TR key={s.id}>
              {editing === s.id ? (
                <TD colSpan={5}>
                  <form onSubmit={(e) => handleSave(s.id, e)} className="flex items-end gap-2">
                    <Field label="Prefix"><input name="prefix" defaultValue={s.prefix} className="w-24 rounded-lg border border-line bg-surface px-2 py-1 text-[13px] text-ink" /></Field>
                    <Field label="Next"><input name="nextVal" type="number" defaultValue={s.nextVal} className="w-20 rounded-lg border border-line bg-surface px-2 py-1 text-[13px] text-ink" /></Field>
                    <Field label="Pad"><input name="padWidth" type="number" defaultValue={s.padWidth} className="w-16 rounded-lg border border-line bg-surface px-2 py-1 text-[13px] text-ink" /></Field>
                    <div className="flex gap-1 pb-1">
                      <Button type="submit" size="sm">Save</Button>
                      <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
                    </div>
                  </form>
                </TD>
              ) : (
                <>
                  <TD className="text-[13px] font-medium capitalize">{s.docType?.replace(/_/g, " ")}</TD>
                  <TD className="font-mono text-[13px]">{s.prefix || "—"}</TD>
                  <TD className="tabular-nums text-[13px]">{s.nextVal}</TD>
                  <TD className="tabular-nums text-[13px]">{s.padWidth}</TD>
                  <TD className="text-center">
                    <button onClick={() => setEditing(s.id)} className="text-[12px] text-brand hover:underline">Edit</button>
                  </TD>
                </>
              )}
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}

// =====================================================================
// Branches
// =====================================================================
function BranchesTab({ branches }: { branches: BranchRow[] }) {
  const toast = useToast();
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    try {
      const d = new FormData(e.currentTarget);
      const result = await createBranch({
        code: d.get("code") as string,
        name: d.get("name") as string,
        gstin: d.get("gstin") as string || undefined,
        stateCode: d.get("stateCode") as string || undefined,
        isPlant: d.get("isPlant") === "on",
        isWarehouse: d.get("isWarehouse") !== "off",
        address: d.get("address") as string || undefined,
      });
      if (result.ok) { toast.success("Branch created"); setShowForm(false); }
      else toast.error(result.error);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[13px] text-ink-3">{branches.length} branch(es)</span>
        <Button variant="primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "+ Add Branch"}
        </Button>
      </div>

      {showForm && (
        <Panel>
          <form onSubmit={handleCreate} className="grid grid-cols-2 gap-3">
            <Field label="Code" required>
              <input name="code" required placeholder="HO" className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink font-mono" />
            </Field>
            <Field label="Name" required>
              <input name="name" required placeholder="Head Office" className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink" />
            </Field>
            <Field label="GSTIN">
              <input name="gstin" className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink font-mono" />
            </Field>
            <Field label="State Code">
              <input name="stateCode" defaultValue="33" className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink" />
            </Field>
            <label className="flex items-center gap-2 text-[13px] text-ink">
              <input name="isPlant" type="checkbox" className="rounded border-line" /> Plant
            </label>
            <label className="flex items-center gap-2 text-[13px] text-ink">
              <input name="isWarehouse" type="checkbox" defaultChecked className="rounded border-line" /> Warehouse
            </label>
            <Field label="Address" className="col-span-2">
              <textarea name="address" rows={2} className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink" />
            </Field>
            <div className="col-span-2 flex gap-2">
              <Button type="submit" variant="primary" disabled={saving}>{saving ? "Creating..." : "Create"}</Button>
            </div>
          </form>
        </Panel>
      )}

      <div className="overflow-x-auto rounded-lg border border-line">
        <Table>
          <THead>
            <TR><TH>Code</TH><TH>Name</TH><TH>Type</TH><TH>Status</TH></TR>
          </THead>
          <TBody>
            {branches.map((b) => (
              <TR key={b.id}>
                <TD className="font-mono text-[13px] font-medium">{b.code}</TD>
                <TD className="text-[13px]">{b.name}</TD>
                <TD className="text-[13px]">
                  <span className="flex gap-1">
                    {b.isPlant && <Badge tone="brand">Plant</Badge>}
                    {b.isWarehouse && <Badge tone="grn">Warehouse</Badge>}
                  </span>
                </TD>
                <TD><Badge tone={b.status === "active" ? "grn" : "slate"}>{b.status}</Badge></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
    </div>
  );
}

// =====================================================================
// Payment Methods
// =====================================================================
function PaymentsTab({ methods }: { methods: PaymentMethodRow[] }) {
  const toast = useToast();
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    try {
      const d = new FormData(e.currentTarget);
      const result = await createPaymentMethod({
        code: d.get("code") as string,
        name: d.get("name") as string,
        destination: d.get("destination") as string,
        sortOrder: d.get("sortOrder") ? Number(d.get("sortOrder")) : undefined,
      });
      if (result.ok) { toast.success("Payment method created"); setShowForm(false); }
      else toast.error(result.error);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(method: PaymentMethodRow) {
    const result = await updatePaymentMethod(method.id, { isActive: !method.isActive });
    if (result.ok) toast.success(method.isActive ? "Disabled" : "Enabled");
    else toast.error(result.error);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[13px] text-ink-3">{methods.length} method(s)</span>
        <Button variant="primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "+ Add Method"}
        </Button>
      </div>

      {showForm && (
        <Panel>
          <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3">
            <Field label="Code" required>
              <input name="code" required placeholder="cash" className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink font-mono" />
            </Field>
            <Field label="Name" required>
              <input name="name" required placeholder="Cash" className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink" />
            </Field>
            <Field label="Destination" required>
              <select name="destination" required className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink">
                <option value="user_cash">User Cash</option>
                <option value="bank">Bank</option>
                <option value="cheques_in_hand">Cheques in Hand</option>
                <option value="customer_advance">Customer Advance</option>
              </select>
            </Field>
            <Field label="Sort Order">
              <input name="sortOrder" type="number" defaultValue={0} className="w-20 rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink" />
            </Field>
            <Button type="submit" variant="primary" disabled={saving}>{saving ? "Creating..." : "Create"}</Button>
          </form>
        </Panel>
      )}

      <div className="overflow-x-auto rounded-lg border border-line">
        <Table>
          <THead>
            <TR><TH>Code</TH><TH>Name</TH><TH>Destination</TH><TH>Status</TH><TH className="text-center">Actions</TH></TR>
          </THead>
          <TBody>
            {methods.map((m) => (
              <TR key={m.id}>
                <TD className="font-mono text-[13px]">{m.code}</TD>
                <TD className="text-[13px]">{m.name}</TD>
                <TD className="text-[13px] text-ink-3">{m.destination?.replace(/_/g, " ")}</TD>
                <TD><Badge tone={m.isActive ? "grn" : "slate"}>{m.isActive ? "Active" : "Inactive"}</Badge></TD>
                <TD className="text-center">
                  <button onClick={() => handleToggle(m)} className="text-[12px] text-brand hover:underline">
                    {m.isActive ? "Disable" : "Enable"}
                  </button>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
    </div>
  );
}

// =====================================================================
// Fleet Thresholds
// =====================================================================
function ThresholdsTab({ thresholds }: { thresholds: FleetThresholds }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    try {
      const d = new FormData(e.currentTarget);
      const result = await updateFleetThresholds({
        fuel_refill_threshold_pct: Number(d.get("fuelRefill")),
        fuel_leak_threshold_pct: Number(d.get("fuelLeak")),
        fraud_tolerance_pct: Number(d.get("fraud")),
        warehouse_departure_km: Number(d.get("departKm")),
        warehouse_arrival_km: Number(d.get("arriveKm")),
      });
      if (result.ok) toast.success("Thresholds saved");
      else toast.error(result.error);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel>
      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4 max-w-lg">
        <Field label="Fuel Refill Threshold (%)">
          <input name="fuelRefill" type="number" step="0.1" defaultValue={thresholds.fuelRefillThresholdPct} className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink" />
        </Field>
        <Field label="Fuel Leak Threshold (%)">
          <input name="fuelLeak" type="number" step="0.1" defaultValue={thresholds.fuelLeakThresholdPct} className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink" />
        </Field>
        <Field label="Fraud Tolerance (%)">
          <input name="fraud" type="number" step="0.1" defaultValue={thresholds.fraudTolerancePct} className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink" />
        </Field>
        <Field label="Warehouse Departure (km)">
          <input name="departKm" type="number" step="0.1" defaultValue={thresholds.warehouseDepartureKm} className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink" />
        </Field>
        <Field label="Warehouse Arrival (km)">
          <input name="arriveKm" type="number" step="0.1" defaultValue={thresholds.warehouseArrivalKm} className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink" />
        </Field>
        <div className="col-span-2 pt-2">
          <Button type="submit" variant="primary" disabled={saving}>{saving ? "Saving..." : "Save Thresholds"}</Button>
        </div>
      </form>
    </Panel>
  );
}

// =====================================================================
// Entity Codes (read-only display)
// =====================================================================
function EntityTab({ serials }: { serials: EntitySerialRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <Table>
        <THead>
          <TR><TH>Entity</TH><TH>Prefix</TH><TH>Pad Width</TH><TH>Next Value</TH></TR>
        </THead>
        <TBody>
          {serials.map((s) => (
            <TR key={s.entityType}>
              <TD className="text-[13px] font-medium capitalize">{s.entityType?.replace(/_/g, " ")}</TD>
              <TD className="font-mono text-[13px] font-bold text-brand">{s.prefix}</TD>
              <TD className="tabular-nums text-[13px]">{s.padWidth}</TD>
              <TD className="tabular-nums text-[13px]">{s.nextVal}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
