"use client";

import { Kpi, Money } from "@/components/ui";
import type { CashHoldingRow, StockHoldingRow } from "@/lib/data/holdings";

// HoldingsSummary — the two custody KPIs (cash ₹ + stock ₹) that open the
// profile's operational section.

export function HoldingsSummary({
  cash,
  stock,
}: {
  cash: CashHoldingRow[];
  stock: StockHoldingRow[];
}) {
  const cashTotal = cash.reduce((s, c) => s + c.amount, 0);
  const stockValue = stock.reduce((s, r) => s + r.carryingValue, 0);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Kpi label="Cash in custody" value={<Money value={cashTotal} />} sub="Amount held on behalf of the branch" />
      <Kpi label="Stock in custody" value={<Money value={stockValue} />} sub="Value at weighted-average cost" />
    </div>
  );
}
