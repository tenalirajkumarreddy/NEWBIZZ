"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import type { ComplaintRow } from "@/lib/data/crm";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Panel } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { updateComplaint } from "@/lib/actions/crm";
import { Dialog } from "@/components/ui/Dialog";
import type { Database } from "@/lib/supabase/database.types";

type ComplaintStatus = Database["public"]["Enums"]["complaint_status"];
type ComplaintResolution = Database["public"]["Enums"]["complaint_resolution"];

const STATUS_TONES: Record<ComplaintStatus, "slate" | "brand" | "amb" | "grn" | "red"> = {
  open: "amb",
  in_progress: "brand",
  resolved: "grn",
  rejected: "red",
};

interface Props {
  complaints: ComplaintRow[];
}

export function ComplaintsTable({ complaints }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [resolveDialog, setResolveDialog] = useState<ComplaintRow | null>(null);
  const [resolution, setResolution] = useState<ComplaintResolution>("credit_note");

  function handleStatus(complaint: ComplaintRow, status: ComplaintStatus) {
    startTransition(async () => {
      const res = await updateComplaint(complaint.id, { status });
      if (res.ok) {
        toast.success("Complaint updated", `Status → ${status.replace("_", " ")}`);
        router.refresh();
      } else {
        toast.error("Could not update", res.error);
      }
    });
  }

  function handleResolve() {
    if (!resolveDialog) return;
    startTransition(async () => {
      const res = await updateComplaint(resolveDialog.id, { status: "resolved", resolution });
      if (res.ok) {
        toast.success("Complaint resolved", `Resolution: ${resolution.replace("_", " ")}`);
        router.refresh();
        setResolveDialog(null);
      } else {
        toast.error("Could not resolve", res.error);
      }
    });
  }

  return (
    <>
      <Panel title={`${complaints.length} complaint${complaints.length === 1 ? "" : "s"}`} flush>
        {complaints.length === 0 ? (
          <EmptyState title="No complaints" description="Complaints raised against stores will appear here." />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Store</TH>
                <TH>Status</TH>
                <TH>Resolution</TH>
                <TH>Note</TH>
                <TH>Created</TH>
                <TH className="w-[180px]" />
              </TR>
            </THead>
            <TBody>
              {complaints.map((c) => (
                <TR key={c.id}>
                  <TD className="font-medium text-ink">{c.storeName ?? "—"}</TD>
                  <TD><Badge tone={STATUS_TONES[c.status]} size="sm">{c.status.replace("_", " ")}</Badge></TD>
                  <TD className="text-ink-3">{c.resolution?.replace("_", " ") ?? "—"}</TD>
                  <TD className="max-w-[200px] truncate text-ink-3">{c.note ?? "—"}</TD>
                  <TD className="font-mono text-[12px] text-ink-3">
                    {new Date(c.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                  </TD>
                  <TD>
                    <div className="flex items-center gap-1">
                      {c.status === "open" && (
                        <Button variant="subtle" size="sm" onClick={() => handleStatus(c, "in_progress")} loading={pending}>
                          In Progress
                        </Button>
                      )}
                      {c.status === "in_progress" && (
                        <>
                          <Button variant="primary" size="sm" onClick={() => setResolveDialog(c)}>
                            Resolve
                          </Button>
                          <Button variant="danger" size="sm" onClick={() => handleStatus(c, "rejected")} loading={pending}>
                            Reject
                          </Button>
                        </>
                      )}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Panel>

      {resolveDialog && (
        <Dialog
          open
          onClose={() => setResolveDialog(null)}
          title="Resolve complaint"
          size="sm"
          footer={
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setResolveDialog(null)}>Cancel</Button>
              <Button variant="primary" size="sm" onClick={handleResolve} loading={pending}>Resolve</Button>
            </div>
          }
        >
          <div className="flex flex-col gap-3">
            <p className="text-[14px] text-ink-3">Choose resolution for complaint against <strong>{resolveDialog.storeName}</strong>.</p>
            <div className="flex gap-2">
              {(["replacement", "credit_note", "rejected"] as ComplaintResolution[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setResolution(r)}
                  className={`rounded-lg border px-3 py-2 text-[13px] font-medium transition-colors ${resolution === r ? "border-brand bg-brand-wash text-brand" : "border-line text-ink-3 hover:border-line-strong"}`}
                >
                  {r.replace("_", " ")}
                </button>
              ))}
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
