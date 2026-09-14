"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Panel, Card } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Field";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { createChallan } from "@/lib/actions/challans";
import type { OrderLine } from "@/lib/data/sales";

// Delivery challan = goods-in-transit note. Tracking only: no prices, no
// accounting. Delivery (or "Fulfil all & deliver") is what posts value.
export function RaiseChallanAction({
  orderId, orderNo, lines, autoOpen = false,
}: {
  orderId: string;
  orderNo: string;
  lines: OrderLine[];
  autoOpen?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(autoOpen);
  const [pending, startTransition] = useTransition();
  const [notes, setNotes] = useState("");
  const [qtys, setQtys] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      lines.map((l) => [l.id, String(Math.max(l.qty - l.qtyFulfilled, 0))]),
    ),
  );

  function setQty(id: string, v: string) {
    setQtys((xs) => ({ ...xs, [id]: v.replace(/[^0-9.]/g, "") }));
  }

  const entries = lines
    .map((l) => ({ line: l, qty: Number(qtys[l.id] ?? "") }))
    .filter((e) => Number.isFinite(e.qty) && e.qty > 0);
  const over = entries.find((e) => e.qty > Math.max(e.line.qty - e.line.qtyFulfilled, 0));
  const canSubmit = entries.length > 0 && !over && !pending;

  function submit() {
    if (!canSubmit) return;
    startTransition(async () => {
      const res = await createChallan({
        order_id: orderId,
        lines: entries.map((e) => ({ order_line_id: e.line.id, qty: e.qty })),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
      if (res.ok) {
        toast.success("Challan raised", `Delivery note created for ${orderNo}.`);
        setOpen(false);
        router.push(`/challans/${res.challanId}`);
        router.refresh();
      } else {
        toast.error("Could not raise challan", res.error);
      }
    });
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Raise challan
      </Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={`Delivery challan for ${orderNo}`}
        description="Goods-out tracking note. No prices, no accounting until delivery."
        size="lg"
      >
        <div className="flex flex-col gap-4">
          <Panel title="Delivering now" flush>
            <Table>
              <THead>
                <TR>
                  <TH>Item</TH>
                  <TH numeric className="w-24">Remaining</TH>
                  <TH numeric className="w-28">Qty</TH>
                </TR>
              </THead>
              <TBody>
                {lines.map((l) => {
                  const remaining = Math.max(l.qty - l.qtyFulfilled, 0);
                  const bad = over?.line.id === l.id;
                  return (
                    <TR key={l.id}>
                      <TD>
                        <span className="font-medium text-ink">{l.itemName ?? "—"}</span>
                        {l.sku && <span className="ml-1.5 font-mono text-[11px] text-ink-4">{l.sku}</span>}
                      </TD>
                      <TD numeric className="font-mono text-[12px] text-ink-3 tnum">{remaining}</TD>
                      <TD numeric>
                        <Input
                          mono
                          inputMode="decimal"
                          className={"w-full text-right" + (bad ? " border-red" : "")}
                          value={qtys[l.id] ?? ""}
                          onChange={(e) => setQty(l.id, e.target.value)}
                        />
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
            {over && (
              <p className="px-4 pb-3 text-[12px] text-red">
                {over.line.itemName ?? "—"}: cannot deliver more than its remaining {Math.max(over.line.qty - over.line.qtyFulfilled, 0)}.
              </p>
            )}
          </Panel>
          <Field label="Notes (optional)">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Vehicle, driver, seal no…" />
          </Field>
          <Card className="flex items-center justify-end gap-2 p-4">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
            <Button variant="primary" size="md" onClick={submit} loading={pending} disabled={!canSubmit}>
              Create challan
            </Button>
          </Card>
        </div>
      </Drawer>
    </>
  );
}
