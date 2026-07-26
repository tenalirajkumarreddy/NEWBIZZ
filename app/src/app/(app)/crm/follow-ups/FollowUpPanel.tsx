"use client";

import Link from "next/link";
import type { FollowUpRow } from "@/lib/data/crm";
import { Panel } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";

const TONE_LABEL: Record<string, string> = {
  grn: "Good",
  amb: "Needs attention",
  red: "Overdue",
};

interface Props {
  items: FollowUpRow[];
}

export function FollowUpPanel({ items }: Props) {
  const leads = items.filter((i) => i.type === "lead");
  const stores = items.filter((i) => i.type === "store");

  return (
    <div className="flex flex-col gap-5">
      {items.length === 0 ? (
        <Panel flush>
          <EmptyState title="All caught up" description="No follow-ups needed right now." />
        </Panel>
      ) : (
        <>
          {/* Lead follow-ups */}
          {leads.length > 0 && (
            <Panel title={`Lead follow-ups (${leads.length})`} flush>
              <Table>
                <THead>
                  <TR>
                    <TH>Lead</TH>
                    <TH>Company</TH>
                    <TH>Reason</TH>
                    <TH>Due</TH>
                    <TH className="w-[80px]" />
                  </TR>
                </THead>
                <TBody>
                  {leads.map((item) => (
                    <TR key={item.id} interactive>
                      <TD className="p-0">
                        <Link href={`/crm/leads/${item.id.replace("lead-", "")}`} className="block px-3 py-2.5 font-medium text-ink hover:text-brand">
                          {item.label}
                        </Link>
                      </TD>
                      <TD className="text-ink-3">{item.subtitle ?? "—"}</TD>
                      <TD className="text-ink-3">{item.reason}</TD>
                      <TD>
                        <Badge tone={item.dueTone as "grn" | "amb" | "red"} size="sm">{item.dueLabel}</Badge>
                      </TD>
                      <TD>
                        <Link href={`/crm/leads/${item.id.replace("lead-", "")}`}>
                          <Button variant="subtle" size="sm">View</Button>
                        </Link>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Panel>
          )}

          {/* Store follow-ups */}
          {stores.length > 0 && (
            <Panel title={`Store follow-ups (${stores.length})`} flush>
              <Table>
                <THead>
                  <TR>
                    <TH>Store</TH>
                    <TH>Customer</TH>
                    <TH>Reason</TH>
                    <TH>Last interaction</TH>
                    <TH>Complaints</TH>
                    <TH className="w-[80px]" />
                  </TR>
                </THead>
                <TBody>
                  {stores.map((item) => (
                    <TR key={item.id}>
                      <TD className="font-medium text-ink">{item.label}</TD>
                      <TD className="text-ink-3">{item.subtitle ?? "—"}</TD>
                      <TD className="text-ink-3">{item.reason}</TD>
                      <TD>
                        <Badge tone={item.dueTone as "grn" | "amb" | "red"} size="sm">{item.dueLabel}</Badge>
                      </TD>
                      <TD className="text-ink-3">{item.openComplaints > 0 ? `${item.openComplaints} open` : "—"}</TD>
                      <TD>
                        <Link href={`/crm/stores/${item.id.replace("store-", "")}`}>
                          <Button variant="subtle" size="sm">View</Button>
                        </Link>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}
