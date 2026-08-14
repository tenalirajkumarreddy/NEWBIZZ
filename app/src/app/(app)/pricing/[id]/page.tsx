import Link from "next/link";
import { notFound } from "next/navigation";
import { getPriceList, listItems } from "@/lib/data/catalog";
import { Panel } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Money } from "@/components/ui/Money";
import { PageContainer } from "@/components/ui";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { count as fmtCount, dateIST } from "@/lib/format";
import { PriceListActions } from "./PriceListActions";

export default async function PriceListDetailPage({ params }: { params: { id: string } }) {
  const [pl, allItems] = await Promise.all([
    getPriceList(params.id),
    listItems({ status: "active" }),
  ]);
  if (!pl) notFound();

  return (
    <PageContainer width="report">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/pricing" className="text-[12px] font-medium text-ink-4 hover:text-brand">
            ← Rate Master
          </Link>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="font-mono text-[22px] font-bold tracking-tight text-ink">{pl.code}</h1>
            {pl.isDefault && <Badge tone="grn" size="sm">Default</Badge>}
            <Badge tone={pl.status === "active" ? "grn" : "slate"} size="sm">{pl.status}</Badge>
          </div>
          <p className="mt-0.5 text-[13px] text-ink-2 font-medium">{pl.name}</p>
          <p className="mt-0.5 text-[12px] text-ink-4">
            Valid {dateIST(pl.validFrom)}{pl.validTo ? ` → ${dateIST(pl.validTo)}` : " onwards"} ·{" "}
            {fmtCount(pl.items.length)} items
          </p>
        </div>
      </div>

      <Panel title="Prices" flush>
        {pl.items.length === 0 ? (
          <EmptyState
            title="No items priced yet"
            description="Add items to this list — the effective_price function picks the best slab for each order line."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>SKU</TH>
                <TH>Item</TH>
                <TH>Unit</TH>
                <TH numeric>Min qty (slab)</TH>
                <TH numeric>Unit price (ex-GST)</TH>
                <TH className="w-16" />
              </TR>
            </THead>
            <TBody>
              {pl.items.map((row) => (
                <TR key={`${row.itemId}-${row.minQty}`}>
                  <TD className="font-mono text-[12px] font-semibold text-brand">{row.sku}</TD>
                  <TD className="font-medium text-ink">{row.itemName}</TD>
                  <TD className="font-mono text-[12px]">{row.baseUnitCode ?? "—"}</TD>
                  <TD numeric className="font-mono text-[12px] tnum">
                    {row.minQty > 0 ? row.minQty : "—"}
                  </TD>
                  <TD numeric><Money value={row.unitPrice} /></TD>
                  <TD>
                    <PriceListActions
                      priceListId={pl.id}
                      itemId={row.itemId}
                      minQty={row.minQty}
                    />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Panel>

      <Panel title="Add / update price">
        <PriceListActions
          priceListId={pl.id}
          allItems={allItems}
          mode="add"
        />
      </Panel>
    </PageContainer>
  );
}
