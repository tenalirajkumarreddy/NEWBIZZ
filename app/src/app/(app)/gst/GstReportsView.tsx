"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Panel, Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { Money } from "@/components/ui/Money";
import { dateIST, count as fmtCount, qty as fmtQty } from "@/lib/format";
import type {
  Gstr1Summary,
  Gstr3bSummary,
  HsnRow,
  SalesRegisterRow,
  PurchaseRegisterRow,
} from "@/lib/data/gst";

type Tab = "gstr1" | "gstr3b" | "hsn" | "sales" | "purchase";

const TABS: { id: Tab; label: string }[] = [
  { id: "gstr1", label: "GSTR-1" },
  { id: "gstr3b", label: "GSTR-3B" },
  { id: "hsn", label: "HSN Summary" },
  { id: "sales", label: "Sales Register" },
  { id: "purchase", label: "Purchase Register" },
];

export function GstReportsView({
  period,
  gstr1,
  gstr3b,
  hsn,
  sales,
  purchases,
}: {
  period: string;
  gstr1: Gstr1Summary;
  gstr3b: Gstr3bSummary;
  hsn: HsnRow[];
  sales: SalesRegisterRow[];
  purchases: PurchaseRegisterRow[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("gstr1");

  function setPeriod(p: string) {
    if (/^\d{4}-\d{2}$/.test(p)) router.push(`/gst?period=${p}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-lg bg-fill p-1 ring-1 ring-inset ring-line">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={
                "rounded-md px-3 py-1.5 text-[12px] font-semibold transition-colors " +
                (tab === t.id ? "bg-surface text-ink shadow-sm ring-1 ring-line" : "text-ink-3 hover:text-ink")
              }
            >
              {t.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-[12px] text-ink-3">
          Period
          <Input type="month" defaultValue={period} onChange={(e) => setPeriod(e.target.value)} className="w-40" />
        </label>
      </div>

      {tab === "gstr1" && <Gstr1View s={gstr1} />}
      {tab === "gstr3b" && <Gstr3bView s={gstr3b} />}
      {tab === "hsn" && <HsnView rows={hsn} />}
      {tab === "sales" && <SalesView rows={sales} />}
      {tab === "purchase" && <PurchaseView rows={purchases} />}
    </div>
  );
}

function Gstr1View({ s }: { s: Gstr1Summary }) {
  const buckets = [s.b2b, s.b2c, s.total];
  if (s.total.invoiceCount === 0) {
    return <Panel flush><EmptyState title="No outward supplies this period" description="Recorded sales appear here split into B2B (registered customers) and B2C." /></Panel>;
  }
  return (
    <Panel title="GSTR-1 — Outward supplies" flush>
      <Table>
        <THead>
          <TR>
            <TH>Category</TH>
            <TH numeric>Invoices</TH>
            <TH numeric>Taxable</TH>
            <TH numeric>CGST</TH>
            <TH numeric>SGST</TH>
            <TH numeric>IGST</TH>
            <TH numeric>Cess</TH>
          </TR>
        </THead>
        <TBody>
          {buckets.map((b) => (
            <TR key={b.label} className={b.label === "Total" ? "font-semibold" : ""}>
              <TD>{b.label}</TD>
              <TD numeric>{fmtCount(b.invoiceCount)}</TD>
              <TD numeric><Money value={b.taxable} /></TD>
              <TD numeric><Money value={b.cgst} /></TD>
              <TD numeric><Money value={b.sgst} /></TD>
              <TD numeric><Money value={b.igst} /></TD>
              <TD numeric><Money value={b.cess} /></TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </Panel>
  );
}

function Gstr3bView({ s }: { s: Gstr3bSummary }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="p-4">
          <div className="eyebrow text-ink-4">Output tax (on sales)</div>
          <dl className="mt-2 flex flex-col gap-1.5 text-[13px]">
            <Row label="CGST" value={s.outputCgst} />
            <Row label="SGST" value={s.outputSgst} />
            <Row label="IGST" value={s.outputIgst} />
            {s.outputCess > 0 && <Row label="Cess" value={s.outputCess} />}
            <div className="mt-1 flex items-center justify-between border-t border-line pt-1.5 font-semibold">
              <dt className="text-ink">Total output</dt>
              <dd className="font-mono tnum text-ink"><Money value={s.outputTotal} /></dd>
            </div>
          </dl>
        </Card>
        <Card className="p-4">
          <div className="eyebrow text-ink-4">Input tax credit (on purchases)</div>
          <dl className="mt-2 flex flex-col gap-1.5 text-[13px]">
            <Row label="CGST" value={s.itcCgst} />
            <Row label="SGST" value={s.itcSgst} />
            <Row label="IGST" value={s.itcIgst} />
            {s.itcCess > 0 && <Row label="Cess" value={s.itcCess} />}
            <div className="mt-1 flex items-center justify-between border-t border-line pt-1.5 font-semibold">
              <dt className="text-ink">Total ITC</dt>
              <dd className="font-mono tnum text-ink"><Money value={s.itcTotal} /></dd>
            </div>
          </dl>
        </Card>
      </div>
      <Card className="flex items-center justify-between p-4">
        <div className="text-[13px] font-semibold text-ink">Net GST payable (output − ITC)</div>
        <div className={"font-mono text-[18px] font-bold tnum " + (s.netPayable >= 0 ? "text-amb" : "text-grn")}>
          <Money value={s.netPayable} />
        </div>
      </Card>
      <p className="text-[11px] text-ink-4">
        ITC shown is the full recorded input tax. The safely-claimable amount is what reconciles against GSTR-2B — see the 2B reconciliation.
      </p>
    </div>
  );
}

function HsnView({ rows }: { rows: HsnRow[] }) {
  if (rows.length === 0) {
    return <Panel flush><EmptyState title="No HSN activity this period" description="HSN-wise taxable value and tax build from the sale lines once invoices are raised." /></Panel>;
  }
  return (
    <Panel title="HSN Summary" flush>
      <Table>
        <THead>
          <TR>
            <TH>HSN</TH>
            <TH>Item</TH>
            <TH numeric>Qty</TH>
            <TH numeric>Taxable</TH>
            <TH numeric>CGST</TH>
            <TH numeric>SGST</TH>
            <TH numeric>IGST</TH>
            <TH numeric>Cess</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((h) => (
            <TR key={h.hsn}>
              <TD className="font-mono text-[12px]">{h.hsn}</TD>
              <TD>{h.itemName ?? "—"}</TD>
              <TD numeric>{fmtQty(h.qty)}</TD>
              <TD numeric><Money value={h.taxable} /></TD>
              <TD numeric><Money value={h.cgst} /></TD>
              <TD numeric><Money value={h.sgst} /></TD>
              <TD numeric><Money value={h.igst} /></TD>
              <TD numeric><Money value={h.cess} /></TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </Panel>
  );
}

function SalesView({ rows }: { rows: SalesRegisterRow[] }) {
  if (rows.length === 0) {
    return <Panel flush><EmptyState title="No sales this period" description="Every non-void invoice for the month appears here with its tax split." /></Panel>;
  }
  return (
    <Panel title={`Sales Register · ${fmtCount(rows.length)} invoices`} flush>
      <Table>
        <THead>
          <TR>
            <TH>Invoice</TH>
            <TH>Date</TH>
            <TH>Customer</TH>
            <TH>GSTIN</TH>
            <TH numeric>Taxable</TH>
            <TH numeric>Tax</TH>
            <TH numeric>Total</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((r) => (
            <TR key={r.id}>
              <TD className="font-mono text-[12px] font-semibold text-ink">{r.invoiceNo}</TD>
              <TD>{dateIST(r.invoiceDate)}</TD>
              <TD>{r.customerName ?? "—"}</TD>
              <TD className="font-mono text-[11px] text-ink-3">{r.customerGstin ?? "B2C"}</TD>
              <TD numeric><Money value={r.taxable} /></TD>
              <TD numeric><Money value={r.cgst + r.sgst + r.igst + r.cess} /></TD>
              <TD numeric><Money value={r.total} /></TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </Panel>
  );
}

function PurchaseView({ rows }: { rows: PurchaseRegisterRow[] }) {
  if (rows.length === 0) {
    return <Panel flush><EmptyState title="No purchases this period" description="Every non-void supplier bill for the month appears here with its input tax." /></Panel>;
  }
  return (
    <Panel title={`Purchase Register · ${fmtCount(rows.length)} bills`} flush>
      <Table>
        <THead>
          <TR>
            <TH>Bill</TH>
            <TH>Vendor Bill</TH>
            <TH>Date</TH>
            <TH>Supplier</TH>
            <TH>GSTIN</TH>
            <TH numeric>Taxable</TH>
            <TH numeric>ITC</TH>
            <TH numeric>Total</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((r) => (
            <TR key={r.id}>
              <TD className="font-mono text-[12px] font-semibold text-ink">{r.billNo}</TD>
              <TD className="font-mono text-[11px] text-ink-3">{r.supplierBillNo ?? "—"}</TD>
              <TD>{dateIST(r.billDate)}</TD>
              <TD>{r.supplierName ?? "—"}</TD>
              <TD className="font-mono text-[11px] text-ink-3">{r.supplierGstin ?? "—"}</TD>
              <TD numeric><Money value={r.taxable} /></TD>
              <TD numeric><Money value={r.cgst + r.sgst + r.igst + r.cess} /></TD>
              <TD numeric><Money value={r.total} /></TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </Panel>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-ink-3">{label}</dt>
      <dd className="font-mono tnum text-ink"><Money value={value} /></dd>
    </div>
  );
}
