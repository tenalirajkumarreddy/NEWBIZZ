"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select } from "@/components/ui/Field";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { dateIST, count as fmtCount, qty as fmtQty } from "@/lib/format";
import type { ChallanListRow } from "@/lib/data/challans";
import { ChallanRowActions } from "./ChallanRowActions";

const STATUSES = ["printed", "in_transit", "delivered", "cancelled"] as const;

const LABEL: Record<string, string> = {
  printed: "Printed",
  in_transit: "In transit",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export function ChallansTable({ challans }: { challans: ChallanListRow[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return challans.filter((c) => {
      if (status && c.status !== status) return false;
      if (!q) return true;
      return (
        c.challan_no.toLowerCase().includes(q) ||
        (c.orderNo ?? "").toLowerCase().includes(q) ||
        (c.customerName ?? "").toLowerCase().includes(q) ||
        (c.storeName ?? "").toLowerCase().includes(q)
      );
    });
  }, [challans, query, status]);

  return (
    <>
      <div className="flex flex-col gap-2 border-b border-line px-4 py-3 sm:flex-row sm:items-center">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search challan no, order, customer, store…"
          className="sm:max-w-[320px]"
        />
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="sm:max-w-[180px]"
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{LABEL[s]}</option>
          ))}
        </Select>
        {(query || status) && (
          <span className="text-[12px] text-ink-4">
            {fmtCount(filtered.length)} of {fmtCount(challans.length)} challans
          </span>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No matching challans"
          description="No challans match the current search and filter — clear them to see the full register."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Challan No</TH>
              <TH>Printed</TH>
              <TH>Order</TH>
              <TH>Customer</TH>
              <TH>Store</TH>
              <TH numeric>Units</TH>
              <TH>Status</TH>
              <TH className="w-64">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {filtered.map((c) => (
              <TR key={c.id} interactive>
                <TD className="p-0">
                  <Link href={`/challans/${c.id}`} className="block px-3 py-2.5 font-mono text-[12px] font-semibold text-brand">
                    {c.challan_no}
                  </Link>
                </TD>
                <TD>{dateIST(c.printedAt)}</TD>
                <TD>
                  {c.orderNo ? (
                    <Link href={`/orders/${c.orderId}`} className="font-mono text-[12px] hover:text-brand hover:underline">
                      {c.orderNo}
                    </Link>
                  ) : (
                    "—"
                  )}
                </TD>
                <TD>{c.customerName ?? "—"}</TD>
                <TD>{c.storeName ?? "—"}</TD>
                <TD numeric>{fmtQty(c.totalQty)}</TD>
                <TD><StatusBadge status={c.status} /></TD>
                <TD>
                  <ChallanRowActions
                    challanId={c.id}
                    challanNo={c.challan_no}
                    status={c.status}
                    orderId={c.orderId}
                  />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}
