"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Panel, Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Select, Input } from "@/components/ui/Field";
import { Money } from "@/components/ui/Money";
import { useToast } from "@/components/ui/Toast";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { recordSale } from "@/lib/actions/sales";
import type { StoreOption, ItemOption } from "@/lib/data/sales";

// One editable sale line. Price defaults from the item's list price but stays
// editable; the server re-resolves the effective price when a row omits one, so
// this is a convenience, not the source of truth.
interface DraftLine {
  key: number;
  itemId: string;
  qty: string;
  price: string;
}

// The Sales Desk records a sale for a store: it posts a tax invoice directly
// (post_invoice) — revenue, GST and AR journalled and stock issued at WAC in one
// transaction. GST here is only a live preview; the RPC computes the booked tax.
export function RecordSaleForm({
  stores,
  items,
  homeState,
  onDone,
  onCancel,
}: {
  stores: StoreOption[];
  items: ItemOption[];
  homeState: string | null;
  // When rendered inside a Drawer, the host passes these to keep the user on the
  // list page: onDone fires after a successful post (host closes + refreshes),
  // onCancel replaces the "back to /sales" navigation. On the standalone /new
  // page both are undefined and the form falls back to router navigation.
  onDone?: (invoiceId: string) => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [storeId, setStoreId] = useState("");
  const [isOfficial, setIsOfficial] = useState(true);
  const [seq, setSeq] = useState(1);
  const [lines, setLines] = useState<DraftLine[]>([{ key: 0, itemId: "", qty: "", price: "" }]);

  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const store = useMemo(() => stores.find((s) => s.id === storeId) ?? null, [stores, storeId]);

  // Same state as us → CGST+SGST; different state → IGST (§1.9). Until a store
  // is chosen we can't know, so the preview holds tax at zero.
  const interstate = !!store && !!homeState && store.stateCode !== homeState;

  function addLine() {
    setLines((xs) => [...xs, { key: seq, itemId: "", qty: "", price: "" }]);
    setSeq((n) => n + 1);
  }

  function removeLine(key: number) {
    setLines((xs) => (xs.length === 1 ? xs : xs.filter((l) => l.key !== key)));
  }

  function patchLine(key: number, patch: Partial<DraftLine>) {
    setLines((xs) => xs.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  const selectedItemIds = useMemo(() => new Set(lines.map((l) => l.itemId).filter(Boolean)), [lines]);

  // When an item is picked, prefill the price with its default list price.
  function onItemChange(key: number, itemId: string) {
    const it = itemId ? itemsById.get(itemId) : undefined;
    patchLine(key, { itemId, price: it ? String(it.defaultPrice) : "" });
  }

  // Live money preview: taxable + GST per the picked store's place of supply.
  const totals = useMemo(() => {
    let taxable = 0;
    let tax = 0;
    for (const l of lines) {
      const q = Number(l.qty);
      const p = Number(l.price);
      if (!l.itemId || !(q > 0)) continue;
      const net = q * (Number.isFinite(p) ? p : 0);
      const rate = isOfficial ? (itemsById.get(l.itemId)?.gstRate ?? 0) : 0;
      taxable += net;
      tax += (net * rate) / 100;
    }
    // Official: taxes summed, grand total to whole rupee.
    // Unofficial: no tax — grand = taxable.
    const grandRaw = isOfficial ? taxable + tax : taxable;
    const grand = Math.round(grandRaw);
    return { taxable, tax, roundOff: isOfficial ? grand - grandRaw : 0, grand };
  }, [lines, itemsById, isOfficial]);

  const validLines = lines.filter((l) => l.itemId && Number(l.qty) > 0);
  const canSubmit = !!storeId && validLines.length > 0 && !pending;

  function submit() {
    if (!canSubmit) return;
    startTransition(async () => {
      const res = await recordSale({
        store_id: storeId,
        is_official: isOfficial,
        lines: validLines.map((l) => ({
          item_id: l.itemId,
          qty: Number(l.qty),
          ...(l.price !== "" && Number.isFinite(Number(l.price))
            ? { unit_price: Number(l.price) }
            : {}),
        })),
      });
      if (res.ok) {
        toast.success("Sale recorded", "Invoice raised — revenue, GST and stock posted.");
        if (onDone) {
          onDone(res.invoiceId);
        } else {
          router.push(`/invoices/${res.invoiceId}`);
          router.refresh();
        }
      } else {
        toast.error("Could not record sale", res.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Panel title="Bill to">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Store" required htmlFor="store">
            <Select id="store" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
              <option value="">Select a store…</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.customerName ? ` — ${s.customerName}` : ""} ({s.code})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Place of supply" htmlFor="pos">
            <div
              id="pos"
              className="flex h-9 items-center gap-2 text-[13px] text-ink-2"
            >
              {store ? (
                <>
                  <span className="font-mono text-ink">State {store.stateCode}</span>
                  <span className="text-ink-4">·</span>
                  <span className={interstate ? "text-amb" : "text-grn"}>
                    {interstate ? "Inter-state — IGST" : "Intra-state — CGST + SGST"}
                  </span>
                </>
              ) : (
                <span className="text-ink-4">Pick a store to resolve GST</span>
              )}
            </div>
          </Field>
          <Field label="Document type">
            <label className="flex cursor-pointer items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={isOfficial}
                onClick={() => setIsOfficial((x) => !x)}
                className={
                  "relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none " +
                  (isOfficial ? "bg-brand" : "bg-ink-2")
                }
              >
                <span
                  className={
                    "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform " +
                    (isOfficial ? "translate-x-4" : "translate-x-0")
                  }
                />
              </button>
              <span className="text-[13px] text-ink">
                {isOfficial ? "Tax invoice (GST)" : "Cash memo (no tax)"}
              </span>
            </label>
          </Field>
        </div>
      </Panel>

      <Panel
        title="Lines"
        actions={
          <Button variant="secondary" size="sm" onClick={addLine}>
            Add line
          </Button>
        }
        flush
      >
        <Table>
          <THead>
            <TR>
              <TH>Item</TH>
              <TH numeric className="w-28">Qty</TH>
              <TH numeric className="w-36">Unit Price</TH>
              <TH numeric className="w-20">GST</TH>
              <TH numeric className="w-32">Line Net</TH>
              <TH className="w-10" />
            </TR>
          </THead>
          <TBody>
            {lines.map((l) => {
              const q = Number(l.qty);
              const p = Number(l.price);
              const it = l.itemId ? itemsById.get(l.itemId) : undefined;
              const lineNet = l.itemId && q > 0 ? q * (Number.isFinite(p) ? p : 0) : 0;
              return (
                <TR key={l.key}>
                  <TD>
                    <Select
                      value={l.itemId}
                      onChange={(e) => onItemChange(l.key, e.target.value)}
                    >
                      <option value="">Select item…</option>
                      {items
                        .filter((item) => item.id === l.itemId || !selectedItemIds.has(item.id))
                        .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} ({item.sku}) · <strong>{item.qtyOnHand}</strong> in stock
                        </option>
                      ))}
                    </Select>
                  </TD>
                  <TD numeric>
                    <Input
                      mono
                      inputMode="decimal"
                      className="text-right"
                      value={l.qty}
                      onChange={(e) => patchLine(l.key, { qty: e.target.value })}
                      placeholder="0"
                    />
                  </TD>
                  <TD numeric>
                    <Input
                      mono
                      inputMode="decimal"
                      className="text-right"
                      value={l.price}
                      onChange={(e) => patchLine(l.key, { price: e.target.value })}
                      placeholder="0.00"
                    />
                  </TD>
                  <TD numeric className="font-mono text-[12px] text-ink-3 tnum">
                    {it ? `${it.gstRate}%` : "—"}
                  </TD>
                  <TD numeric>{lineNet > 0 ? <Money value={lineNet} /> : "—"}</TD>
                  <TD>
                    <button
                      type="button"
                      onClick={() => removeLine(l.key)}
                      disabled={lines.length === 1}
                      className="rounded p-1 text-ink-4 transition-colors hover:bg-red-wash hover:text-red disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ink-4"
                      aria-label="Remove line"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <path d="M6 7h12M9 7V5h6v2m-7 0 .5 12h7L16 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Panel>

      <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-end sm:justify-between">
        <dl className="flex flex-col gap-1.5 text-[13px]">
          <div className="flex items-center justify-between gap-8">
            <dt className="text-ink-3">Total</dt>
            <dd className="font-mono text-ink tnum"><Money value={totals.taxable} /></dd>
          </div>
          {isOfficial && (
            <div className="flex items-center justify-between gap-8">
              <dt className="text-ink-3">{interstate ? "IGST" : "CGST + SGST"}</dt>
              <dd className="font-mono text-ink tnum"><Money value={totals.tax} /></dd>
            </div>
          )}
          {isOfficial && Math.abs(totals.roundOff) >= 0.005 && (
            <div className="flex items-center justify-between gap-8">
              <dt className="text-ink-4">Round-off</dt>
              <dd className="font-mono text-ink-3 tnum"><Money value={totals.roundOff} /></dd>
            </div>
          )}
          <div className="mt-1 flex items-center justify-between gap-8 border-t border-line pt-1.5">
            <dt className="font-semibold text-ink">{isOfficial ? "Invoice total" : "Receipt total"}</dt>
            <dd className="font-mono text-[18px] font-bold text-ink tnum">
              <Money value={totals.grand} />
            </dd>
          </div>
        </dl>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => (onCancel ? onCancel() : router.push("/sales"))}>
            Cancel
          </Button>
          <Button variant="primary" size="md" onClick={submit} loading={pending} disabled={!canSubmit}>
            Record sale
          </Button>
        </div>
      </Card>
    </div>
  );
}
