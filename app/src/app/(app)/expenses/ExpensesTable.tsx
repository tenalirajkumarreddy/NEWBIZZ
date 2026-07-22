"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select } from "@/components/ui/Field";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { Money } from "@/components/ui/Money";
import { dateIST, count as fmtCount, titleCase } from "@/lib/format";
import type { ExpenseRow } from "@/lib/data/expenses";

const SOURCE_LABEL: Record<string, string> = {
  user_holding: "User custody",
  petty_cash: "Petty cash",
  bank: "Bank",
};

export function ExpensesTable({ expenses }: { expenses: ExpenseRow[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return expenses.filter((e) => {
      if (status && e.status !== status) return false;
      if (!q) return true;
      return (
        e.expenseNo.toLowerCase().includes(q) ||
        (e.accountName ?? "").toLowerCase().includes(q) ||
        (e.userName ?? "").toLowerCase().includes(q) ||
        (e.note ?? "").toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q)
      );
    });
  }, [expenses, query, status]);

  return (
    <>
      <div className="flex flex-col gap-2 border-b border-line px-4 py-3 sm:flex-row sm:items-center">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search expense no, account, user, note…"
          className="sm:max-w-[320px]"
        />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="sm:max-w-[180px]" aria-label="Filter by status">
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </Select>
        {(query || status) && (
          <span className="text-[12px] text-ink-4">{fmtCount(filtered.length)} of {fmtCount(expenses.length)}</span>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No matching expenses" description="Clear the search and filter to see the full register." />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Expense No</TH>
              <TH>Date</TH>
              <TH>Category</TH>
              <TH>Account</TH>
              <TH>Source</TH>
              <TH numeric>Amount</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <TBody>
            {filtered.map((e) => (
              <TR key={e.id} interactive>
                <TD className="p-0">
                  <Link href={`/expenses/${e.id}`} className="block px-3 py-2.5 font-mono text-[12px] font-semibold text-brand">
                    {e.expenseNo}
                  </Link>
                </TD>
                <TD>{dateIST(e.expenseDate)}</TD>
                <TD className="text-[12px]">{titleCase(e.category)}</TD>
                <TD>
                  <span className="text-ink">{e.accountName ?? e.accountCode}</span>
                  <span className="ml-1.5 font-mono text-[11px] text-ink-4">{e.accountCode}</span>
                </TD>
                <TD className="text-[12px] text-ink-3">
                  {SOURCE_LABEL[e.source] ?? e.source}
                  {e.userName ? <span className="ml-1 text-ink-4">· {e.userName}</span> : null}
                </TD>
                <TD numeric><Money value={e.amount} /></TD>
                <TD><StatusBadge status={e.status} /></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}
