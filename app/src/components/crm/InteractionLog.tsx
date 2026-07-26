"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import type { InteractionRow } from "@/lib/data/crm";
import { Panel } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Select, Textarea } from "@/components/ui/Field";
import { logInteraction } from "@/lib/actions/crm";
import type { Database } from "@/lib/supabase/database.types";

type InteractionType = Database["public"]["Enums"]["interaction_type"];

const TYPE_LABELS: Record<InteractionType, string> = {
  call: "📞 Call",
  visit: "🏪 Visit",
  whatsapp: "💬 WhatsApp",
  order: "📦 Order",
  note: "📝 Note",
};

interface Props {
  interactions: InteractionRow[];
  leadId?: string;
  storeId?: string;
  title?: string;
}

export function InteractionLog({ interactions, leadId, storeId, title = "Interaction Log" }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [type, setType] = useState<InteractionType>("note");
  const [note, setNote] = useState("");

  function handleLog() {
    startTransition(async () => {
      const res = await logInteraction({
        leadId,
        customerStoreId: storeId,
        type,
        note: note.trim() || undefined,
      });
      if (res.ok) {
        toast.success("Interaction logged");
        router.refresh();
        setDrawerOpen(false);
        setType("note");
        setNote("");
      } else {
        toast.error("Could not log interaction", res.error);
      }
    });
  }

  return (
    <>
      <Panel
        title={title}
        actions={
          <Button variant="secondary" size="sm" onClick={() => setDrawerOpen(true)}>Log Interaction</Button>
        }
        bodyClassName="p-0"
      >
        {interactions.length === 0 ? (
          <EmptyState title="No interactions" description="Log calls, visits, or notes to track engagement." />
        ) : (
          <div className="divide-y divide-line">
            {interactions.map((ix) => (
              <div key={ix.id} className="flex items-start gap-3 px-4 py-3">
                <div className="shrink-0 pt-0.5">
                  <Badge tone="slate" size="sm">{TYPE_LABELS[ix.type]}</Badge>
                </div>
                <div className="min-w-0 flex-1">
                  {ix.note && <p className="text-[13px] text-ink">{ix.note}</p>}
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-ink-4">
                    <span>{ix.byUserName ?? "System"}</span>
                    <span>·</span>
                    <span>{new Date(ix.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Log Interaction"
        size="sm"
      >
        <div className="flex flex-col gap-4">
          <Field label="Type" htmlFor="ix-type">
            <Select id="ix-type" value={type} onChange={(e) => setType(e.target.value as InteractionType)}>
              <option value="call">Call</option>
              <option value="visit">Visit</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="order">Order</option>
              <option value="note">Note</option>
            </Select>
          </Field>
          <Field label="Note" htmlFor="ix-note">
            <Textarea id="ix-note" rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened?" />
          </Field>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setDrawerOpen(false)}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={handleLog} loading={pending} disabled={!note.trim()}>
              Log
            </Button>
          </div>
        </div>
      </Drawer>
    </>
  );
}
