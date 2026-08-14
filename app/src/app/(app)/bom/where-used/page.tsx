import Link from "next/link";
import { whereUsed } from "@/lib/data/bom";
import { getItem } from "@/lib/data/catalog";
import { Panel } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { PageContainer, PageHeader } from "@/components/ui";
import { count as fmtCount } from "@/lib/format";
import { WhereUsedSearch } from "./WhereUsedSearch";

export const metadata = { title: "Where Used — NEWBIZZ" };

export default async function WhereUsedPage(props: {
  searchParams: Promise<{ itemId?: string }>;
}) {
  const { itemId } = await props.searchParams;
  const item = itemId ? await getItem(itemId) : null;
  const usage = itemId ? await whereUsed(itemId) : null;

  return (
    <PageContainer width="report">
      <PageHeader
        backHref="/bom"
        backLabel="BOM / Recipes"
        title="Where Used"
        subtitle="Find all BOMs that reference a specific item or alternate group"
      />

      <WhereUsedSearch initialItemId={itemId ?? ""} />

      {item && usage && (
        <Panel title={`"${item.sku} — ${item.name}" is used in ${fmtCount(usage.length)} BOMs`} flush>
          {usage.length === 0 ? (
            <EmptyState
              title="Not used in any BOM"
              description="This item is not referenced as a component in any recipe."
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Parent Item</TH>
                  <TH>Stage</TH>
                  <TH numeric>Qty per</TH>
                  <TH>Effective</TH>
                  <TH>Status</TH>
                  <TH className="w-[100px]" />
                </TR>
              </THead>
              <TBody>
                {usage.map((u) => (
                  <TR key={u.bomId}>
                    <TD>
                      <Link href={`/bom/${u.bomId}`} className="font-medium text-brand hover:underline">
                        <span className="font-mono text-[12px]">{u.parentSku}</span>{" "}
                        <span className="text-ink">{u.parentName}</span>
                      </Link>
                    </TD>
                    <TD><Badge tone="slate" size="sm">Stage {u.stage}</Badge></TD>
                    <TD numeric className="font-mono tnum">{u.quantityPer}</TD>
                    <TD className="text-[12px] text-ink-3">{u.effectiveFrom}</TD>
                    <TD><span className="text-[12px] tnum">{u.status}</span></TD>
                    <TD>
                      <Link href={`/bom/${u.bomId}`}>
                        <Button variant="ghost" size="sm">View</Button>
                      </Link>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Panel>
      )}
    </PageContainer>
  );
}
