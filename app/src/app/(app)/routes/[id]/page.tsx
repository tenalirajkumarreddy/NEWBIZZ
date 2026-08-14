import Link from "next/link";
import { notFound } from "next/navigation";
import { getRoute, listSessions, listRouteStores, listStoresForRoute, listFieldUsers } from "@/lib/data/routes";
import { Panel } from "@/components/ui/Card";
import { StatusBadge, Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { PageContainer, PageHeader } from "@/components/ui";
import { RouteActions } from "./RouteActions";

export const metadata = { title: "Route Detail — NEWBIZZ" };

export default async function RouteDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const [route, sessions, stores, storeOptions, users] = await Promise.all([
    getRoute(id),
    listSessions(id),
    listRouteStores(id),
    listStoresForRoute(),
    listFieldUsers(),
  ]);
  if (!route) notFound();

  return (
    <PageContainer width="full">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <span>{route.name}</span>
            {route.isDefault && <Badge tone="grn" size="sm">Default</Badge>}
          </span>
        }
        subtitle={
          <>
            {stores.length} assigned stores · {sessions.length} sessions
          </>
        }
        actions={<RouteActions routeId={route.id} users={users} />}
        backHref="/routes"
        backLabel="Routes"
      />

      {/* Sessions */}
      <Panel title="Sessions" flush>
        {sessions.length === 0 ? (
          <EmptyState title="No sessions" description="Start a route session to begin tracking visits." />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Agent</TH>
                <TH>Status</TH>
                <TH>Started</TH>
                <TH>Ended</TH>
                <TH numeric>Stores</TH>
                <TH numeric>Distance</TH>
                <TH numeric>Duration</TH>
                <TH className="w-[80px]" />
              </TR>
            </THead>
            <TBody>
              {sessions.map((s) => (
                <TR key={s.id} interactive>
                  <TD className="p-0">
                    <Link href={`/routes/sessions/${s.id}`} className="block px-3 py-2.5 font-medium text-ink hover:text-brand">
                      {s.agentName}
                    </Link>
                  </TD>
                  <TD><StatusBadge status={s.status} size="sm" /></TD>
                  <TD className="font-mono text-[12px] text-ink-3">
                    {s.startedAt ? new Date(s.startedAt).toLocaleString("en-IN") : "—"}
                  </TD>
                  <TD className="font-mono text-[12px] text-ink-3">
                    {s.endedAt ? new Date(s.endedAt).toLocaleString("en-IN") : "—"}
                  </TD>
                  <TD numeric className="font-mono tnum">{s.storesCompleted}/{s.storesPlanned}</TD>
                  <TD numeric className="font-mono tnum">{s.totalDistanceKm.toFixed(1)} km</TD>
                  <TD numeric className="font-mono tnum">{s.totalDurationMin} min</TD>
                  <TD className="p-0">
                    <Link
                      href={`/routes/sessions/${s.id}`}
                      className="block px-3 py-2.5 text-center text-[12px] font-medium text-ink-4 hover:text-brand"
                    >
                      View
                    </Link>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Panel>

      {/* Assigned stores */}
      <Panel title="Assigned Stores" flush>
        {stores.length === 0 ? (
          <EmptyState title="No stores assigned" description="Assign stores to this route to plan visits." />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Store</TH>
                <TH>Code</TH>
                <TH>Customer</TH>
                <TH>Assigned</TH>
              </TR>
            </THead>
            <TBody>
              {stores.map((s) => (
                <TR key={s.id}>
                  <TD className="font-medium text-ink">{s.storeName}</TD>
                  <TD className="font-mono text-[12px] text-ink-3">{s.storeCode ?? "—"}</TD>
                  <TD className="text-ink">{s.customerName}</TD>
                  <TD className="font-mono text-[12px] text-ink-3">
                    {new Date(s.assignedAt).toLocaleDateString("en-IN")}
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
