"use client";

import { EmptyState, Money, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { qty } from "@/lib/format";
import type { StockHoldingRow } from "@/lib/data/holdings";

// StockHoldingsTable — per-item custody detail for one user's stock holdings.

export function StockHoldingsTable({ stock }: { stock: StockHoldingRow[] }) {
  if (stock.length === 0) {
    return (
      <EmptyState
        title="No stock in custody"
        description="This user currently holds no item stock."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <THead>
          <TR>
            <TH>Item</TH>
            <TH>SKU</TH>
            <TH numeric>Qty</TH>
            <TH numeric>Avg cost</TH>
            <TH numeric>Value</TH>
          </TR>
        </THead>
        <TBody>
          {stock.map((r) => (
            <TR key={r.itemId}>
              <TD className="text-ink">{r.itemName}</TD>
              <TD className="font-mono text-ink-3">{r.itemSku}</TD>
              <TD numeric>
                {qty(r.qty)}
                {r.baseUnitCode ? <span className="ml-1 text-ink-4">{r.baseUnitCode}</span> : null}
              </TD>
              <TD numeric>
                <Money value={r.avgCost} />
              </TD>
              <TD numeric>
                <Money value={r.carryingValue} />
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
