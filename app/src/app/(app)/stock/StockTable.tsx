"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select } from "@/components/ui/Field";
import { Money } from "@/components/ui/Money";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { count as fmtCount, qty as fmtQty } from "@/lib/format";
import type { StockRow } from "@/lib/data/stock";

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

// Register filters for Warehouse Stock (§4.8): free-text over sku/item/branch,
// a type filter, and a "below reorder only" toggle to jump straight to what
// needs replenishing. Client-side over the loaded register.
export function StockTable({ rows }: { rows: StockRow[] }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [lowOnly, setLowOnly] = useState(false);

  const types = useMemo(
    () => Array.from(new Set(rows.map((r) => r.itemType))).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (type && r.itemType !== type) return false;
      if (lowOnly && !r.belowReorder) return false;
      if (!q) return true;
      return (
        r.itemSku.toLowerCase().includes(q) ||
        r.itemName.toLowerCase().includes(q) ||
        r.branchName.toLowerCase().includes(q)
      );
    });
  }, [rows, query, type, lowOnly]);

  return (
    <>
      <div className="flex flex-col gap-2 border-b border-line px-4 py-3 sm:flex-row sm:items-center">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search SKU, item, branch…"
          className="sm:max-w-[300px]"
        />
        <Select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="sm:max-w-[180px]"
          aria-label="Filter by item type"
        >
          <option value="">All types</option>
          {types.map((t) => (
            <option key={t} value={t}>{TYPE_LABEL[t] ?? t}</option>
          ))}
        </Select>
        <label className="flex items-center gap-1.5 text-[12px] text-ink-2">
          <input
            type="checkbox"
            checked={lowOnly}
            onChange={(e) => setLowOnly(e.target.checked)}
            className="h-4 w-4 rounded border-line"
          />
          Below reorder only
        </label>
        {(query || type || lowOnly) && (
          <span className="text-[12px] text-ink-4 sm:ml-auto">
            {fmtCount(filtered.length)} of {fmtCount(rows.length)}
          </span>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No matching stock"
          description="No stocked lines match the current search and filter — clear them to see the full register."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>SKU</TH>
              <TH>Item</TH>
              <TH>Type</TH>
              <TH>Branch</TH>
              <TH numeric>Qty on hand</TH>
              <TH numeric>Avg cost</TH>
              <TH numeric>Carrying value</TH>
              <TH>Alert</TH>
            </TR>
          </THead>
          <TBody>
            {filtered.map((r) => (
              <TR key={`${r.itemId}-${r.branchId}`}>
                <TD className="font-mono text-[12px] font-semibold text-ink">{r.itemSku}</TD>
                <TD className="font-medium text-ink">{r.itemName}</TD>
                <TD>
                  <Badge tone={TYPE_TONE[r.itemType] ?? "slate"} size="sm">
                    {TYPE_LABEL[r.itemType] ?? r.itemType}
                  </Badge>
                </TD>
                <TD>{r.branchName}</TD>
                <TD numeric className="font-mono text-[12px] tnum">
                  {fmtQty(r.qtyOnHand)}{r.baseUnitCode ? ` ${r.baseUnitCode}` : ""}
                </TD>
                <TD numeric><Money value={r.avgCost} /></TD>
                <TD numeric><Money value={r.carryingValue} /></TD>
                <TD>
                  {r.belowReorder ? (
                    <Badge tone="amb" size="sm">Reorder ≤ {fmtQty(r.reorderLevel)}</Badge>
                  ) : (
                    <span className="text-ink-4">—</span>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}
