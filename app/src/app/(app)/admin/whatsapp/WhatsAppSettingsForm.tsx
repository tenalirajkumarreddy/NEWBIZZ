"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Field, Input, Badge, Panel } from "@/components/ui";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { saveWhatsappConfig } from "@/lib/actions/whatsapp";

interface InitialState {
  wabaId: string | null;
  phoneNumberId: string | null;
  metaAppId: string | null;
  defaultTemplate: string | null;
  dryRun: boolean;
  configured: boolean;
}

export function WhatsAppSettingsForm({ initial }: { initial: InitialState | null }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [wabaId, setWabaId] = useState(initial?.wabaId ?? "");
  const [phoneNumberId, setPhoneNumberId] = useState(initial?.phoneNumberId ?? "");
  const [accessToken, setAccessToken] = useState("");
  const [metaAppId, setMetaAppId] = useState(initial?.metaAppId ?? "");
  const [verifyToken, setVerifyToken] = useState("");
  const [defaultTemplate, setDefaultTemplate] = useState(initial?.defaultTemplate ?? "");
  const [dryRun, setDryRun] = useState(initial?.dryRun ?? true);

  function handleSave() {
    startTransition(async () => {
      const res = await saveWhatsappConfig({
        wabaId: wabaId || undefined,
        phoneNumberId: phoneNumberId || undefined,
        accessToken: accessToken || undefined,
        metaAppId: metaAppId || undefined,
        verifyToken: verifyToken || undefined,
        defaultTemplate: defaultTemplate || undefined,
        dryRun,
      });
      if (res.ok) {
        toast.success("WhatsApp settings saved");
        setAccessToken("");
        setVerifyToken("");
        router.refresh();
      } else {
        toast.error("Could not save", res.error);
      }
    });
  }

  return (
    <Panel className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">Connection</h2>
          <p className="text-[11px] text-ink-3">
            {initial?.configured
              ? "Saved and ready — update values to change."
              : "Not configured yet — fill in the Meta credentials."}
          </p>
        </div>
        <Badge tone={initial?.configured ? "grn" : "amb"} dot>
          {initial?.configured ? "Configured" : "Not configured"}
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="WABA ID" hint="WhatsApp Business Account ID">
          <Input value={wabaId} onChange={(e) => setWabaId(e.target.value)} mono placeholder="e.g. 123456789012345" />
        </Field>
        <Field label="Phone Number ID" hint="The sending phone number's ID">
          <Input value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} mono placeholder="e.g. 123456789012345" />
        </Field>
        <Field
          label="Access Token"
          hint={initial?.configured ? "Leave blank to keep the existing token." : "Permanent system user token."}
          className="sm:col-span-2"
        >
          <Input
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            type="password"
            autoComplete="off"
            mono
            placeholder={initial?.configured ? "•••••••• (unchanged)" : "Paste the Meta access token"}
          />
        </Field>
        <Field label="Meta App ID">
          <Input value={metaAppId} onChange={(e) => setMetaAppId(e.target.value)} mono />
        </Field>
        <Field
          label="Webhook Verify Token"
          hint="Must match the token entered in Meta for the handshake."
        >
          <Input
            value={verifyToken}
            onChange={(e) => setVerifyToken(e.target.value)}
            type="password"
            autoComplete="off"
            mono
            placeholder={initial?.configured ? "•••••••• (unchanged)" : "Set a random secret"}
          />
        </Field>
        <Field
          label="Default Template Name"
          hint="Fallback template for notification sends."
          className="sm:col-span-2"
        >
          <Input value={defaultTemplate} onChange={(e) => setDefaultTemplate(e.target.value)} placeholder="e.g. order_update" />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-[13px] font-medium text-ink">
        <input
          type="checkbox"
          checked={dryRun}
          onChange={(e) => setDryRun(e.target.checked)}
          className="h-4 w-4 rounded border-line accent-brand"
        />
        Dry-run mode (log messages, do not call Meta)
      </label>

      <div className="flex items-center gap-2 border-t border-line pt-4">
        <Button variant="primary" onClick={handleSave} loading={pending}>
          Save settings
        </Button>
        {dryRun && (
          <span className="text-[11px] text-ink-4">You can enable live sends once dry-run tests pass.</span>
        )}
      </div>
    </Panel>
  );
}
