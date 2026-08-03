"use client";

import { useState, useTransition } from "react";
import { Field, Input, Textarea, Select, Badge, Panel } from "@/components/ui";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import {
  cleanupWhatsappWebhookTest,
  testWhatsappWebhook,
  type WebhookTestResult,
  type WebhookTestScenario,
} from "@/lib/actions/whatsapp-webhook-test";

const SCENARIOS: { value: WebhookTestScenario; label: string }[] = [
  { value: "inbound-text", label: "Inbound text message" },
  { value: "inbound-media", label: "Inbound image message" },
  { value: "status-delivered", label: "Delivery status (delivered)" },
  { value: "tampered-signature", label: "Tampered signature (should 401)" },
  { value: "missing-signature", label: "Missing signature (should 401)" },
];

export function WebhookSelfTestForm({ appUrl }: { appUrl: string }) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [cleaning, startClean] = useTransition();
  const [scenario, setScenario] = useState<WebhookTestScenario>("inbound-text");
  const [phone, setPhone] = useState("919000000000");
  const [body, setBody] = useState("Hello from NEWBIZZ webhook self-test");
  const [result, setResult] = useState<WebhookTestResult | null>(null);

  function runTest() {
    setResult(null);
    startTransition(async () => {
      const res = await testWhatsappWebhook({
        origin: window.location.origin,
        scenario,
        phone,
        body,
      });
      if (res.ok) {
        setResult(res.result);
        if (res.result.ok) {
          toast.success("Webhook test passed", `HTTP ${res.result.httpStatus}`);
        } else {
          toast.warning("Webhook test returned", `HTTP ${res.result.httpStatus}`);
        }
      } else {
        toast.error("Test failed", res.error);
      }
    });
  }

  function runCleanup() {
    startClean(async () => {
      const res = await cleanupWhatsappWebhookTest(phone);
      if (res.ok) {
        toast.success("Test data cleaned up");
        setResult(null);
      } else {
        toast.error("Cleanup failed", res.error);
      }
    });
  }

  return (
    <Panel title="Webhook Self-Test" subtitle="Send a signed Meta payload to /api/webhooks/whatsapp and inspect the raw result.">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Scenario" hint="The kind of payload Meta would deliver.">
            <Select value={scenario} onChange={(e) => setScenario(e.target.value as WebhookTestScenario)}>
              {SCENARIOS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Test phone" hint="E.164 digits only — conversation is created for this number.">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} mono placeholder="919000000000" />
          </Field>
        </div>

        <Field label="Message body" hint="Used by the inbound-text scenario.">
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} />
        </Field>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={runTest} loading={pending}>
            Send test payload
          </Button>
          <Button variant="ghost" onClick={runCleanup} loading={cleaning}>
            Clean up test data
          </Button>
          {!result && (
            <span className="text-[11px] text-ink-4">
              Sends to <code className="rounded bg-fill px-1 font-mono text-[11px]">{appUrl}/api/webhooks/whatsapp</code>
            </span>
          )}
        </div>

        {result && (
          <div className="flex flex-col gap-3 rounded-lg border border-line bg-fill/40 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={result.ok ? "grn" : "red"}>
                HTTP {result.httpStatus} {result.ok ? "OK" : "FAIL"}
              </Badge>
              <Badge tone="amb">{result.scenario}</Badge>
              {result.signaturePresent ? (
                <Badge tone="brand">signature sent</Badge>
              ) : (
                <Badge tone="red">no signature</Badge>
              )}
              {result.metaAppSecretSet ? (
                <Badge tone="grn">META_APP_SECRET set</Badge>
              ) : (
                <Badge tone="red">META_APP_SECRET missing</Badge>
              )}
            </div>

            <pre className="max-h-64 overflow-auto rounded border border-line bg-surface p-3 font-mono text-[11px] leading-relaxed text-ink-2">
              {result.responseBody || "(empty response body)"}
            </pre>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="rounded border border-line bg-surface p-2.5">
                <p className="text-[11px] font-semibold text-ink-4">Conversation</p>
                <p className="truncate font-mono text-[11px] text-ink">
                  {result.effects.conversationId ?? "—"}
                </p>
              </div>
              <div className="rounded border border-line bg-surface p-2.5">
                <p className="text-[11px] font-semibold text-ink-4">Messages persisted</p>
                <p className="text-[13px] font-semibold text-ink">{result.effects.messageCount}</p>
              </div>
              <div className="rounded border border-line bg-surface p-2.5">
                <p className="text-[11px] font-semibold text-ink-4">Agent notifications</p>
                <p className="text-[13px] font-semibold text-ink">{result.effects.notificationCount}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}
