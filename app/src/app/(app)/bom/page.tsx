import Link from "next/link";
import { listBoms } from "@/lib/data/bom";
import { Panel } from "@/components/ui/Card";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { count as fmtCount } from "@/lib/format";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { titleCase } from "@/lib/format";

export const metadata = { title: "BOM / Recipes — NEWBIZZ" };

export default async function BomListPage() {
  const boms = await listBoms();

  const active = boms.filter((b) => {
    const now = new Date();
    const from = new Date(b.effectiveFrom);
    const to = b.effectiveTo ? new Date(b.effectiveTo) : null;
    return b.status === "active" && from <= now && (!to || to > now);
  });
  const expired = boms.filter((b) => {
    const now = new Date();
    const to = b.effectiveTo ? new Date(b.effectiveTo) : null;
    return to && to <= now;
  });
  const future = boms.filter((b) => new Date(b.effectiveFrom) > new Date());

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-6 py-6 lg:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-ink">BOM / Recipes</h1>
          <p className="mt-0.5 text-[13px] text-ink-3">
            {fmtCount(boms.length)} recipes · {fmtCount(active.length)} active ·{" "}
            {fmtCount(future.length)} future · {fmtCount(expired.length)} expired
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/bom/alternate-groups">
            <Button variant="secondary" size="sm">Alt Groups</Button>
          </Link>
          <Link href="/bom/new">
            <Button size="sm">New BOM</Button>
          </Link>
        </div>
      </div>

      <Panel title="BOM list" flush>
        {boms.length === 0 ? (
          <EmptyState
            title="No recipes yet"
            description="Create a Bill of Materials for your manufactured items — define what goes into each product."
            action={
              <Link href="/bom/new">
                <Button size="sm">New BOM</Button>
              </Link>
            }
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Parent Item</TH>
                <TH>Stage</TH>
                <TH>Effective</TH>
                <TH numeric>Lines</TH>
                <TH>Status</TH>
                <TH className="w-[100px]" />
              </TR>
            </THead>
            <TBody>
              {boms.map((b) => (
                <TR key={b.id}>
                  <TD>
                    <Link href={`/bom/${b.id}`} className="font-medium text-brand hover:underline">
                      <span className="font-mono text-[12px] font-semibold text-ink">{b.parentSku}</span>{" "}
                      <span className="text-ink">{b.parentName}</span>
                    </Link>
                  </TD>
                  <TD>
                    <Badge tone="slate" size="sm">Stage {b.stage}</Badge>
                  </TD>
                  <TD className="text-[12px] text-ink-3">
                    {b.effectiveFrom}
                    {b.effectiveTo ? ` → ${b.effectiveTo}` : " → ∞"}
                  </TD>
                  <TD numeric className="text-[12px] tabular-nums text-ink-2">{b.lineCount}</TD>
                  <TD><StatusBadge status={b.status} size="sm" /></TD>
                  <TD>
                    <Link href={`/bom/${b.id}`}>
                      <Button variant="ghost" size="sm">View</Button>
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
