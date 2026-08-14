import Link from "next/link";
import { listPriceLists } from "@/lib/data/catalog";
import { Panel } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageContainer, PageHeader } from "@/components/ui";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { count as fmtCount, dateIST } from "@/lib/format";

export const metadata = { title: "Rate Master — NEWBIZZ" };
export default async function PricingPage() {
  const lists = await listPriceLists();

  return (
    <PageContainer>
      <PageHeader
        title="Rate Master"
        subtitle={`${fmtCount(lists.length)} price lists — selling prices per item, per list, with slab support`}
        actions={
          <Link href="/pricing/new">
            <Button variant="primary" size="sm">New price list</Button>
          </Link>
        }
      />

      <Panel flush>
        {lists.length === 0 ? (
          <EmptyState
            title="No price lists yet"
            description="Create a price list and assign items to it. Stores inherit the default list unless overridden."
            action={
              <Link href="/pricing/new">
                <Button variant="secondary" size="sm">Create a price list</Button>
              </Link>
            }
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Code</TH>
                <TH>Name</TH>
                <TH>Default</TH>
                <TH>Valid from</TH>
                <TH>Valid to</TH>
                <TH numeric>Items</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {lists.map((pl) => (
                <TR key={pl.id} interactive>
                  <TD className="p-0">
                    <Link
                      href={`/pricing/${pl.id}`}
                      className="block px-3 py-2.5 font-mono text-[12px] font-semibold text-brand"
                    >
                      {pl.code}
                    </Link>
                  </TD>
                  <TD className="font-medium text-ink">{pl.name}</TD>
                  <TD>
                    {pl.isDefault && <Badge tone="grn" size="sm">Default</Badge>}
                  </TD>
                  <TD className="font-mono text-[12px]">{dateIST(pl.validFrom)}</TD>
                  <TD className="font-mono text-[12px]">{pl.validTo ? dateIST(pl.validTo) : "—"}</TD>
                  <TD numeric>{fmtCount(pl.itemCount)}</TD>
                  <TD>
                    <Badge tone={pl.status === "active" ? "grn" : "slate"} size="sm">
                      {pl.status}
                    </Badge>
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
