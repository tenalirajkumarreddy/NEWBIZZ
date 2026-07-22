"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Panel } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Field";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { Money } from "@/components/ui/Money";
import { dateIST, money, count as fmtCount } from "@/lib/format";
import type { ActivityRow, ActivityKind } from "@/lib/data/customers";

const KIND_LABEL: Record<ActivityKind, string> = {
  invoice: "Sale",
  receipt: "Payment",
  credit_note: "Credit note",
  order: "Order",
  visit: "Visit",
};

const KIND_TONE: Record<ActivityKind, "brand" | "grn" | "amb" | "slate" | "neutral"> = {
  invoice: "brand",
  receipt: "grn",
  credit_note: "amb",
  order: "neutral",
  visit: "slate",
};

// Link an activity row to its source document where one exists.
function hrefFor(r: ActivityRow): string | null {
  switch (r.kind) {
    case "invoice":
      return r.refId ? `/invoices/${r.refId}` : null;
    case "receipt":
      return r.refId ? `/receipts` : null;
    case "credit_note":
      return r.refId ? `/credit-notes/${r.refId}` : null;
    case "order":
      return r.refId ? `/orders/${r.refId}` : null;
    default:
      return null;
  }
}

function toCsv(rows: ActivityRow[], showStore: boolean): string {
  const head = ["Date", "Type", "Reference", ...(showStore ? ["Store"] : []), "Description", "Debit", "Credit", "Balance", "Status"];
  const lines = rows.map((r) =>
    [
      r.eventDate,
      KIND_LABEL[r.kind],
      r.refNo ?? "",
      ...(showStore ? [r.storeName ?? ""] : []),
      r.description.replace(/,/g, ";"),
      r.debit ? r.debit.toFixed(2) : "",
      r.credit ? r.credit.toFixed(2) : "",
      r.balance.toFixed(2),
      r.status ?? "",
    ].join(","),
  );
  return [head.join(","), ...lines].join("\n");
}

export function PartyLedger({
  rows,
  title = "Ledger",
  filename = "ledger",
  showStore = true,
}: {
  rows: ActivityRow[];
  title?: string;
  filename?: string;
  showStore?: boolean;
}) {
  const [kind, setKind] = useState<string>("");

  const filtered = useMemo(() => (kind ? rows.filter((r) => r.kind === kind) : rows), [rows, kind]);

  // Totals (over the full ledger, not the filtered view).
  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  const closing = rows.length ? rows[rows.length - 1].balance : 0;

  function onExport() {
    const csv = toCsv(filtered, showStore);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Panel
      title={title}
      subtitle="Sales, payments, credit notes, orders and visits — newest at the bottom"
      actions={
        <div className="flex items-center gap-2">
          <Select value={kind} onChange={(e) => setKind(e.target.value)} className="h-8 w-36 text-[12px]" aria-label="Filter by type">
            <option value="">All activity</option>
            <option value="invoice">Sales</option>
            <option value="receipt">Payments</option>
            <option value="credit_note">Credit notes</option>
            <option value="order">Orders</option>
            <option value="visit">Visits</option>
          </Select>
          <Button variant="ghost" size="sm" onClick={onExport} disabled={filtered.length === 0}>
            Export CSV
          </Button>
        </div>
      }
      flush
    >
      {rows.length === 0 ? (
        <EmptyState
          title="No activity yet"
          description="Sales, payments, credit notes, orders and visits will appear here in date order, with a running balance."
        />
      ) : (
        <>
          <Table>
            <THead>
              <TR>
                <TH>Date</TH>
                <TH>Type</TH>
                <TH>Reference</TH>
                {showStore && <TH>Store</TH>}
                <TH>Description</TH>
                <TH numeric>Debit</TH>
                <TH numeric>Credit</TH>
                <TH numeric>Balance</TH>
              </TR>
            </THead>
            <TBody>
              {filtered.map((r, i) => {
                const href = hrefFor(r);
                return (
                  <TR key={`${r.kind}-${r.refId ?? i}-${i}`}>
                    <TD className="whitespace-nowrap">{dateIST(r.eventDate)}</TD>
                    <TD><Badge tone={KIND_TONE[r.kind]} size="sm">{KIND_LABEL[r.kind]}</Badge></TD>
                    <TD className="font-mono text-[12px]">
                      {href && r.refNo ? (
                        <Link href={href} className="font-semibold text-brand hover:underline">{r.refNo}</Link>
                      ) : (
                        r.refNo ?? "—"
                      )}
                    </TD>
                    {showStore && <TD className="text-[12px] text-ink-3">{r.storeName ?? "—"}</TD>}
                    <TD className="text-ink-2">{r.description}</TD>
                    <TD numeric>{r.debit ? <Money value={r.debit} /> : "—"}</TD>
                    <TD numeric className={r.credit ? "text-grn" : ""}>{r.credit ? <Money value={r.credit} /> : "—"}</TD>
                    <TD numeric className="font-mono font-semibold tnum">
                      {money(Math.abs(r.balance))} {r.balance >= 0 ? "Dr" : "Cr"}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-[12px]">
            <span className="text-ink-4">
              {fmtCount(filtered.length)}{kind ? ` of ${fmtCount(rows.length)}` : ""} entries
            </span>
            <div className="flex items-center gap-4">
              <span className="text-ink-3">Billed <span className="font-mono font-semibold text-ink tnum"><Money value={totalDebit} /></span></span>
              <span className="text-ink-3">Paid/credited <span className="font-mono font-semibold text-grn tnum"><Money value={totalCredit} /></span></span>
              <span className="font-semibold text-ink">Closing <span className="font-mono tnum">{money(Math.abs(closing))} {closing >= 0 ? "Dr" : "Cr"}</span></span>
            </div>
          </div>
        </>
      )}
    </Panel>
  );
}
