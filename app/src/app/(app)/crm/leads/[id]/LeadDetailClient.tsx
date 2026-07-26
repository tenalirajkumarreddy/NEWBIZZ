"use client";

import { useState } from "react";
import type { LeadRow, InteractionRow } from "@/lib/data/crm";
import { Panel } from "@/components/ui/Card";
import { InteractionLog } from "@/components/crm/InteractionLog";
import { ConvertLeadDialog } from "../../ConvertLeadDialog";

interface Props {
  lead: LeadRow;
  interactions: InteractionRow[];
}

export function LeadDetailClient({ lead, interactions }: Props) {
  const [showConvert, setShowConvert] = useState(false);

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_360px]">
      <div className="flex flex-col gap-5">
        <InteractionLog
          interactions={interactions}
          leadId={lead.id}
        />
      </div>

      <div className="flex flex-col gap-4">
        <Panel title="Details">
          <div className="flex flex-col gap-3 text-[13px]">
            <div className="flex justify-between">
              <span className="text-ink-3">Company</span>
              <span className="text-ink">{lead.company ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-3">Phone</span>
              <span className="font-mono text-ink">{lead.phone ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-3">Email</span>
              <span className="text-ink">{lead.email ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-3">Source</span>
              <span className="text-ink capitalize">{lead.source ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-3">Assigned to</span>
              <span className="text-ink">{lead.assignedToName ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-3">Follow-up</span>
              <span className="font-mono text-ink">{lead.followUpDate ?? "—"}</span>
            </div>
            {lead.notes && (
              <div>
                <span className="text-ink-3">Notes</span>
                <p className="mt-1 whitespace-pre-wrap text-ink">{lead.notes}</p>
              </div>
            )}
          </div>
        </Panel>

        {lead.status === "qualified" && (
          <button
            type="button"
            onClick={() => setShowConvert(true)}
            className="w-full rounded-lg bg-brand px-4 py-2.5 text-center text-[13px] font-semibold text-white transition-colors hover:bg-brand/90"
          >
            Convert to customer
          </button>
        )}
      </div>

      {showConvert && <ConvertLeadDialog lead={lead} onClose={() => setShowConvert(false)} />}
    </div>
  );
}
