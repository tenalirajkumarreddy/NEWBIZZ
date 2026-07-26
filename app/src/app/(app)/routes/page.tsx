import Link from "next/link";
import { listRoutes, listSessions } from "@/lib/data/routes";
import { Panel } from "@/components/ui/Card";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { count as fmtCount } from "@/lib/format";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";

export const metadata = { title: "Routes & Visits — NEWBIZZ" };

export default async function RoutesListPage() {
  const [routes, sessions] = await Promise.all([
    listRoutes(),
    listSessions(),
  ]);

  const activeSessions = sessions.filter((s) => s.status === "active" || s.status === "paused");

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-6 py-6 lg:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-ink">Routes &amp; Visits</h1>
          <p className="mt-0.5 text-[13px] text-ink-3">
            {fmtCount(routes.length)} routes · {fmtCount(activeSessions.length)} active sessions
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link href="/routes/new">
            <Button variant="primary" size="sm">New Route</Button>
          </Link>
        </div>
      </div>

      {/* Active sessions */}
      {activeSessions.length > 0 && (
        <Panel title="Active Sessions" flush>
          <Table>
            <THead>
              <TR>
                <TH>Route</TH>
                <TH>Agent</TH>
                <TH>Status</TH>
                <TH>Started</TH>
                <TH numeric>Stores</TH>
                <TH numeric>Distance</TH>
                <TH className="w-[80px]" />
              </TR>
            </THead>
            <TBody>
              {activeSessions.map((s) => (
                <TR key={s.id} interactive>
                  <TD className="p-0">
                    <Link href={`/routes/sessions/${s.id}`} className="block px-3 py-2.5 font-medium text-ink hover:text-brand">
                      {s.routeName}
                    </Link>
                  </TD>
                  <TD className="text-ink">{s.agentName}</TD>
                  <TD><StatusBadge status={s.status} size="sm" /></TD>
                  <TD className="font-mono text-[12px] text-ink-3">
                    {s.startedAt ? new Date(s.startedAt).toLocaleString("en-IN") : "—"}
                  </TD>
                  <TD numeric className="font-mono tnum">{s.storesCompleted}/{s.storesPlanned}</TD>
                  <TD numeric className="font-mono tnum">{s.totalDistanceKm.toFixed(1)} km</TD>
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
        </Panel>
      )}

      {/* Routes master */}
      <Panel title="All Routes" flush>
        {routes.length === 0 ? (
          <EmptyState
            title="No routes yet"
            description="Create delivery/collection routes and assign stores to them."
            action={
              <Link href="/routes/new">
                <Button variant="secondary" size="sm">Create Route</Button>
              </Link>
            }
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Route Name</TH>
                <TH>Status</TH>
                <TH numeric>Stores</TH>
                <TH>Default</TH>
                <TH>Created</TH>
                <TH className="w-[80px]" />
              </TR>
            </THead>
            <TBody>
              {routes.map((r) => (
                <TR key={r.id} interactive>
                  <TD className="p-0">
                    <Link href={`/routes/${r.id}`} className="block px-3 py-2.5 font-semibold text-ink hover:text-brand">
                      {r.name}
                    </Link>
                  </TD>
                  <TD><StatusBadge status={r.status} size="sm" /></TD>
                  <TD numeric className="font-mono tnum">{r.storeCount}</TD>
                  <TD>{r.isDefault ? <Badge tone="grn" size="sm">Default</Badge> : "—"}</TD>
                  <TD className="font-mono text-[12px] text-ink-3">
                    {new Date(r.createdAt).toLocaleDateString("en-IN")}
                  </TD>
                  <TD className="p-0">
                    <Link
                      href={`/routes/${r.id}`}
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
    </div>
  );
}
