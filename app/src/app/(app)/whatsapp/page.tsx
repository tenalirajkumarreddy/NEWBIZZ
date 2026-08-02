import { listConversations } from "@/lib/data/whatsapp";
import { getWhatsappConfig } from "@/lib/data/whatsapp";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui";
import { WhatsAppInbox } from "./WhatsAppInbox";

export const dynamic = "force-dynamic";

export default async function WhatsappPage() {
  const [conversations, config] = await Promise.all([listConversations(), getWhatsappConfig()]);

  const unreadTotal = conversations.reduce((s, c) => s + c.unread_count, 0);

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-6 py-6 lg:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-ink">WhatsApp Inbox</h1>
          <p className="mt-0.5 flex items-center gap-2 text-[13px] text-ink-3">
            {config ? (config.dryRun ? "Dry-run mode" : "Live") : "Not configured"}
            {unreadTotal > 0 && <Badge tone="brand" size="sm">{unreadTotal} unread</Badge>}
          </p>
        </div>
      </div>

      {!config ? (
        <EmptyState
          title="WhatsApp is not configured"
          description="Add the Meta Business Cloud API connection details in settings before using the inbox."
        />
      ) : (
        <WhatsAppInbox conversations={conversations} dryRun={config.dryRun} />
      )}
    </div>
  );
}
