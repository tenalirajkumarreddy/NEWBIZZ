"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import type { LeadRow } from "@/lib/data/crm";
import { Input, Select, Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { LeadDialog } from "./LeadDialog";
import { ConvertLeadDialog } from "./ConvertLeadDialog";
import type { Database } from "@/lib/supabase/database.types";

type LeadStatus = Database["public"]["Enums"]["lead_status"];

const STATUS_TONES: Record<LeadStatus, "slate" | "brand" | "amb" | "grn" | "red"> = {
  new: "slate",
  contacted: "brand",
  qualified: "amb",
  converted: "grn",
  lost: "red",
};

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "qualified", label: "Qualified" },
  { value: "converted", label: "Converted" },
  { value: "lost", label: "Lost" },
];

export function LeadsTable({ leads: initial }: { leads: LeadRow[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [createOpen, setCreateOpen] = useState(false);
  const [convertLead, setConvertLead] = useState<LeadRow | null>(null);

  const q = sp.get("q") ?? "";
  const status = sp.get("status") ?? "";

  const setParam = useCallback(
    (key: string, value: string) => {
      const p = new URLSearchParams(sp);
      if (value) p.set(key, value);
      else p.delete(key);
      startTransition(() => router.replace(`${pathname}?${p.toString()}`));
    },
    [router, pathname, sp],
  );

  const filtered = initial.filter((l) => {
    if (status && l.status !== status) return false;
    if (q) {
      const query = q.toLowerCase();
      if (!l.name.toLowerCase().includes(query) && !(l.company ?? "").toLowerCase().includes(query) && !(l.phone ?? "").includes(query)) return false;
    }
    return true;
  });

  return (
    <>
      <Panel
        title={`${filtered.length} lead${filtered.length === 1 ? "" : "s"}`}
        actions={
          <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
            New Lead
          </Button>
        }
        bodyClassName="p-0"
      >
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
          <Field label="Search" htmlFor="lead-q" className="mb-0 min-w-[200px]">
            <Input
              id="lead-q"
              placeholder="Name, company or phone…"
              value={q}
              onChange={(e) => setParam("q", e.target.value)}
              mono={false}
            />
          </Field>
          <Field label="Status" htmlFor="lead-status" className="mb-0 min-w-[150px]">
            <Select id="lead-status" value={status} onChange={(e) => setParam("status", e.target.value)}>
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </Field>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            title="No leads found"
            description={q || status ? "Try adjusting your filters." : "Create your first lead to start tracking."}
            action={!q && !status ? <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>New Lead</Button> : undefined}
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Company</TH>
                <TH>Phone</TH>
                <TH>Source</TH>
                <TH>Status</TH>
                <TH>Assigned to</TH>
                <TH>Follow-up</TH>
                <TH className="w-[80px]" />
              </TR>
            </THead>
            <TBody>
              {filtered.map((lead) => (
                <TR key={lead.id} interactive>
                  <TD className="p-0">
                    <Link href={`/crm/leads/${lead.id}`} className="block px-3 py-2.5 font-medium text-ink hover:text-brand">
                      {lead.name}
                    </Link>
                  </TD>
                  <TD className="text-ink-3">{lead.company ?? "—"}</TD>
                  <TD className="font-mono text-[12px] text-ink-3">{lead.phone ?? "—"}</TD>
                  <TD className="text-ink-3">{lead.source ?? "—"}</TD>
                  <TD><Badge tone={STATUS_TONES[lead.status]} size="sm">{lead.status}</Badge></TD>
                  <TD className="text-ink-3">{lead.assignedToName ?? "—"}</TD>
                  <TD className="font-mono text-[12px] text-ink-3">{lead.followUpDate ?? "—"}</TD>
                  <TD className="text-right">
                    {lead.status === "qualified" && (
                      <Button
                        variant="subtle"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); setConvertLead(lead); }}
                      >
                        Convert
                      </Button>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Panel>

      {createOpen && <LeadDialog mode="create" onClose={() => setCreateOpen(false)} />}
      {convertLead && <ConvertLeadDialog lead={convertLead} onClose={() => setConvertLead(null)} />}
    </>
  );
}
