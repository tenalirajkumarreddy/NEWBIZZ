import Link from "next/link";
import { listItems } from "@/lib/data/catalog";
import { Panel } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Money } from "@/components/ui/Money";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { PageContainer, PageHeader } from "@/components/ui";
import { count as fmtCount, percent } from "@/lib/format";

const TYPE_LABEL: Record<string, string> = {
  raw_material: "Raw material",
  wip: "WIP",
  finished_good: "Finished good",
  consumable: "Consumable",
  service: "Service",
};

const TYPE_TONE: Record<string, "brand" | "amb" | "grn" | "slate" | "neutral"> = {
  raw_material: "amb",
  wip: "neutral",
  finished_good: "grn",
  consumable: "slate",
  service: "slate",
};

export const metadata = { title: "Items — NEWBIZZ" };
export default async function ItemsPage() {
  const items = await listItems();
  const active = items.filter((i) => i.status === "active").length;
  const reorderAlert = items.filter(
    (i) => i.isStocked && i.reorderLevel > 0,
  ).length;

  return (
    <PageContainer width="full">
      <PageHeader
        title="Item Master"
        subtitle={`${fmtCount(items.length)} items · ${fmtCount(active)} active${reorderAlert > 0 ? ` · ${fmtCount(reorderAlert)} with reorder level set` : ""}`}
        actions={
          <Link href="/items/new">
            <Button variant="primary" size="sm">New item</Button>
          </Link>
        }
      />

      <Panel flush>
        {items.length === 0 ? (
          <EmptyState
            title="No items yet"
            description="Add finished goods, raw materials, and consumables to the catalog before creating orders or production runs."
            action={
              <Link href="/items/new">
                <Button variant="secondary" size="sm">Add an item</Button>
              </Link>
            }
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>SKU</TH>
                <TH>Name</TH>
                <TH>Type</TH>
                <TH>Category</TH>
                <TH>Unit</TH>
                <TH numeric>GST</TH>
                <TH numeric>Default price</TH>
                <TH>Flags</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((item) => (
                <TR key={item.id} interactive>
                  <TD className="p-0">
                    <Link
                      href={`/items/${item.id}`}
                      className="block px-3 py-2.5 font-mono text-[12px] font-semibold text-brand"
                    >
                      {item.sku}
                    </Link>
                  </TD>
                  <TD className="font-medium text-ink">{item.name}</TD>
                  <TD>
                    <Badge tone={TYPE_TONE[item.type] ?? "slate"} size="sm">
                      {TYPE_LABEL[item.type] ?? item.type}
                    </Badge>
                  </TD>
                  <TD>{item.categoryName ?? "—"}</TD>
                  <TD className="font-mono text-[12px]">{item.baseUnitCode ?? "—"}</TD>
                  <TD numeric className="font-mono text-[12px] tnum">
                    {percent(item.gstRate, { alreadyPct: true, decimals: 0 })}
                  </TD>
                  <TD numeric>
                    {item.defaultPrice > 0 ? <Money value={item.defaultPrice} /> : "—"}
                  </TD>
                  <TD>
                    <div className="flex flex-wrap gap-1">
                      {item.isSellable && <Badge tone="grn" size="sm">Sell</Badge>}
                      {item.isPurchasable && <Badge tone="brand" size="sm">Buy</Badge>}
                      {!item.isStocked && <Badge tone="slate" size="sm">Non-stock</Badge>}
                    </div>
                  </TD>
                  <TD>
                    <Badge tone={item.status === "active" ? "grn" : "slate"} size="sm">
                      {item.status}
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
