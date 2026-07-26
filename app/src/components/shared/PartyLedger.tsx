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

export interface PrintStatementInfo {
  label: string;
  value: string;
}

export interface PrintStatement {
  imageUrl?: string | null;
  title: string;
  entityName: string;
  entityCode: string;
  subtitle?: string;
  info: PrintStatementInfo[];
  aging?: { bucket: string; amount: number }[];
  outstanding?: number;
}

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
  printStatement,
}: {
  rows: ActivityRow[];
  title?: string;
  filename?: string;
  showStore?: boolean;
  printStatement?: PrintStatement;
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

  function onPrint() {
    const w = window.open("", "_blank");
    if (!w) return;
    const ps = printStatement;
    const today = new Date().toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" });
    const opening = rows.length > 0 ? rows[0].balance - rows[0].debit + rows[0].credit : 0;

    // ── Entity card (image + identity + info grid) ───────────────────────────
    const imageHtml = ps?.imageUrl
      ? `<img src="${ps.imageUrl}" alt="" style="width:96px;height:96px;object-fit:cover;border-radius:16px;border:1px solid rgba(17,24,39,0.06);box-shadow:0 4px 12px rgba(17,24,39,0.08;" />`
      : `<div style="width:96px;height:96px;border-radius:16px;background:linear-gradient(135deg,#f1f5f9,#e2e8f0);display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:700;color:#64748b;letter-spacing:-1px;border:1px solid rgba(17,24,39,0.06);">${(ps?.entityName ?? "?").split(/\s+/).slice(0, 2).map((x) => x[0]?.toUpperCase() ?? "").join("")}</div>`;

    const infoCards = (ps?.info ?? [])
      .map(
        (m) => `<div>
          <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#7a8294;">${m.label}</div>
          <div style="margin-top:1px;font-size:12px;font-weight:600;color:#111827;${/GSTIN|PAN|Code|State/.test(m.label) ? "font-family:'SF Mono',Menlo,monospace;" : ""}">${m.value || "—"}</div>
        </div>`,
      )
      .join("");

    // ── Aging strip (optional, customer only) ───────────────────────────────
    const agingHtml =
      ps?.aging && ps.aging.length > 0
        ? `<div style="margin-top:14px;">
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color="#7a8294;margin-bottom:8px;">Receivable aging · all stores</div>
            <div style="display:grid;grid-template-columns:repeat(${Math.min(ps.aging.length, 5)}, 1fr);gap:8px;">
              ${ps.aging
                .map((a) => {
                  const isOld = a.bucket === "61-90" || a.bucket === "90+";
                  const isOverdue = a.bucket === "90+";
                  return `<div style="padding:10px 12px;border-radius:10px;background:${isOverdue ? "#fef2f2" : isOld ? "#fffbeb" : "#f8fafc"};border:1px solid ${isOverdue ? "#fecaca" : isOld ? "#fde68a" : "#eceef1"};">
                    <div style="font-size:10px;font-weight:600;color:${isOverdue ? "#b91c1c" : isOld ? "#b45309" : "#7a8294"};">${a.bucket === "current" ? "Not due" : a.bucket}</div>
                    <div style="margin-top:2px;font-size:14px;font-weight:700;font-family:'SF Mono',Menlo,monospace;color:${isOverdue ? "#b91c1c" : "#111827"};">₹${Number(a.amount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                  </div>`;
                })
                .join("")}
            </div>
          </div>`
        : "";

    // ── Outstanding highlight card (optional) ─────────────────────────────────
    const outstandingHtml =
      ps?.outstanding !== undefined && ps.outstanding > 0
        ? `<div style="margin-top:14px;padding:16px 18px;background:linear-gradient(135deg,#fef3c7,#fde68a);border:1px solid #fcd34d;border-radius:12px;display:flex;align-items:center;justify-content:space-between;">
            <div>
              <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#92400e;">Total outstanding</div>
              <div style="margin-top:2px;font-size:11px;color:#78350f;">As of ${today}</div>
            </div>
            <div style="font-size:22px;font-weight:800;font-family:'SF Mono',Menlo,monospace;color:#78350f;">₹${ps.outstanding.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>`
        : "";

    // ── Ledger rows ──────────────────────────────────────────────────────────
    const tableRows = rows
      .map(
        (r, i) => {
          const kindColor: Record<string, string> = {
            invoice: "#6366f1", receipt: "#16a34a", credit_note: "#d97706", order: "#64748b", visit: "#64748b",
          };
          const kc = kindColor[r.kind] ?? "#64748b";
          return `<tr style="${i % 2 === 0 ? "background:#fafbfc;" : ""}">
            <td style="padding:10px 8px;font-size:11px;white-space:nowrap;color:#374151;border-bottom:1px solid #f1f3f5;">${dateIST(r.eventDate)}</td>
            <td style="padding:10px 8px;border-bottom:1px solid #f1f3f5;"><span style="display:inline-block;padding:2px 8px;font-size:10px;font-weight:600;border-radius:99px;background:${kc}1a;color:${kc};">${KIND_LABEL[r.kind]}</span></td>
            <td style="padding:10px 8px;font-size:11px;font-family:'SF Mono',Menlo,monospace;color:#374151;border-bottom:1px solid #f1f3f5;">${r.refNo ?? "—"}</td>
            ${showStore ? `<td style="padding:10px 8px;font-size:11px;color:#6b7280;border-bottom:1px solid #f1f3f5;">${r.storeName ?? "—"}</td>` : ""}
            <td style="padding:10px 8px;font-size:11px;color:#374151;border-bottom:1px solid #f1f3f5;">${r.description}</td>
            <td style="padding:10px 8px;font-size:11px;text-align:right;font-family:'SF Mono',Menlo,monospace;font-weight:600;color:#111827;border-bottom:1px solid #f1f3f5;">${r.debit ? r.debit.toLocaleString("en-IN", { minimumFractionDigits: 2 }) : "—"}</td>
            <td style="padding:10px 8px;font-size:11px;text-align:right;font-family:'SF Mono',Menlo,monospace;font-weight:600;color:#16a34a;border-bottom:1px solid #f1f3f5;">${r.credit ? r.credit.toLocaleString("en-IN", { minimumFractionDigits: 2 }) : "—"}</td>
            <td style="padding:10px 8px;font-size:11px;text-align:right;font-family:'SF Mono',Menlo,monospace;font-weight:700;color:${r.balance >= 0 ? "#111827" : "#16a34a"};border-bottom:1px solid #f1f3f5;white-space:nowrap;">${Math.abs(r.balance).toLocaleString("en-IN", { minimumFractionDigits: 2 })} <span style="font-size:9px;font-weight:600;color:#7a8294;">${r.balance >= 0 ? "Dr" : "Cr"}</span></td>
          </tr>`;
        },
      )
      .join("");

    // ── Summary cards ─────────────────────────────────────────────────────────
    const summaryCards = [
      { label: "Opening balance", value: `${Math.abs(opening).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, cr: opening < 0 },
      { label: "Total billed (debit)", value: totalDebit.toLocaleString("en-IN", { minimumFractionDigits: 2 }), accent: "indigo" },
      { label: "Total paid (credit)", value: totalCredit.toLocaleString("en-IN", { minimumFractionDigits: 2 }), accent: "green" },
      { label: "Closing balance", value: Math.abs(closing).toLocaleString("en-IN", { minimumFractionDigits: 2 }), cr: closing < 0, primary: true },
    ];

    const summaryHtml = `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:18px 0;">
      ${summaryCards
        .map(
          (s) => `<div style="padding:14px 16px;border-radius:12px;${s.primary ? "background:linear-gradient(135deg,#111827,#1f2937);color:#fff;" : "background:#fff;border:1px solid #eceef1;"}">
            <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.6px;${s.primary ? "color:rgba(255,255,255,0.7);" : "color:#7a8294;"}">${s.label}</div>
            <div style="margin-top:6px;font-size:18px;font-weight:700;font-family:'SF Mono',Menlo,monospace;${s.primary ? "color:#fff;" : s.accent === "green" ? "color:#16a34a;" : s.accent === "indigo" ? "color:#6366f1;" : "color:#111827;"}">₹${s.value} <span style="font-size:11px;font-weight:600;${s.primary ? "color:rgba(255,255,255,0.6);" : "color:#7a8294;"}">${s.cr ? "Cr" : "Dr"}</span></div>
          </div>`,
        )
        .join("")}
    </div>`;

    // ── Top-level title block ─────────────────────────────────────────────────
    const titleBlock = ps
      ? `<div style="display:flex;align-items:flex-start;gap:18px;">
          ${imageHtml}
          <div style="flex:1;">
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:#6366f1;">${ps.title}</div>
            <div style="margin-top:4px;font-size:22px;font-weight:800;color:#111827;letter-spacing:-0.4px;">${ps.entityName}</div>
            <div style="margin-top:2px;font-size:13px;color:#7a8294;">${ps.subtitle ? `${ps.subtitle} · ` : ""}<span style="font-family:'SF Mono',Menlo,monospace;">${ps.entityCode}</span></div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.6px;color:#7a8294;">Statement date</div>
            <div style="margin-top:4px;font-size:13px;font-weight:600;color:#111827;">${today}</div>
            <div style="margin-top:8px;font-size:10px;color:#7a8294;">${rows.length} transactions</div>
          </div>
        </div>`
      : `<div><div style="font-size:22px;font-weight:800;color:#111827;letter-spacing:-0.4px;">${title}</div><div style="margin-top:4px;font-size:13px;color:#7a8294;">Generated ${today}</div></div>`;

    w.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${ps ? `${ps.title} · ${ps.entityName}` : title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600;700&display=swap" rel="stylesheet">
  <style>
    @page { size: A4; margin: 18mm 16mm; }
    * { box-sizing: border-box; }
    body { font-family: "Plus Jakarta Sans", -apple-system, "Segoe UI", Roboto, sans-serif; color: #111827; line-height: 1.5; margin: 0; padding: 32px; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .doc { max-width: 720px; margin: 0 auto; }
    .doc-header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 20px; margin-bottom: 24px; border-bottom: 2px solid #111827; }
    .brand-name { font-size: 13px; font-weight: 800; letter-spacing: 1.5px; color: #111827; text-transform: uppercase; }
    .brand-tag { font-size: 10px; color: #7a8294; margin-top: 2px; }
    .entity-card { padding: 20px; background: linear-gradient(135deg, #f8fafc, #f1f5f9); border: 1px solid #eceef1; border-radius: 16px; margin-bottom: 16px; }
    .info-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; row-gap: 10px; margin-top: 14px; }
    table.ledger { width: 100%; border-collapse: collapse; margin: 16px 0; }
    table.ledger th { padding: 10px 8px; text-align: left; font-size: 10px; font-weight: 700; color: #7a8294; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #111827; }
    table.ledger th.right { text-align: right; }
    .footer { margin-top: 28px; padding-top: 14px; border-top: 1px solid #eceef1; display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: #7a8294; }
    .footer .note { font-style: italic; }
    .no-print { text-align: center; margin-top: 28px; }
    .btn-print { padding: 12px 28px; background: #111827; color: #fff; border: none; border-radius: 10px; font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 12px rgba(17,24,39,0.15); }
    .btn-print:hover { background: #1f2937; }
    @media print { .no-print { display: none; } body { padding: 0; background: #fff; } }
  </style>
</head>
<body>
  <div class="doc">
    <div class="doc-header">
      <div>
        <div class="brand-name">NEWBIZZ</div>
        <div class="brand-tag">Business Management Suite</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:10px;font-weight:600;color:#7a8294;">${ps ? ps.title : title}</div>
        <div style="font-size:11px;color:#111827;font-family:'JetBrains Mono',monospace;margin-top:2px;">${ps ? `${ps.entityCode}-${new Date().toISOString().slice(0, 10)}` : ""}</div>
      </div>
    </div>

    <div class="entity-card">
      ${titleBlock}
      ${infoCards ? `<div class="info-grid">${infoCards}</div>` : ""}
      ${outstandingHtml}
      ${agingHtml}
    </div>

    ${summaryHtml}

    <table class="ledger">
      <thead>
        <tr>
          <th>Date</th><th>Type</th><th>Reference</th>${showStore ? "<th>Store</th>" : ""}<th>Description</th><th class="right">Debit</th><th class="right">Credit</th><th class="right">Balance</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>

    <div class="footer">
      <div class="note">This is a computer-generated statement and does not require a physical signature.</div>
      <div>${rows.length} entries · ${today}</div>
    </div>
  </div>
  <div class="no-print">
    <button class="btn-print" onclick="window.print()">Print / Save as PDF</button>
  </div>
  <script>window.onload = function() { setTimeout(function() { window.print(); }, 600); };</script>
</body>
</html>`);
    w.document.close();
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
          <Button variant="ghost" size="sm" onClick={onPrint} disabled={rows.length === 0}>
            Print PDF
          </Button>
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
