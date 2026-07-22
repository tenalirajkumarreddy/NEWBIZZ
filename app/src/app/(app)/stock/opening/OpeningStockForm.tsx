"use client";

// =====================================================================
// OpeningStockForm — multi-line opening stock entry (master plan §3.4).
// One warehouse + as-of date per batch; N item lines (qty + WA unit cost).
// Submits ONE atomic RPC call — receive_opening_stock_batch — so either
// every line posts (Dr Inventory / Cr 3900 Opening Balance Equity) or
// nothing does.
// =====================================================================

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Panel } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Select, Input } from "@/components/ui/Field";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { money, qty as fmtQty } from "@/lib/format";
import { receiveOpeningStock } from "@/lib/actions/stock";
import type { BranchOption, StockableItemOption } from "@/lib/data/stock";

interface Line {
  key: number;
  itemId: string;
  qty: string;
  unitCost: string;
}

function todayIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export function OpeningStockForm({
  branches,
  items,
}: {
  branches: BranchOption[];
  items: StockableItemOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [asOf, setAsOf] = useState(todayIST());
  const [lines, setLines] = useState<Line[]>([{ key: 1, itemId: "", qty: "", unitCost: "" }]);
  const [nextKey, setNextKey] = useState(2);

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  function setLine(key: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function pickItem(key: number, itemId: string) {
    const item = itemById.get(itemId);
    setLines((ls) =>
      ls.map((l) =>
        l.key === key
          ? {
              ...l,
              itemId,
              // Prefill cost with default_price as a starting hint only for
              // finished goods; raw materials should be entered at actual cost.
              unitCost:
                l.unitCost === "" && item && item.type === "finished_good" && item.defaultPrice > 0
                  ? String(item.defaultPrice)
                  : l.unitCost,
            }
          : l,
      ),
    );
  }

  function addLine() {
    setLines((ls) => [...ls, { key: nextKey, itemId: "", qty: "", unitCost: "" }]);
    setNextKey((k) => k + 1);
  }

  function removeLine(key: number) {
    setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : ls));
  }

  const filled = lines.filter((l) => l.itemId && Number(l.qty) > 0);
  const dupes = useMemo(() => {
    const seen = new Set<string>();
    const d = new Set<string>();
    for (const l of filled) {
      if (seen.has(l.itemId)) d.add(l.itemId);
      seen.add(l.itemId);
    }
    return d;
  }, [filled]);

  const totalValue = filled.reduce(
    (s, l) => s + Number(l.qty) * (Number(l.unitCost) || 0),
    0,
  );
  const canSubmit = !!branchId && !!asOf && filled.length > 0 && dupes.size === 0 && !pending;

  function submit() {
    if (!canSubmit) return;
    startTransition(async () => {
      const res = await receiveOpeningStock(
        filled.map((l) => ({
          item_id: l.itemId,
          branch_id: branchId,
          qty: Number(l.qty),
          unit_cost: Number(l.unitCost) || 0,
        })),
        asOf,
      );
      if (res.ok) {
        toast.success(
          "Opening stock posted",
          `${res.posted} line${res.posted === 1 ? "" : "s"} loaded — value ${money(totalValue)}.`,
        );
        router.push("/stock");
        router.refresh();
      } else {
        toast.error("Nothing was posted", res.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Panel title="Batch header">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Warehouse / branch" required htmlFor="branch">
            <Select id="branch" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.code} — {b.name}</option>
              ))}
            </Select>
          </Field>
          <Field
            label="As-of date"
            required
            htmlFor="asof"
            hint="The cut-over date the counted quantities are true for"
          >
            <Input
              id="asof"
              type="date"
              value={asOf}
              max={todayIST()}
              onChange={(e) => setAsOf(e.target.value)}
            />
          </Field>
        </div>
      </Panel>

      <Panel title="Stock lines" flush>
        <Table>
          <THead>
            <TR>
              <TH>Item</TH>
              <TH className="w-[130px] text-right">Quantity</TH>
              <TH className="w-[150px] text-right">Unit cost (₹, WA)</TH>
              <TH className="w-[130px] text-right">Line value</TH>
              <TH className="w-[60px]" aria-label="Remove" />
            </TR>
          </THead>
          <TBody>
            {lines.map((l) => {
              const item = l.itemId ? itemById.get(l.itemId) : undefined;
              const value = Number(l.qty) * (Number(l.unitCost) || 0);
              const isDupe = !!l.itemId && dupes.has(l.itemId);
              return (
                <TR key={l.key}>
                  <TD>
                    <Select
                      value={l.itemId}
                      onChange={(e) => pickItem(l.key, e.target.value)}
                      aria-label="Item"
                    >
                      <option value="">Select item…</option>
                      {items.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.sku} — {i.name}
                        </option>
                      ))}
                    </Select>
                    {isDupe && (
                      <p className="mt-1 text-[12px] text-red-600">
                        This item is already on another line — merge them.
                      </p>
                    )}
                  </TD>
                  <TD className="text-right">
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      inputMode="decimal"
                      value={l.qty}
                      onChange={(e) => setLine(l.key, { qty: e.target.value })}
                      placeholder="0"
                      aria-label="Quantity"
                    />
                    {item?.baseUnitCode && (
                      <p className="mt-1 text-[11px] text-ink-3">{item.baseUnitCode}</p>
                    )}
                  </TD>
                  <TD className="text-right">
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      inputMode="decimal"
                      value={l.unitCost}
                      onChange={(e) => setLine(l.key, { unitCost: e.target.value })}
                      placeholder="0.00"
                      aria-label="Unit cost"
                    />
                  </TD>
                  <TD className="text-right tabular-nums text-[13px]">
                    {value > 0 ? money(value) : "—"}
                  </TD>
                  <TD className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeLine(l.key)}
                      disabled={lines.length === 1}
                      aria-label="Remove line"
                    >
                      ✕
                    </Button>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
        <div className="flex items-center justify-between border-t border-line px-4 py-3">
          <Button variant="secondary" size="sm" onClick={addLine}>
            + Add line
          </Button>
          <div className="text-[13px] text-ink-2">
            {filled.length > 0 && (
              <>
                {fmtQty(filled.length)} line{filled.length === 1 ? "" : "s"} ·{" "}
                <span className="font-semibold text-ink">total {money(totalValue)}</span>
              </>
            )}
          </div>
        </div>
      </Panel>

      <div className="flex items-center justify-end gap-3">
        <Button variant="secondary" onClick={() => router.push("/stock")} disabled={pending}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={!canSubmit} loading={pending}>
          Post opening stock
        </Button>
      </div>
    </div>
  );
}
