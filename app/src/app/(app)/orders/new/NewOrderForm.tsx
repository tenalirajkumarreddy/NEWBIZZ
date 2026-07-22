"use client";

import { useMemo, useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Panel, Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Select, Input } from "@/components/ui/Field";
import { Money } from "@/components/ui/Money";
import { useToast } from "@/components/ui/Toast";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { createOrder, fetchCustomerCreditInfo } from "@/lib/actions/sales";
import type { CustomerCreditInfo } from "@/lib/data/sales";
import type { StoreOption, ItemOption } from "@/lib/data/sales";

interface DraftLine {
  key: number;
  itemId: string;
  qty: string;
  price: string;
}

// New order — pure demand capture (§4.4). place_order writes the confirmed
// order with no ledger or stock impact; value posts later when the order is
// invoiced ("Raise invoice" on the order, or the Sales Desk for sell-now).
export function NewOrderForm({
  stores,
  items,
  onDone,
  onCancel,
}: {
  stores: StoreOption[];
  items: ItemOption[];
  // Passed when hosted in a Drawer so the user stays on /orders (see
  // RecordSaleForm for the pattern). Undefined on the standalone /new page.
  onDone?: (orderId: string) => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [storeId, setStoreId] = useState("");
  const [notes, setNotes] = useState("");
  const [seq, setSeq] = useState(1);
  const [lines, setLines] = useState<DraftLine[]>([{ key: 0, itemId: "", qty: "", price: "" }]);
  const [creditInfo, setCreditInfo] = useState<CustomerCreditInfo | null>(null);
  const [creditLoading, setCreditLoading] = useState(false);

  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const store = useMemo(() => stores.find((s) => s.id === storeId) ?? null, [stores, storeId]);

  const onStoreChange = useCallback(async (id: string) => {
    setStoreId(id);
    setCreditInfo(null);
    const s = stores.find((st) => st.id === id);
    if (!s?.customerId) return;
    setCreditLoading(true);
    try {
      const info = await fetchCustomerCreditInfo(s.customerId);
      setCreditInfo(info);
    } catch { /* ignore */ }
    setCreditLoading(false);
  }, [stores]);

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

  function onItemChange(key: number, itemId: string) {
    const it = itemsById.get(itemId);
    patchLine(key, { itemId, price: it ? String(it.defaultPrice) : "" });
  }

  const netTotal = useMemo(
    () =>
      lines.reduce((sum, l) => {
        const q = Number(l.qty);
        const p = Number(l.price);
        if (!l.itemId || !(q > 0)) return sum;
        return sum + q * (Number.isFinite(p) ? p : 0);
      }, 0),
    [lines],
  );

  const validLines = lines.filter((l) => l.itemId && Number(l.qty) > 0);
  const canSubmit = !!storeId && validLines.length > 0 && !pending;

  function submit() {
    if (!canSubmit) return;
    startTransition(async () => {
      const res = await createOrder({
        store_id: storeId,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        lines: validLines.map((l) => ({
          item_id: l.itemId,
          qty: Number(l.qty),
          ...(l.price !== "" && Number.isFinite(Number(l.price))
            ? { unit_price: Number(l.price) }
            : {}),
        })),
      });
      if (res.ok) {
        toast.success("Order placed", "Confirmed — no accounting impact until invoiced.");
        if (onDone) {
          onDone(res.orderId);
        } else {
          router.push(`/orders/${res.orderId}`);
          router.refresh();
        }
      } else {
        toast.error("Could not place order", res.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Panel title="Order for">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Store" required htmlFor="store">
            <Select id="store" value={storeId} onChange={(e) => onStoreChange(e.target.value)}>
              <option value="">Select a store…</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.customerName ? ` — ${s.customerName}` : ""} ({s.code})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Notes" htmlFor="notes">
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Delivery instructions, PO reference…"
            />
          </Field>
          {store?.customerId && (
            <Field label="Credit limit">
              {creditLoading ? (
                <span className="text-[12px] text-ink-3">Checking…</span>
              ) : creditInfo ? (
                <div className="flex flex-col gap-0.5 text-[12px]">
                  {creditInfo.creditLimit > 0 ? (
                    <>
                      <span>
                        Limit: <span className="font-mono text-ink"><Money value={creditInfo.creditLimit} /></span>
                        {" · "}Outstanding: <span className="font-mono text-ink"><Money value={creditInfo.outstanding} /></span>
                        {" · "}Available:{" "}
                        <span className={"font-mono " + (creditInfo.creditLimit - creditInfo.outstanding > 0 ? "text-grn" : "text-red")}>
                          <Money value={creditInfo.creditLimit - creditInfo.outstanding} />
                        </span>
                      </span>
                      {netTotal > 0 && creditInfo.creditLimit - creditInfo.outstanding - netTotal < 0 && (
                        <span className="text-red">
                          ⚠ This order would exceed the available credit by{" "}
                          <Money value={netTotal - (creditInfo.creditLimit - creditInfo.outstanding)} />.
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-ink-3">No credit limit set (cash on delivery).</span>
                  )}
                </div>
              ) : null}
            </Field>
          )}
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
                      {items.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} ({item.sku})
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
            <dt className="font-semibold text-ink">Net value (ex-GST)</dt>
            <dd className="font-mono text-[18px] font-bold text-ink tnum">
              <Money value={netTotal} />
            </dd>
          </div>
          <p className="text-[12px] text-ink-4">
            GST posts when the order is invoiced, by the store&apos;s place of supply.
          </p>
        </dl>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => (onCancel ? onCancel() : router.push("/orders"))}>
            Cancel
          </Button>
          <Button variant="primary" size="md" onClick={submit} loading={pending} disabled={!canSubmit}>
            Place order
          </Button>
        </div>
      </Card>
    </div>
  );
}
