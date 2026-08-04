"use client";

import { useState, useTransition } from "react";
import { Field, Input, Badge, Panel } from "@/components/ui";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { enqueueWhatsappTestNotification } from "@/lib/actions/whatsapp";
import type { DrainResult } from "@/lib/whatsapp/worker";

export function WhatsAppTestPanel({ dryRun }: { dryRun: boolean }) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [phone, setPhone] = useState("919000000000");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("This is a test WhatsApp notification.");
  const [result, setResult] = useState<DrainResult | null>(null);

  function runTest() {
    setResult(null);
    startTransition(async () => {
      const res = await enqueueWhatsappTestNotification({ phone, title, body });
      if (res.ok) {
        setResult(res.drain ?? null);
        toast.success("Test notification enqueued & worker drained", res.conversationId);
      } else {
        toast.error("Could not enqueue test", res.error);
      }
    });
  }

  return (
    <Panel
      title="Test notification"
      subtitle="Enqueue a whatsapp-channel notification and run the dispatch worker on it."
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Recipient phone" hint="E.164 digits — a conversation is created for this number.">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} mono placeholder="919000000000" />
          </Field>
          <Field label="Title" hint="Notification title shown to the owning user.">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="WhatsApp test notification" />
          </Field>
        </div>
        <Field label="Message body" hint="The text the customer would receive.">
          <Input value={body} onChange={(e) => setBody(e.target.value)} placeholder="This is a test WhatsApp notification." />
        </Field>

        <div className="flex items-center gap-2">
          <Button variant="primary" onClick={runTest} loading={pending}>
            Enqueue + drain
          </Button>
          {dryRun && (
            <span className="text-[11px] text-ink-4">Dry-run — sends are logged, not delivered.</span>
          )}
        </div>

        {result && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-fill/40 p-3 text-[12px]">
            <Badge tone="grn">scanned {result.scanned}</Badge>
            <Badge tone="grn">sent {result.sent}</Badge>
            <Badge tone="neutral">skipped {result.skipped}</Badge>
            <Badge tone={result.failed > 0 ? "red" : "grn"}>failed {result.failed}</Badge>
            <Badge tone={result.dryRun ? "amb" : "grn"}>{result.dryRun ? "dry-run" : "live"}</Badge>
          </div>
        )}
      </div>
    </Panel>
  );
}
