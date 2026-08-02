"use client";

import { useState } from "react";
import { Panel, Badge, Button, Table, THead, TBody, TR, TH, TD, Field, Dialog, ConfirmDialog, Kpi, EmptyState } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { createLicense, updateLicense, deleteLicense } from "@/lib/actions/licenses";
import { LICENSE_TYPE_LABELS, type LicenseRow, type LicenseType, type LicenseStatus } from "@/lib/data/licenses.types";

interface Props {
  licenses: LicenseRow[];
}

type EditorState =
  | { mode: "create" }
  | { mode: "edit"; row: LicenseRow }
  | null;

export function LicensesPage({ licenses }: Props) {
  const toast = useToast();
  const [editor, setEditor] = useState<EditorState>(null);
  const [deleting, setDeleting] = useState<LicenseRow | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "expiring" | "expired">("all");

  const total = licenses.length;
  const active = licenses.filter((l) => l.status !== "expired" && l.daysToExpiry > 0).length;
  const expiring = licenses.filter((l) => l.status === "active" && l.daysToExpiry >= 0 && l.daysToExpiry <= l.renewalReminderDays).length;
  const expired = licenses.filter((l) => l.status === "expired" || l.daysToExpiry < 0).length;

  const shown = licenses.filter((l) => {
    if (filter === "active") return l.status !== "expired" && l.daysToExpiry > 0;
    if (filter === "expiring") return l.status === "active" && l.daysToExpiry >= 0 && l.daysToExpiry <= l.renewalReminderDays;
    if (filter === "expired") return l.status === "expired" || l.daysToExpiry < 0;
    return true;
  });

  async function handleDelete() {
    if (!deleting) return;
    const result = await deleteLicense(deleting.id);
    if (result.ok) toast.success("Licence deleted");
    else toast.error(result.error);
    setDeleting(null);
  }

  async function handleStatus(id: string, status: LicenseStatus) {
    const result = await updateLicense(id, { status });
    if (result.ok) toast.success(`Marked ${status.replace("_", " ")}`);
    else toast.error(result.error);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Total licences" value={total} />
        <Kpi label="Active" value={active} tone="grn" />
        <Kpi label="Expiring soon" value={expiring} tone="amb" sub="within reminder window" />
        <Kpi label="Expired / overdue" value={expired} tone={expired > 0 ? "amb" : undefined} sub={expired > 0 ? "action required" : undefined} />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex gap-1 overflow-x-auto rounded-lg border border-line p-0.5">
          {(["all", "active", "expiring", "expired"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1 text-[12px] font-medium capitalize transition-colors ${
                filter === f ? "bg-fill text-ink" : "text-ink-3 hover:text-ink"
              }`}
            >
              {f === "all" ? "All" : f}
            </button>
          ))}
        </div>
        <Button variant="primary" onClick={() => setEditor({ mode: "create" })}>
          + Add Licence
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-line">
        <Table>
          <THead>
            <TR>
              <TH>Type</TH>
              <TH>Licence No.</TH>
              <TH>Authority</TH>
              <TH>Issued</TH>
              <TH>Expires</TH>
              <TH className="text-right">Days left</TH>
              <TH>Status</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {shown.length === 0 && (
              <TR>
                <TD colSpan={8} className="px-0 py-0">
                  <EmptyState
                    title="No licences here yet"
                    description="Add your first statutory licence — FSSAI, trade licence, PCB consent — and get renewal reminders before they lapse."
                  />
                </TD>
              </TR>
            )}
            {shown.map((l) => {
              const d = l.daysToExpiry;
              const isExpired = l.status === "expired" || d < 0;
              const isRenewing = l.status === "renewal_in_progress";
              const dueSoon = l.status === "active" && d <= l.renewalReminderDays;
              return (
                <TR key={l.id}>
                  <TD className="text-[13px] font-medium text-ink">{LICENSE_TYPE_LABELS[l.type]}</TD>
                  <TD className="font-mono text-[13px] text-ink">{l.licenseNo}</TD>
                  <TD className="max-w-[180px] truncate text-[13px] text-ink-3">{l.issuingAuthority ?? "—"}</TD>
                  <TD className="text-[13px] text-ink-3">{l.issuedDate ? fmt(l.issuedDate) : "—"}</TD>
                  <TD className="font-mono text-[13px] text-ink">{fmt(l.expiryDate)}</TD>
                  <TD className={`text-right font-mono text-[13px] ${isExpired ? "text-red" : d <= 30 ? "text-amb" : "text-ink"}`}>
                    {isExpired ? "Overdue" : d <= 0 ? "Today" : `${d}d`}
                  </TD>
                  <TD>
                    <Badge tone={isExpired ? "red" : isRenewing ? "amb" : dueSoon ? "amb" : "grn"}>
                      {isExpired ? "expired" : isRenewing ? "renewal in progress" : dueSoon ? "expiring" : "active"}
                    </Badge>
                  </TD>
                  <TD className="text-right">
                    <span className="flex justify-end gap-1">
                      {!isExpired && !isRenewing && (
                        <Button variant="ghost" size="sm" onClick={() => handleStatus(l.id, "renewal_in_progress")}>
                          Renew
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => setEditor({ mode: "edit", row: l })}>
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" className="text-red hover:bg-red-wash hover:text-red" onClick={() => setDeleting(l)}>
                        Delete
                      </Button>
                    </span>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </div>

      {editor && (
        <LicenseEditor
          editor={editor}
          onClose={() => setEditor(null)}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title="Delete licence?"
        description={`This will permanently remove "${deleting?.licenseNo ?? ""}" from the register.`}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}

// =====================================================================
// Create / Edit form
// =====================================================================
function LicenseEditor({ editor, onClose }: { editor: NonNullable<EditorState>; onClose: () => void }) {
  const toast = useToast();
  const isEdit = editor.mode === "edit";
  const row = editor.mode === "edit" ? editor.row : null;
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    try {
      const d = new FormData(e.currentTarget);
      const type = d.get("type") as LicenseType;
      const licenseNo = d.get("licenseNo") as string;
      const expiryDate = d.get("expiryDate") as string;
      const issuedDate = (d.get("issuedDate") as string) || null;
      const issuingAuthority = (d.get("issuingAuthority") as string) || null;
      const notes = (d.get("notes") as string) || null;
      const reminder = Number(d.get("renewalReminderDays") ?? 60);

      const result = isEdit && row
        ? await updateLicense(row.id, { type, licenseNo, expiryDate, issuedDate, issuingAuthority, notes, renewalReminderDays: reminder })
        : await createLicense({ type, licenseNo, expiryDate, issuedDate, issuingAuthority, notes, renewalReminderDays: reminder });

      if (result.ok) {
        toast.success(isEdit ? "Licence updated" : "Licence added");
        onClose();
      } else {
        toast.error(result.error);
      }
    } catch (err: any) {
      toast.error(err.message ?? "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={isEdit ? "Edit Licence" : "Add Licence"}
      description="Track a statutory or business licence with its authority and renewal window."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" form="license-form" variant="primary" disabled={saving}>
            {saving ? "Saving..." : isEdit ? "Save Changes" : "Add Licence"}
          </Button>
        </>
      }
    >
      <form id="license-form" onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
        <Field label="Type" required>
          <select name="type" defaultValue={row?.type ?? "fssai"} required className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink">
            {Object.entries(LICENSE_TYPE_LABELS).map(([v, label]) => (
              <option key={v} value={v}>{label}</option>
            ))}
          </select>
        </Field>
        <Field label="Licence No." required>
          <input name="licenseNo" defaultValue={row?.licenseNo ?? ""} required className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 font-mono text-[13px] text-ink" />
        </Field>
        <Field label="Issuing Authority">
          <input name="issuingAuthority" defaultValue={row?.issuingAuthority ?? ""} className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink" />
        </Field>
        <Field label="Renewal Reminder (days before)" >
          <input name="renewalReminderDays" type="number" min={0} max={365} defaultValue={row?.renewalReminderDays ?? 60} className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 font-mono text-[13px] text-ink" />
        </Field>
        <Field label="Issued Date">
          <input name="issuedDate" type="date" defaultValue={row?.issuedDate?.slice(0, 10) ?? ""} className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink" />
        </Field>
        <Field label="Expiry Date" required>
          <input name="expiryDate" type="date" defaultValue={row?.expiryDate?.slice(0, 10) ?? ""} required className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink" />
        </Field>
        <Field label="Notes" className="col-span-2">
          <textarea name="notes" defaultValue={row?.notes ?? ""} rows={2} className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink" />
        </Field>
      </form>
    </Dialog>
  );
}

function fmt(date: string): string {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return date.slice(0, 10);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
