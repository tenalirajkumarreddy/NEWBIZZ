"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import type { CampaignRow } from "@/lib/data/crm";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Panel } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { createCampaign, updateCampaign } from "@/lib/actions/crm";
import type { Database } from "@/lib/supabase/database.types";

type CampaignChannel = Database["public"]["Enums"]["campaign_channel"];
type CampaignStatus = Database["public"]["Enums"]["campaign_status"];

const STATUS_TONES: Record<CampaignStatus, "slate" | "brand" | "amb" | "grn" | "red"> = {
  draft: "slate",
  scheduled: "brand",
  sending: "amb",
  sent: "grn",
  cancelled: "red",
};

interface Props {
  campaigns: CampaignRow[];
}

export function CampaignsTable({ campaigns }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);

  const [name, setName] = useState("");
  const [channel, setChannel] = useState<CampaignChannel>("whatsapp");
  const [message, setMessage] = useState("");

  function handleCreate() {
    startTransition(async () => {
      const res = await createCampaign({ name: name.trim(), message: message.trim() || undefined, channel });
      if (res.ok) {
        toast.success("Campaign created", name);
        router.refresh();
        setCreateOpen(false);
        setName(""); setChannel("whatsapp"); setMessage("");
      } else {
        toast.error("Could not create", res.error);
      }
    });
  }

  function handleCancel(campaign: CampaignRow) {
    startTransition(async () => {
      const res = await updateCampaign(campaign.id, { status: "cancelled" });
      if (res.ok) { toast.success("Campaign cancelled"); router.refresh(); }
      else { toast.error("Could not cancel", res.error); }
    });
  }

  return (
    <>
      <Panel
        title={`${campaigns.length} campaign${campaigns.length === 1 ? "" : "s"}`}
        actions={<Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>New Campaign</Button>}
        flush
      >
        {campaigns.length === 0 ? (
          <EmptyState title="No campaigns" description="Create your first marketing campaign." />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Channel</TH>
                <TH>Status</TH>
                <TH>Scheduled</TH>
                <TH>Created</TH>
                <TH className="w-[80px]" />
              </TR>
            </THead>
            <TBody>
              {campaigns.map((c) => (
                <TR key={c.id}>
                  <TD className="font-medium text-ink">{c.name}</TD>
                  <TD><Badge tone="slate" size="sm">{c.channel}</Badge></TD>
                  <TD><Badge tone={STATUS_TONES[c.status]} size="sm">{c.status}</Badge></TD>
                  <TD className="font-mono text-[12px] text-ink-3">{c.scheduleAt ? new Date(c.scheduleAt).toLocaleDateString("en-IN") : "—"}</TD>
                  <TD className="font-mono text-[12px] text-ink-3">
                    {new Date(c.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                  </TD>
                  <TD>
                    {c.status === "draft" || c.status === "scheduled" ? (
                      <Button variant="danger" size="sm" onClick={() => handleCancel(c)} loading={pending}>Cancel</Button>
                    ) : null}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Panel>

      {createOpen && (
        <Dialog
          open
          onClose={() => setCreateOpen(false)}
          title="New Campaign"
          size="sm"
          footer={
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button variant="primary" size="sm" onClick={handleCreate} loading={pending} disabled={!name.trim()}>
                Create
              </Button>
            </div>
          }
        >
          <div className="flex flex-col gap-4">
            <Field label="Name" required htmlFor="camp-name">
              <Input id="camp-name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Channel" htmlFor="camp-channel">
              <Select id="camp-channel" value={channel} onChange={(e) => setChannel(e.target.value as CampaignChannel)}>
                <option value="whatsapp">WhatsApp</option>
                <option value="sms">SMS</option>
                <option value="email">Email</option>
              </Select>
            </Field>
            <Field label="Message" htmlFor="camp-msg">
              <Textarea id="camp-msg" rows={4} value={message} onChange={(e) => setMessage(e.target.value)} />
            </Field>
          </div>
        </Dialog>
      )}
    </>
  );
}
