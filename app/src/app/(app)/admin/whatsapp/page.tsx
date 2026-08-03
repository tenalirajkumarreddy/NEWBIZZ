import { getWhatsappConfig } from "@/lib/data/whatsapp";
import { WhatsAppSettingsForm } from "./WhatsAppSettingsForm";
import { WebhookSelfTestForm } from "./WebhookSelfTestForm";

export const metadata = { title: "WhatsApp Settings — NEWBIZZ" };
export const dynamic = "force-dynamic";

export default async function AdminWhatsappPage() {
  const config = await getWhatsappConfig();

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-4 px-6 py-6 lg:px-8">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight text-ink">WhatsApp Settings</h1>
        <p className="mt-0.5 text-[13px] text-ink-3">
          Meta Business Cloud API connection. Keep the access token private — it is encrypted
          before it is stored.
        </p>
      </div>

      <WhatsAppSettingsForm
        initial={config
          ? {
              wabaId: config.wabaId,
              phoneNumberId: config.phoneNumberId,
              metaAppId: config.metaAppId,
              defaultTemplate: config.defaultTemplate,
              dryRun: config.dryRun,
              configured: config.configured,
            }
          : null}
      />

      <div className="rounded-lg border border-line bg-surface p-4 text-[12px] leading-relaxed text-ink-3">
        <p className="font-semibold text-ink">Webhook</p>
        <p className="mt-1">
          Point your Meta app's webhook at{" "}
          <code className="rounded bg-fill px-1 font-mono text-[11px] text-ink">
            {`${process.env.NEXT_PUBLIC_APP_URL ?? "https://<your-domain>"}/api/webhooks/whatsapp`}
          </code>{" "}
          and subscribe to the{" "}
          <span className="font-mono">messages</span> webhook field. The{" "}
          <span className="font-mono">verify token</span> below must match the token you enter
          in Meta for the initial GET handshake.
        </p>
      </div>

      <WebhookSelfTestForm appUrl={process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"} />
    </div>
  );
}
