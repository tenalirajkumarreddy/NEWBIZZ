"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Panel, Card } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Field";
import { Money } from "@/components/ui/Money";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { fulfilOrderAsSale } from "@/lib/actions/sales";
import type { OrderLine } from "@/lib/data/sales";

interface DraftLine {
  key: number;
  itemId: string;
  qty: string;
  price: string;
  gstRate: number;
  itemName: string;
  sku: string;
}

export function FulfilOrderAction({
  orderId,
  orderNo,
  lines,
  storeStateCode,
  homeStateCode,
}: {
  orderId: string;
  orderNo: string;
  lines: OrderLine[];
  storeStateCode: string | null;
  homeStateCode: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [isOfficial, setIsOfficial] = useState(true);

  const interstate = !!storeStateCode && !!homeStateCode && storeStateCode !== homeStateCode;

  const [draftLines, setDraftLines] = useState<DraftLine[]>(() =>
    lines.map((l) => ({
      key: 0,
      itemId: l.item_id,
      qty: String(l.qty),
      price: String(l.unit_price),
      gstRate: l.gst_rate,
      itemName: l.itemName ?? "",
      sku: l.sku ?? "",
    }))
  );

  function patchLine(idx: number, patch: Partial<DraftLine>) {
    setDraftLines((xs) => xs.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  const totals = useMemo(() => {
    let taxable = 0;
    let tax = 0;
    for (const l of draftLines) {
      const q = Number(l.qty);
      const p = Number(l.price);
      if (!l.itemId || !(q > 0)) continue;
      const net = q * (Number.isFinite(p) ? p : 0);
      const rate = isOfficial ? l.gstRate : 0;
      taxable += net;
      tax += (net * rate) / 100;
    }
    const grandRaw = isOfficial ? taxable + tax : taxable;
    const grand = Math.round(grandRaw);
    return { taxable, tax, roundOff: isOfficial ? grand - grandRaw : 0, grand };
  }, [draftLines, isOfficial]);

  const validLines = draftLines.filter((l) => l.itemId && Number(l.qty) > 0);
  const canSubmit = validLines.length > 0 && !pending;

  function submit() {
    if (!canSubmit) return;
    startTransition(async () => {
      const res = await fulfilOrderAsSale(
        orderId,
        validLines.map((l) => ({
          item_id: l.itemId,
          qty: Number(l.qty),
          ...(l.price !== "" && Number.isFinite(Number(l.price))
            ? { unit_price: Number(l.price) }
            : {}),
        })),
        isOfficial,
      );
      if (res.ok) {
        toast.success("Order fulfilled", `Sale recorded — linked to order ${orderNo}.`);
        setOpen(false);
        router.push(`/invoices/${res.invoiceId}`);
        router.refresh();
      } else {
        toast.error("Could not fulfil order", res.error);
      }
    });
  }

  return (
    <>
      <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
        Fulfill
      </Button>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={`Fulfill ${orderNo}`}
        description="Record the sale — revenue, GST and stock post in one transaction."
        size="xl"
      >
        <div className="flex flex-col gap-4">
          {/* Document type + GST info */}
          <Panel title="Document type">
            <div className="grid gap-4 sm:grid-cols-2">
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
              <Field label="Place of supply">
                <div className="flex h-9 items-center gap-2 text-[13px] text-ink-2">
                  {storeStateCode ? (
                    <>
                      <span className="font-mono text-ink">State {storeStateCode}</span>
                      <span className="text-ink-4">·</span>
                      <span className={interstate ? "text-amb" : "text-grn"}>
                        {interstate ? "Inter-state — IGST" : "Intra-state — CGST + SGST"}
                      </span>
                    </>
                  ) : (
                    <span className="text-ink-4">—</span>
                  )}
                </div>
              </Field>
            </div>
          </Panel>

          {/* Lines */}
          <Panel title="Items" flush>
            <Table>
              <THead>
                <TR>
                  <TH>Item</TH>
                  <TH numeric className="w-28">Qty</TH>
                  <TH numeric className="w-36">Unit Price</TH>
                  <TH numeric className="w-20">GST</TH>
                  <TH numeric className="w-32">Line Net</TH>
                </TR>
              </THead>
              <TBody>
                {draftLines.map((l, idx) => {
                  const q = Number(l.qty);
                  const p = Number(l.price);
                  const lineNet = l.itemId && q > 0 ? q * (Number.isFinite(p) ? p : 0) : 0;
                  return (
                    <TR key={idx}>
                      <TD>
                        <span className="font-medium text-ink">{l.itemName}</span>
                        {l.sku && <span className="ml-1.5 font-mono text-[11px] text-ink-4">{l.sku}</span>}
                      </TD>
                      <TD numeric>
                        <Input
                          mono
                          inputMode="decimal"
                          className="w-full text-right"
                          value={l.qty}
                          onChange={(e) => patchLine(idx, { qty: e.target.value })}
                        />
                      </TD>
                      <TD numeric>
                        <Input
                          mono
                          inputMode="decimal"
                          className="w-full text-right"
                          value={l.price}
                          onChange={(e) => patchLine(idx, { price: e.target.value })}
                        />
                      </TD>
                      <TD numeric className="font-mono text-[12px] text-ink-3 tnum">
                        {l.gstRate > 0 ? `${l.gstRate}%` : "—"}
                      </TD>
                      <TD numeric>{lineNet > 0 ? <Money value={lineNet} /> : "—"}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </Panel>

          {/* Totals + submit */}
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
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button variant="primary" size="md" onClick={submit} loading={pending} disabled={!canSubmit}>
                Record sale & fulfil
              </Button>
            </div>
          </Card>
        </div>
      </Drawer>
    </>
  );
}
