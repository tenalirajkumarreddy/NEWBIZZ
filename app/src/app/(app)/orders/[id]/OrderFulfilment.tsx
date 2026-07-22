"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Panel, Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Field";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { qty as fmtQty } from "@/lib/format";
import { createChallan, closePartialOrder } from "@/lib/actions/challans";
import { fulfilOrder } from "@/lib/actions/sales";
import type { OrderLine, OrderStatus } from "@/lib/data/sales";
import type { ChallanListRow } from "@/lib/data/challans";

// Fulfilment surface on an order. Provides two paths:
//   1. "Fulfil all & deliver" (primary) — one-click: creates challan, marks
//      delivered, posts revenue + GST + stock + customer_ledger.
//   2. Manual challan creation (advanced) — for partial deliveries, then
//      "Deliver all remaining" to close + post accounting.
export function OrderFulfilment({
  orderId,
  orderNo,
  status,
  lines,
  challans,
}: {
  orderId: string;
  orderNo: string;
  status: OrderStatus;
  lines: OrderLine[];
  challans: ChallanListRow[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [fulfilling, startFulfilling] = useTransition();
  const [closing, startClosing] = useTransition();
  const [confirmClose, setConfirmClose] = useState(false);

  const remainingByLine = useMemo(
    () =>
      lines.map((l) => ({
        line: l,
        remaining: Math.max(l.qty - l.qtyFulfilled, 0),
      })),
    [lines],
  );

  const totalRemaining = remainingByLine.reduce((s, r) => s + r.remaining, 0);
  const totalDelivered = lines.reduce((s, l) => s + l.qtyFulfilled, 0);

  const [draft, setDraft] = useState<Record<string, string>>({});

  function setLine(lineId: string, value: string) {
    setDraft((d) => ({ ...d, [lineId]: value }));
  }

  function fillRemaining() {
    const next: Record<string, string> = {};
    for (const { line, remaining } of remainingByLine) {
      if (remaining > 0) next[line.id] = String(remaining);
    }
    setDraft(next);
  }

  function onCreate() {
    const payload = remainingByLine
      .map(({ line, remaining }) => {
        const v = Number(draft[line.id] ?? 0);
        return { order_line_id: line.id, qty: v, remaining };
      })
      .filter((r) => r.qty > 0);

    if (payload.length === 0) {
      toast.error("Nothing to deliver", "Enter a delivered quantity on at least one line.");
      return;
    }
    const over = payload.find((r) => r.qty > r.remaining + 1e-6);
    if (over) {
      toast.error("Over-delivery", "A line delivers more than its remaining balance.");
      return;
    }

    startTransition(async () => {
      const res = await createChallan({
        order_id: orderId,
        lines: payload.map((r) => ({ order_line_id: r.order_line_id, qty: r.qty })),
      });
      if (res.ok) {
        toast.success("Challan raised", `Delivery note created for ${orderNo}.`);
        setDraft({});
        router.push(`/challans/${res.challanId}`);
        router.refresh();
      } else {
        toast.error("Could not raise challan", res.error);
      }
    });
  }

  /** Fulfil all remaining qty — creates challan, marks delivered, posts accounting. */
  function onFulfilAll() {
    startFulfilling(async () => {
      const res = await fulfilOrder(orderId);
      if (res.ok) {
        toast.success("Order fulfilled", `${orderNo} — revenue, GST and stock posted.`);
        router.push(`/challans/${res.challanId}`);
        router.refresh();
      } else {
        toast.error("Could not fulfil order", res.error);
      }
    });
  }

  function onClosePartial() {
    if (!confirmClose) {
      setConfirmClose(true);
      return;
    }
    startClosing(async () => {
      const res = await closePartialOrder(orderId);
      setConfirmClose(false);
      if (res.ok) {
        if (res.followupOrderId) {
          toast.success("Order closed", `Follow-up order created for the undelivered balance.`);
          router.push(`/orders/${res.followupOrderId}`);
        } else {
          toast.success("Order fulfilled", `${orderNo} is fully delivered.`);
        }
        router.refresh();
      } else {
        toast.error("Could not close order", res.error);
      }
    });
  }

  const canRaise = status === "confirmed" || status === "approved" || status === "partially_fulfilled";
  const canFulfil = status === "confirmed" || status === "approved" || status === "partially_fulfilled";

  return (
    <div className="flex flex-col gap-4">
      {/* Fulfilment progress */}
      <Panel title="Fulfilment" flush>
        <Table>
          <THead>
            <TR>
              <TH className="w-10">#</TH>
              <TH>Item</TH>
              <TH numeric>Ordered</TH>
              <TH numeric>Delivered</TH>
              <TH numeric>Remaining</TH>
              {canRaise && <TH numeric className="w-32">Deliver now</TH>}
            </TR>
          </THead>
          <TBody>
            {remainingByLine.map(({ line, remaining }) => (
              <TR key={line.id}>
                <TD className="text-ink-4">{line.line_no}</TD>
                <TD>
                  <span className="font-medium text-ink">{line.itemName ?? "—"}</span>
                  {line.sku && <span className="ml-1.5 font-mono text-[11px] text-ink-4">{line.sku}</span>}
                </TD>
                <TD numeric>{fmtQty(line.qty)}</TD>
                <TD numeric>{fmtQty(line.qtyFulfilled)}</TD>
                <TD numeric className={remaining > 0 ? "text-amb font-semibold" : "text-grn"}>
                  {fmtQty(remaining)}
                </TD>
                {canRaise && (
                  <TD numeric>
                    {remaining > 0 ? (
                      <Input
                        type="number"
                        min={0}
                        max={remaining}
                        step="any"
                        inputMode="decimal"
                        value={draft[line.id] ?? ""}
                        onChange={(e) => setLine(line.id, e.target.value)}
                        className="w-24 text-right"
                        aria-label={`Deliver qty for line ${line.line_no}`}
                      />
                    ) : (
                      <span className="text-[12px] text-ink-4">—</span>
                    )}
                  </TD>
                )}
              </TR>
            ))}
          </TBody>
        </Table>

        {canRaise && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-4 py-3">
            <span className="mr-auto text-[12px] text-ink-4">
              {fmtQty(totalDelivered)} delivered · {fmtQty(totalRemaining)} remaining
            </span>
            <Button variant="ghost" size="sm" onClick={fillRemaining} disabled={pending || totalRemaining <= 0}>
              Deliver all remaining
            </Button>
            <Button variant="secondary" size="sm" onClick={onCreate} loading={pending} disabled={totalRemaining <= 0}>
              Raise challan (tracking only)
            </Button>
            {canFulfil && (
              <Button variant="primary" size="sm" onClick={onFulfilAll} loading={fulfilling} disabled={totalRemaining <= 0}>
                Fulfil all & deliver
              </Button>
            )}
          </div>
        )}
        {canFulfil && totalRemaining > 0 && (
          <div className="border-t border-line px-4 py-2 text-[11px] text-ink-4">
            <strong>Fulfil all & deliver</strong> — creates challan, marks delivered, posts revenue + GST + stock. Recommended.
            <br />
            <strong>Raise challan (tracking only)</strong> — physical note, no accounting. Use for partial deliveries.
          </div>
        )}
      </Panel>

      {/* Partial-close */}
      {status === "confirmed" && totalDelivered > 0 && totalRemaining > 0 && (
        <Card className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[13px] font-semibold text-ink">Close as partially fulfilled</div>
            <p className="mt-0.5 text-[12px] text-ink-3">
              Marks {orderNo} partially fulfilled and moves the undelivered balance into a new follow-up order.
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {confirmClose ? (
              <>
                <Button variant="secondary" size="sm" onClick={onClosePartial} loading={closing}>
                  Confirm & split balance
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmClose(false)} disabled={closing}>
                  Keep open
                </Button>
              </>
            ) : (
              <Button variant="ghost" size="sm" onClick={onClosePartial} disabled={closing}>
                Close & split balance
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* Challans against this order */}
      {challans.length > 0 && (
        <Panel title="Challans" flush>
          <Table>
            <THead>
              <TR>
                <TH>Challan No</TH>
                <TH numeric>Units</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {challans.map((c) => (
                <TR key={c.id} interactive>
                  <TD className="p-0">
                    <Link href={`/challans/${c.id}`} className="block px-3 py-2.5 font-mono text-[12px] font-semibold text-brand">
                      {c.challan_no}
                    </Link>
                  </TD>
                  <TD numeric>{fmtQty(c.totalQty)}</TD>
                  <TD><StatusBadge status={c.status} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Panel>
      )}
    </div>
  );
}
