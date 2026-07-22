"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select } from "@/components/ui/Field";
import { Money } from "@/components/ui/Money";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { dateIST, count as fmtCount } from "@/lib/format";
import type { InvoiceListRow, InvoiceStatus } from "@/lib/data/sales";

const STATUSES: InvoiceStatus[] = ["posted", "part_paid", "paid", "void"];

const STATUS_LABEL: Record<string, string> = {
  posted: "Posted",
  part_paid: "Part paid",
  paid: "Paid",
  void: "Void",
};

// Register filters for the Sales Desk (§4.8): free-text over invoice/customer/
// store plus a status filter and a quick "outstanding only" toggle. Purely
// client-side over the already-loaded page; the register is bounded to 200 rows.
export function SalesTable({ invoices }: { invoices: InvoiceListRow[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [openOnly, setOpenOnly] = useState(false);
  const [docType, setDocType] = useState<"all" | "official" | "cash">("all");

  const officialCount = useMemo(() => invoices.filter((i) => i.isOfficial).length, [invoices]);
  const cashCount = invoices.length - officialCount;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return invoices.filter((inv) => {
      if (docType === "official" && !inv.isOfficial) return false;
      if (docType === "cash" && inv.isOfficial) return false;
      if (status && inv.status !== status) return false;
      if (openOnly && !(inv.status === "posted" || inv.status === "part_paid")) return false;
      if (!q) return true;
      return (
        inv.invoice_no.toLowerCase().includes(q) ||
        (inv.customerName ?? "").toLowerCase().includes(q) ||
        (inv.storeName ?? "").toLowerCase().includes(q) ||
        (inv.storeCode ?? "").toLowerCase().includes(q)
      );
    });
  }, [invoices, query, status, openOnly, docType]);

  const TABS: { key: "all" | "official" | "cash"; label: string; count: number }[] = [
    { key: "all", label: "All", count: invoices.length },
    { key: "official", label: "Tax invoices", count: officialCount },
    { key: "cash", label: "Cash memos", count: cashCount },
  ];

  return (
    <>
      <div className="flex items-center gap-1 border-b border-line px-4 pt-3">
        {TABS.map((t) => {
          const active = docType === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setDocType(t.key)}
              className={
                "relative -mb-px flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium transition " +
                (active
                  ? "border-b-2 border-brand text-ink"
                  : "border-b-2 border-transparent text-ink-4 hover:text-ink-2")
              }
            >
              {t.label}
              <span
                className={
                  "rounded-full px-1.5 py-0.5 text-[10px] font-semibold tnum " +
                  (active ? "bg-brand-wash text-brand" : "bg-fill text-ink-4")
                }
              >
                {fmtCount(t.count)}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2 border-b border-line px-4 py-3 sm:flex-row sm:items-center">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search invoice, customer, store…"
          className="sm:max-w-[320px]"
        />
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="sm:max-w-[160px]"
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          ))}
        </Select>
        <label className="flex items-center gap-1.5 text-[12px] text-ink-2">
          <input
            type="checkbox"
            checked={openOnly}
            onChange={(e) => setOpenOnly(e.target.checked)}
            className="h-4 w-4 rounded border-line"
          />
          Outstanding only
        </label>
        {(query || status || openOnly) && (
          <span className="text-[12px] text-ink-4 sm:ml-auto">
            {fmtCount(filtered.length)} of {fmtCount(invoices.length)}
          </span>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No matching sales"
          description="No invoices match the current search and filter — clear them to see the full register."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Invoice No</TH>
              <TH>Date</TH>
              <TH>Store</TH>
              <TH>Customer</TH>
              <TH numeric>Taxable</TH>
              <TH numeric>Tax</TH>
              <TH numeric>Total</TH>
              <TH numeric>Due</TH>
              <TH>Status</TH>
              <TH className="w-44">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {filtered.map((inv) => {
              const due = inv.grandTotal - inv.amountPaid;
              const open = inv.status === "posted" || inv.status === "part_paid";
              return (
                <TR key={inv.id} interactive>
                  <TD className="p-0">
                    <Link
                      href={`/invoices/${inv.id}`}
                      className="flex items-center gap-1.5 px-3 py-2.5 font-mono text-[12px] font-semibold text-brand"
                    >
                      {inv.invoice_no}
                      {!inv.isOfficial && (
                        <span className="rounded bg-amber-wash px-1 py-0.5 font-mono text-[10px] font-normal text-amb">CM</span>
                      )}
                    </Link>
                  </TD>
                  <TD>{dateIST(inv.invoice_date)}</TD>
                  <TD>
                    <span className="font-medium text-ink">{inv.storeName ?? "—"}</span>
                    {inv.storeCode && (
                      <span className="ml-1.5 font-mono text-[11px] text-ink-4">{inv.storeCode}</span>
                    )}
                  </TD>
                  <TD>{inv.customerName ?? "—"}</TD>
                  <TD numeric><Money value={inv.taxableAmount} /></TD>
                  <TD numeric>
                    {inv.taxTotal > 0 ? <Money value={inv.taxTotal} /> : "—"}
                    {inv.isInterstate && inv.taxTotal > 0 && (
                      <span className="ml-1 font-mono text-[10px] text-ink-4">IGST</span>
                    )}
                  </TD>
                  <TD numeric><Money value={inv.grandTotal} /></TD>
                  <TD numeric>
                    {due > 0.005 ? (
                      <span className="font-mono text-amb tnum"><Money value={due} /></span>
                    ) : (
                      <span className="text-ink-4">—</span>
                    )}
                  </TD>
                  <TD><StatusBadge status={inv.status} /></TD>
                  <TD>
                    <div className="flex items-center gap-1.5">
                      <Link href={`/invoices/${inv.id}`}>
                        <Button variant="ghost" size="sm">View</Button>
                      </Link>
                      {open && (
                        <Link href={`/receipts/new?invoice=${inv.id}`}>
                          <Button variant="secondary" size="sm">Payment</Button>
                        </Link>
                      )}
                    </div>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
    </>
  );
}
