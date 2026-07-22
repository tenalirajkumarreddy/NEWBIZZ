"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select } from "@/components/ui/Field";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { Money } from "@/components/ui/Money";
import { dateIST, count as fmtCount } from "@/lib/format";
import type { CreditNoteListRow, CreditNoteReason } from "@/lib/data/creditnotes";

const REASONS: CreditNoteReason[] = ["sales_adjustment", "scheme_rebate", "complaint", "other"];

export const REASON_LABEL: Record<string, string> = {
  sales_adjustment: "Sales return",
  scheme_rebate: "Scheme rebate",
  complaint: "Complaint",
  other: "Other",
};

export function CreditNotesTable({ notes }: { notes: CreditNoteListRow[] }) {
  const [query, setQuery] = useState("");
  const [reason, setReason] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return notes.filter((n) => {
      if (reason && n.reason !== reason) return false;
      if (!q) return true;
      return (
        n.credit_note_no.toLowerCase().includes(q) ||
        (n.customerName ?? "").toLowerCase().includes(q) ||
        (n.storeName ?? "").toLowerCase().includes(q) ||
        (n.referenceInvoiceNo ?? "").toLowerCase().includes(q)
      );
    });
  }, [notes, query, reason]);

  return (
    <>
      <div className="flex flex-col gap-2 border-b border-line px-4 py-3 sm:flex-row sm:items-center">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search credit note, customer, store, invoice…"
          className="sm:max-w-[340px]"
        />
        <Select
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="sm:max-w-[180px]"
          aria-label="Filter by reason"
        >
          <option value="">All reasons</option>
          {REASONS.map((r) => (
            <option key={r} value={r}>{REASON_LABEL[r]}</option>
          ))}
        </Select>
        {(query || reason) && (
          <span className="text-[12px] text-ink-4">
            {fmtCount(filtered.length)} of {fmtCount(notes.length)}
          </span>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No matching credit notes"
          description="No credit notes match the current search and filter — clear them to see the full register."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Credit Note</TH>
              <TH>Date</TH>
              <TH>Reason</TH>
              <TH>Customer</TH>
              <TH>Against</TH>
              <TH numeric>Amount</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <TBody>
            {filtered.map((n) => (
              <TR key={n.id} interactive>
                <TD className="p-0">
                  <Link
                    href={`/credit-notes/${n.id}`}
                    className="block px-3 py-2.5 font-mono text-[12px] font-semibold text-brand"
                  >
                    {n.credit_note_no}
                  </Link>
                </TD>
                <TD>{dateIST(n.createdAt)}</TD>
                <TD>
                  <StatusBadge status={n.reason} label={REASON_LABEL[n.reason]} dot={false} />
                </TD>
                <TD>
                  <span className="text-ink">{n.customerName ?? "—"}</span>
                  {n.storeName && (
                    <span className="ml-1.5 text-[11px] text-ink-4">{n.storeName}</span>
                  )}
                </TD>
                <TD>
                  {n.referenceSaleId && n.referenceInvoiceNo ? (
                    <Link
                      href={`/invoices/${n.referenceSaleId}`}
                      className="font-mono text-[12px] hover:text-brand hover:underline"
                    >
                      {n.referenceInvoiceNo}
                    </Link>
                  ) : (
                    "—"
                  )}
                </TD>
                <TD numeric><Money value={n.amount} /></TD>
                <TD><StatusBadge status={n.status} /></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}
