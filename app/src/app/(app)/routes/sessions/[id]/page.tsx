import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession, listVisits } from "@/lib/data/routes";
import { Panel, Card } from "@/components/ui/Card";
import { StatusBadge, Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { PageContainer } from "@/components/ui";

export const metadata = { title: "Session Detail — NEWBIZZ" };

export default async function SessionDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const [session, visits] = await Promise.all([
    getSession(id),
    listVisits(id),
  ]);
  if (!session) notFound();

  return (
    <PageContainer width="form">
      <Link href={`/routes/${session.routeId}`} className="text-[12px] font-medium text-ink-4 hover:text-brand">
        ← {session.routeName}
      </Link>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        <Card className="p-3.5">
          <div className="eyebrow text-ink-4">Agent</div>
          <div className="mt-1 text-[14px] font-semibold text-ink">{session.agentName}</div>
        </Card>
        <Card className="p-3.5">
          <div className="eyebrow text-ink-4">Status</div>
          <div className="mt-1"><StatusBadge status={session.status} /></div>
        </Card>
        <Card className="p-3.5">
          <div className="eyebrow text-ink-4">Started</div>
          <div className="mt-1 font-mono text-[14px] font-semibold text-ink">
            {session.startedAt ? new Date(session.startedAt).toLocaleString("en-IN") : "—"}
          </div>
        </Card>
        <Card className="p-3.5">
          <div className="eyebrow text-ink-4">Duration</div>
          <div className="mt-1 font-mono text-[14px] font-semibold text-ink">{session.totalDurationMin} min</div>
        </Card>
        <Card className="p-3.5">
          <div className="eyebrow text-ink-4">Distance</div>
          <div className="mt-1 font-mono text-[14px] font-semibold text-ink">{session.totalDistanceKm.toFixed(1)} km</div>
        </Card>
        <Card className="p-3.5">
          <div className="eyebrow text-ink-4">Stores</div>
          <div className="mt-1 font-mono text-[14px] font-semibold text-ink">{session.storesCompleted}/{session.storesPlanned}</div>
        </Card>
      </div>

      {/* Visits */}
      <Panel title="Visits" flush>
        {visits.length === 0 ? (
          <EmptyState title="No visits recorded" description="Visits will appear as the agent checks in at stores." />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Store</TH>
                <TH>Type</TH>
                <TH>Visited At</TH>
                <TH numeric>Duration</TH>
                <TH>Notes</TH>
              </TR>
            </THead>
            <TBody>
              {visits.map((v) => (
                <TR key={v.id}>
                  <TD className="font-medium text-ink">{v.storeName}</TD>
                  <TD>
                    <Badge size="sm">{v.visitType.replace(/_/g, " ")}</Badge>
                  </TD>
                  <TD className="font-mono text-[12px] text-ink-3">
                    {new Date(v.visitedAt).toLocaleString("en-IN")}
                  </TD>
                  <TD numeric className="font-mono tnum">{v.durationMin} min</TD>
                  <TD className="max-w-[200px] truncate text-[13px] text-ink-3">
                    {v.noBusinessNote ?? "—"}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Panel>
    </PageContainer>
  );
}
