import Link from "next/link";
import { listStock } from "@/lib/data/stock";
import { Panel } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { count as fmtCount, rupeesCompact } from "@/lib/format";
import { StockTable } from "./StockTable";

export default async function StockPage() {
  const rows = await listStock();
  const carryingTotal = rows.reduce((s, r) => s + r.carryingValue, 0);
  const alertCount = rows.filter((r) => r.belowReorder).length;

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-6 py-6 lg:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-ink">Warehouse Stock</h1>
          <p className="mt-0.5 text-[13px] text-ink-3">
            {fmtCount(rows.length)} stocked lines · {rupeesCompact(carryingTotal)} carrying value
            {alertCount > 0 ? ` · ${fmtCount(alertCount)} at or below reorder level` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {alertCount > 0 && (
            <Badge tone="amb" size="sm">{fmtCount(alertCount)} reorder alerts</Badge>
          )}
          <Link href="/stock/opening">
            <Button variant="secondary" size="sm">Load opening stock</Button>
          </Link>
        </div>
      </div>

      <Panel flush>
        {rows.length === 0 ? (
          <EmptyState
            title="No stock on hand"
            description="Stock arrives only through posted movements — goods receipts, production runs, or opening stock. This register never edits quantities directly."
            action={
              <Link href="/stock/opening">
                <Button variant="secondary" size="sm">Load opening stock</Button>
              </Link>
            }
          />
        ) : (
          <StockTable rows={rows} />
        )}
      </Panel>

      <p className="text-[12px] text-ink-4">
        Quantities and weighted-average costs are maintained by posted stock moves only. To change
        stock, record a goods receipt, production run, delivery, or adjustment — never edit here.
      </p>
    </div>
  );
}
