"use client";

import { Panel } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { Money } from "@/components/ui/Money";
import { dateIST, qty } from "@/lib/format";
import type { InvoiceDetail } from "@/lib/data/sales";

export interface ReceiptCompany {
  legalName: string | null;
  address: string | null;
  gstin: string | null;
}

// Acknowledgment receipt for a field cash memo. Read-only; printed as a single
// sheet. The @media print rules hide the whole shell (nav, topbar, header) and
// show only .receipt-sheet, absolutely placed so it starts at the top of the page.
export function ReceiptSheet({
  invoice,
  company,
  userName,
}: {
  invoice: InvoiceDetail;
  company: ReceiptCompany | null;
  userName: string;
}) {
  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .receipt-sheet, .receipt-sheet * { visibility: visible; }
          .receipt-sheet { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="receipt-sheet">
        <Panel flush>
          <div className="flex flex-col gap-5 p-6">
            {/* Business identity */}
            <div className="flex items-start justify-between gap-4 border-b-2 border-ink pb-4">
              <div className="min-w-0">
                <h1 className="text-[20px] font-bold tracking-tight text-ink">
                  {company?.legalName ?? "NEWBIZZ"}
                </h1>
                {company?.address && (
                  <p className="mt-0.5 text-[12px] text-ink-3">{company.address}</p>
                )}
                {company?.gstin && (
                  <p className="mt-0.5 font-mono text-[11px] text-ink-3">GSTIN {company.gstin}</p>
                )}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-4">
                  Cash memo
                </p>
                <p className="mt-0.5 font-mono text-[15px] font-semibold text-ink">
                  {invoice.invoice_no}
                </p>
                <p className="mt-0.5 text-[12px] text-ink-3">{dateIST(invoice.invoice_date)}</p>
              </div>
            </div>

            {invoice.customerName && (
              <div className="text-[13px] text-ink-2">
                <span className="font-medium text-ink">Customer:</span> {invoice.customerName}
              </div>
            )}
            <div className="text-[12px] text-ink-3">
              Recorded by <span className="font-medium text-ink">{userName}</span>
            </div>

            {/* Line items */}
            <Table>
              <THead>
                <TR>
                  <TH className="w-10">#</TH>
                  <TH>Item</TH>
                  <TH numeric>Qty</TH>
                  <TH numeric>Unit price</TH>
                  <TH numeric>Amount</TH>
                </TR>
              </THead>
              <TBody>
                {invoice.lines.map((l) => (
                  <TR key={l.id}>
                    <TD className="text-ink-4">{l.line_no}</TD>
                    <TD>
                      <span className="font-medium text-ink">{l.itemName ?? "—"}</span>
                    </TD>
                    <TD numeric>{qty(l.qty)}</TD>
                    <TD numeric>
                      <Money value={l.unit_price} />
                    </TD>
                    <TD numeric>
                      <Money value={l.line_total} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>

            {/* Grand total */}
            <div className="flex justify-end">
              <div className="w-full max-w-xs border-t-2 border-ink pt-2">
                <div className="flex items-center justify-between">
                  <dt className="text-[13px] font-semibold text-ink">Grand total</dt>
                  <dd className="text-[18px] font-bold text-ink">
                    <Money value={invoice.grandTotal} />
                  </dd>
                </div>
              </div>
            </div>

            <p className="border-t border-line pt-3 text-[11px] text-ink-4">
              This is a computer-generated acknowledgment receipt and does not carry a tax
              invoice. Amount received in full.
            </p>
          </div>
        </Panel>
      </div>

      <div className="no-print mt-4 flex justify-end">
        <Button variant="primary" size="md" onClick={() => window.print()}>
          Print
        </Button>
      </div>
    </>
  );
}