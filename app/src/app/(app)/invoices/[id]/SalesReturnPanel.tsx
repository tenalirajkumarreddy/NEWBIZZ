"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Panel, Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Field";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { Money } from "@/components/ui/Money";
import { useToast } from "@/components/ui/Toast";
import { qty as fmtQty } from "@/lib/format";
import { recordSalesReturn } from "@/lib/actions/creditnotes";
import type { InvoiceLine } from "@/lib/data/sales";

// Sales-return surface on an invoice (§4.5). Shows each line's sold / already-
// returned / returnable, lets the user enter what's coming back, previews the
// credit (proportional taxable + tax), and posts record_sales_return — which
// reverses tax + COGS at original cost, restocks, and issues a credit note.
export function SalesReturnPanel({
  invoiceId,
  invoiceNo,
  lines,
  returnedByLine,
  interstate,
}: {
  invoiceId: string;
  invoiceNo: string;
  lines: InvoiceLine[];
  returnedByLine: Record<string, number>;
  interstate: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [narration, setNarration] = useState("");

  // Per-line returnable = sold − already returned.
  const returnable = useMemo(
    () =>
      lines.map((l) => ({
        line: l,
        already: returnedByLine[l.id] ?? 0,
        remaining: Math.max(l.qty - (returnedByLine[l.id] ?? 0), 0),
      })),
    [lines, returnedByLine],
  );

  const anyReturnable = returnable.some((r) => r.remaining > 0);

  // Live preview of the credit: proportional taxable + tax by returned fraction.
  const preview = useMemo(() => {
    let base = 0;
    let tax = 0;
    for (const { line } of returnable) {
      const q = Number(draft[line.id] ?? 0);
      if (q <= 0 || line.qty <= 0) continue;
      const frac = q / line.qty;
      base += line.taxable_amount * frac;
      tax += (line.cgst_amount + line.sgst_amount + line.igst_amount + line.cess_amount) * frac;
    }
    return { base: Math.round(base * 100) / 100, tax: Math.round(tax * 100) / 100 };
  }, [draft, returnable]);

  const previewTotal = preview.base + preview.tax;

  function setLine(id: string, value: string) {
    setDraft((d) => ({ ...d, [id]: value }));
  }

  function fillAll() {
    const next: Record<string, string> = {};
    for (const { line, remaining } of returnable) {
      if (remaining > 0) next[line.id] = String(remaining);
    }
    setDraft(next);
  }

  function onSubmit() {
    const payload = returnable
      .map(({ line, remaining }) => ({
        invoice_line_id: line.id,
        qty: Number(draft[line.id] ?? 0),
        remaining,
      }))
      .filter((r) => r.qty > 0);

    if (payload.length === 0) {
      toast.error("Nothing to return", "Enter a return quantity on at least one line.");
      return;
    }
    const over = payload.find((r) => r.qty > r.remaining + 1e-6);
    if (over) {
      toast.error("Over-return", "A line returns more than its returnable balance.");
      return;
    }

    startTransition(async () => {
      const res = await recordSalesReturn({
        invoice_id: invoiceId,
        narration: narration.trim() || undefined,
        lines: payload.map((r) => ({ invoice_line_id: r.invoice_line_id, qty: r.qty })),
      });
      if (res.ok) {
        toast.success("Return recorded", `Credit note created against ${invoiceNo}.`);
        setDraft({});
        setNarration("");
        setOpen(false);
        router.push(`/credit-notes/${res.creditNoteId}`);
        router.refresh();
      } else {
        toast.error("Could not record return", res.error);
      }
    });
  }

  if (!anyReturnable) return null;

  if (!open) {
    return (
      <div className="flex justify-end">
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          Record sales return
        </Button>
      </div>
    );
  }

  return (
    <Panel title="Record a sales return" flush>
      <Table>
        <THead>
          <TR>
            <TH className="w-10">#</TH>
            <TH>Item</TH>
            <TH numeric>Sold</TH>
            <TH numeric>Returned</TH>
            <TH numeric>Returnable</TH>
            <TH numeric className="w-32">Return now</TH>
          </TR>
        </THead>
        <TBody>
          {returnable.map(({ line, already, remaining }) => (
            <TR key={line.id}>
              <TD className="text-ink-4">{line.line_no}</TD>
              <TD>
                <span className="font-medium text-ink">{line.itemName ?? "—"}</span>
                {line.sku && <span className="ml-1.5 font-mono text-[11px] text-ink-4">{line.sku}</span>}
              </TD>
              <TD numeric>{fmtQty(line.qty)}</TD>
              <TD numeric className={already > 0 ? "text-ink-3" : "text-ink-4"}>{fmtQty(already)}</TD>
              <TD numeric className={remaining > 0 ? "text-ink" : "text-grn"}>{fmtQty(remaining)}</TD>
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
                    aria-label={`Return qty for line ${line.line_no}`}
                  />
                ) : (
                  <span className="text-[12px] text-ink-4">—</span>
                )}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>

      <div className="flex flex-col gap-3 border-t border-line p-4">
        <Textarea
          value={narration}
          onChange={(e) => setNarration(e.target.value)}
          rows={2}
          placeholder="Reason for the return (optional)"
        />

        <Card className="flex flex-col gap-1.5 p-3 text-[13px]">
          <div className="flex items-center justify-between">
            <span className="text-ink-3">Taxable credit</span>
            <span className="font-mono tnum text-ink"><Money value={preview.base} /></span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-ink-3">GST reversed{interstate ? " (IGST)" : " (CGST+SGST)"}</span>
            <span className="font-mono tnum text-ink"><Money value={preview.tax} /></span>
          </div>
          <div className="flex items-center justify-between border-t border-line pt-1.5">
            <span className="font-semibold text-ink">Credit to customer</span>
            <span className="font-mono tnum text-[15px] font-bold text-ink"><Money value={previewTotal} /></span>
          </div>
        </Card>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="mr-auto text-[11px] text-ink-4">
            Restocks the goods at their original cost and reverses the exact tax.
          </span>
          <Button variant="ghost" size="sm" onClick={fillAll} disabled={pending}>
            Return all
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { setDraft({}); setNarration(""); setOpen(false); }} disabled={pending}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={onSubmit} loading={pending} disabled={previewTotal <= 0}>
            Record return
          </Button>
        </div>
      </div>
    </Panel>
  );
}
