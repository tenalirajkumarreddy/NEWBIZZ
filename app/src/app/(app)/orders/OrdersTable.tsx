"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Money } from "@/components/ui/Money";
import { Input, Select } from "@/components/ui/Field";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { dateIST, count as fmtCount } from "@/lib/format";
import type { OrderListRow } from "@/lib/data/sales";
import { OrderRowActions } from "./OrderRowActions";

const STATUSES = ["draft", "confirmed", "invoiced", "cancelled"] as const;

export function OrdersTable({ orders }: { orders: OrderListRow[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter((o) => {
      if (status && o.status !== status) return false;
      if (!q) return true;
      return (
        o.order_no.toLowerCase().includes(q) ||
        (o.customerName ?? "").toLowerCase().includes(q) ||
        (o.storeName ?? "").toLowerCase().includes(q) ||
        (o.storeCode ?? "").toLowerCase().includes(q)
      );
    });
  }, [orders, query, status]);

  return (
    <>
      <div className="flex flex-col gap-2 border-b border-line px-4 py-3 sm:flex-row sm:items-center">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search order no, customer, store…"
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
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </Select>
        {(query || status) && (
          <span className="text-[12px] text-ink-4">
            {fmtCount(filtered.length)} of {fmtCount(orders.length)} orders
          </span>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No matching orders"
          description="No orders match the current search and filter — clear them to see the full register."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Order No</TH>
              <TH>Date</TH>
              <TH>Store</TH>
              <TH>Customer</TH>
              <TH numeric>Lines</TH>
              <TH numeric>Net Value</TH>
              <TH>Status</TH>
              <TH className="w-56">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {filtered.map((o) => (
              <TR key={o.id} interactive>
                <TD className="p-0">
                  <Link href={`/orders/${o.id}`} className="block px-3 py-2.5 font-mono text-[12px] font-semibold text-brand">
                    {o.order_no}
                  </Link>
                </TD>
                <TD>{dateIST(o.order_date)}</TD>
                <TD>
                  <span className="font-medium text-ink">{o.storeName ?? "—"}</span>
                  {o.storeCode && (
                    <span className="ml-1.5 font-mono text-[11px] text-ink-4">{o.storeCode}</span>
                  )}
                </TD>
                <TD>
                  {o.customerId ? (
                    <Link href={`/customers/${o.customerId}`} className="hover:text-brand hover:underline">
                      {o.customerName ?? "—"}
                    </Link>
                  ) : (
                    o.customerName ?? "—"
                  )}
                </TD>
                <TD numeric>{fmtCount(o.lineCount)}</TD>
                <TD numeric><Money value={o.netValue} /></TD>
                <TD><StatusBadge status={o.status} /></TD>
                <TD>
                  <OrderRowActions orderId={o.id} orderNo={o.order_no} status={o.status} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}
