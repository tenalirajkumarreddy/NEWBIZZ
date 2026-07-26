import Link from "next/link";
import { listAlternateGroups } from "@/lib/data/bom";
import { Panel } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { count as fmtCount } from "@/lib/format";

export const metadata = { title: "Alternate Groups — NEWBIZZ" };

export default async function AltGroupsListPage() {
  const groups = await listAlternateGroups();

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-4 px-6 py-6 lg:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-ink">Alternate Groups</h1>
          <p className="mt-0.5 text-[13px] text-ink-3">
            {fmtCount(groups.length)} groups — items that can substitute each other in a BOM
          </p>
        </div>
        <Link href="/bom/alternate-groups/new">
          <Button size="sm">New Group</Button>
        </Link>
      </div>

      <Panel flush>
        {groups.length === 0 ? (
          <EmptyState
            title="No alternate groups yet"
            description="Alternate groups define items that can substitute for each other in a BOM."
            action={
              <Link href="/bom/alternate-groups/new">
                <Button variant="secondary" size="sm">New Group</Button>
              </Link>
            }
          />
        ) : (
          <div className="divide-y divide-line">
            {groups.map((g) => (
              <Link
                key={g.id}
                href={`/bom/alternate-groups/${g.id}`}
                className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-fill"
              >
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-ink">{g.name}</p>
                  {g.notes && (
                    <p className="mt-0.5 truncate text-[12px] text-ink-4">{g.notes}</p>
                  )}
                </div>
                <div className="shrink-0 text-[12px] text-ink-3">
                  {fmtCount(g.members.length)} member{g.members.length !== 1 ? "s" : ""}
                </div>
              </Link>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
