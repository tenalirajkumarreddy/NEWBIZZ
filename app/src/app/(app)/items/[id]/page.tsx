import Link from "next/link";
import { notFound } from "next/navigation";
import { getItem } from "@/lib/data/catalog";
import { Panel, Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Money } from "@/components/ui/Money";
import { dateIST, percent } from "@/lib/format";

const TYPE_LABEL: Record<string, string> = {
  raw_material: "Raw material",
  wip: "WIP",
  finished_good: "Finished good",
  consumable: "Consumable",
  service: "Service",
};

export default async function ItemDetailPage({ params }: { params: { id: string } }) {
  const item = await getItem(params.id);
  if (!item) notFound();

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-4 px-6 py-6 lg:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/items" className="text-[12px] font-medium text-ink-4 hover:text-brand">
            ← Item Master
          </Link>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="font-mono text-[22px] font-bold tracking-tight text-ink">{item.sku}</h1>
            <Badge tone={item.status === "active" ? "grn" : "slate"} size="sm">{item.status}</Badge>
          </div>
          <p className="mt-0.5 text-[15px] font-medium text-ink-2">{item.name}</p>
        </div>
        <Link
          href={`/items/${item.id}/edit`}
          className="shrink-0 rounded-md border border-line bg-surface px-3 py-1.5 text-[12px] font-medium text-ink-2 hover:bg-surface-2"
        >
          Edit
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Fact label="Type" value={TYPE_LABEL[item.type] ?? item.type} />
        <Fact label="Category" value={item.categoryName ?? "—"} />
        <Fact label="Base unit" value={item.baseUnitCode ?? "—"} mono />
        <Fact label="HSN code" value={item.hsnCode ?? "—"} mono />
      </div>

      <Panel title="Pricing & tax">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Fact label="Default price" value={<Money value={item.defaultPrice} />} mono />
          <Fact label="GST rate" value={percent(item.gstRate, { alreadyPct: true, decimals: 0 })} mono />
          <Fact label="Cess rate" value={percent(item.cessRate, { alreadyPct: true, decimals: 0 })} mono />
          <Fact label="Pack size" value={`${item.packSize}${item.packUnitCode ? ` ${item.packUnitCode}` : ""}`} mono />
        </div>
      </Panel>

      <Panel title="Flags & stock">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Fact label="Sellable" value={item.isSellable ? "Yes" : "No"} />
          <Fact label="Purchasable" value={item.isPurchasable ? "Yes" : "No"} />
          <Fact label="Stocked" value={item.isStocked ? "Yes" : "No"} />
          <Fact label="Reorder level" value={item.reorderLevel > 0 ? String(item.reorderLevel) : "—"} mono />
        </div>
      </Panel>

      <Card className="p-3.5">
        <div className="eyebrow text-ink-4">Added</div>
        <div className="mt-1 text-[13px] text-ink-2">{dateIST(item.createdAt)}</div>
      </Card>
    </div>
  );
}

function Fact({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <Card className="p-3.5">
      <div className="eyebrow text-ink-4">{label}</div>
      <div className={"mt-1 text-[14px] font-semibold text-ink " + (mono ? "font-mono tnum" : "")}>
        {value}
      </div>
    </Card>
  );
}
