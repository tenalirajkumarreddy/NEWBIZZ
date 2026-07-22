"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/ui/EmptyState";
import { Money } from "@/components/ui/Money";
import { Input, Select } from "@/components/ui/Field";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { dateIST, count as fmtCount, titleCase } from "@/lib/format";
import type { ReceiptListRow } from "@/lib/data/collections";

const DEPOSIT_LABEL: Record<string, string> = {
  "1110": "Cash",
  "1120": "Bank",
  "2140": "Custody",
  "1180": "Cheques",
  "2100": "Advances",
};

export function ReceiptsTable({ receipts }: { receipts: ReceiptListRow[] }) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return receipts.filter((r) => {
      if (mode && r.methodName !== mode) return false;
      if (!q) return true;
      return (
        r.receipt_no.toLowerCase().includes(q) ||
        (r.customerName ?? "").toLowerCase().includes(q) ||
        (r.storeName ?? "").toLowerCase().includes(q) ||
        (r.reference ?? "").toLowerCase().includes(q)
      );
    });
  }, [receipts, query, mode]);

  return (
    <>
      <div className="flex flex-col gap-2 border-b border-line px-4 py-3 sm:flex-row sm:items-center">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search receipt no, customer, reference…"
          className="sm:max-w-[320px]"
        />
        <Select
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          className="sm:max-w-[160px]"
          aria-label="Filter by method"
        >
          <option value="">All methods</option>
          {[...new Set(receipts.map((r) => r.methodName).filter(Boolean))].map((name) => (
            <option key={name} value={name!}>{name}</option>
          ))}
        </Select>
        {(query || mode) && (
          <span className="text-[12px] text-ink-4">
            {fmtCount(filtered.length)} of {fmtCount(receipts.length)} receipts
          </span>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No matching receipts"
          description="No receipts match the current search and filter — clear them to see the full register."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Receipt No</TH>
              <TH>Date</TH>
              <TH>Customer</TH>
              <TH>Store</TH>
              <TH>Mode</TH>
              <TH>Deposited to</TH>
              <TH>Reference</TH>
              <TH numeric>Amount</TH>
              <TH numeric>Allocated</TH>
              <TH numeric>On account</TH>
            </TR>
          </THead>
          <TBody>
            {filtered.map((r) => {
              const onAccount = r.amount - r.allocatedAmount;
              return (
                <TR key={r.id} interactive>
                  <TD className="font-mono text-[12px] font-semibold text-brand">
                    {r.receipt_no}
                  </TD>
                  <TD>{dateIST(r.receipt_date)}</TD>
                  <TD>
                    {r.customerId ? (
                      <Link
                        href={`/customers/${r.customerId}`}
                        className="font-medium text-ink hover:text-brand hover:underline"
                      >
                        {r.customerName ?? "—"}
                      </Link>
                    ) : (
                      <span className="font-medium text-ink">{r.customerName ?? "—"}</span>
                    )}
                  </TD>
                  <TD>{r.storeName ?? "—"}</TD>
                  <TD>{r.methodName ?? titleCase(r.mode)}</TD>
                  <TD>{DEPOSIT_LABEL[r.depositAccount] ?? r.depositAccount}</TD>
                  <TD className="font-mono text-[11px] text-ink-4">{r.reference ?? "—"}</TD>
                  <TD numeric><Money value={r.amount} /></TD>
                  <TD numeric>
                    {r.allocatedAmount > 0 ? <Money value={r.allocatedAmount} /> : "—"}
                  </TD>
                  <TD numeric>
                    {onAccount > 0.005 ? (
                      <span className="font-mono text-amb tnum"><Money value={onAccount} /></span>
                    ) : (
                      <span className="text-ink-4">—</span>
                    )}
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
