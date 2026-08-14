import { Kpi, Badge, Table, THead, TBody, TR, TH, TD, Panel, EmptyState, PageContainer, PageHeader } from "@/components/ui";
import { getWorkerStats, listRecentWhatsappNotifications } from "@/lib/data/whatsapp-worker";
import { getWhatsappConfig } from "@/lib/data/whatsapp";
import { dateTimeIST } from "@/lib/format";

export const metadata = { title: "WhatsApp Worker — NEWBIZZ" };
export const dynamic = "force-dynamic";

export default async function AdminWhatsappWorkerPage() {
  const [stats, recent, config] = await Promise.all([
    getWorkerStats(),
    listRecentWhatsappNotifications(15),
    getWhatsappConfig(),
  ]);

  return (
    <PageContainer width="form">
      <PageHeader
        title="WhatsApp Worker"
        subtitle={
          <>
            Dispatch pipeline health. The cron job at{" "}
            <code className="rounded bg-fill px-1 font-mono text-[11px]">/api/cron/whatsapp</code>{" "}
            drains queued whatsapp notifications to the Meta API.
            {config?.dryRun && <span className="ml-2 text-amb">dry-run — sends are logged, not delivered</span>}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Pending" value={stats.pending} sub="queued, not yet sent" tone={stats.pending > 0 ? "amb" : "grn"} />
        <Kpi label="Sent" value={stats.sent} sub="delivered via WhatsApp" tone="grn" />
        <Kpi label="Open threads" value={stats.openConversations} sub="inbox conversations" />
        <Kpi label="Approved templates" value={stats.templates} sub="available to agents" />
      </div>

      <Panel
        title="Recent whatsapp notifications"
        subtitle="Newest first — how the worker sees the queue."
        flush
      >
        {recent.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="No whatsapp notifications yet"
              description="Post an invoice, confirm an order, or use the test-notification button on the settings page to enqueue one."
            />
          </div>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Title</TH>
                <TH>Category</TH>
                <TH>State</TH>
                <TH>Created</TH>
              </TR>
            </THead>
            <TBody>
              {recent.map((n) => (
                <TR key={n.id}>
                  <TD className="font-medium text-ink">{n.title}</TD>
                  <TD>
                    <Badge tone="neutral" size="sm">{n.category ?? "—"}</Badge>
                  </TD>
                  <TD>
                    {n.sent_external ? (
                      <Badge tone="grn" dot>sent {n.sent_at ? dateTimeIST(n.sent_at).split(",")[1]?.trim() ?? "" : ""}</Badge>
                    ) : (
                      <Badge tone="amb" dot>pending</Badge>
                    )}
                  </TD>
                  <TD className="text-ink-3">{dateTimeIST(n.created_at)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Panel>
    </PageContainer>
  );
}
