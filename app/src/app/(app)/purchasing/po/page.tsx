import Link from "next/link";
import { listPurchaseOrders } from "@/lib/data/purchases";
import { Panel } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Money } from "@/components/ui/Money";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { dateIST, count as fmtCount } from "@/lib/format";

export default async function PurchaseOrdersPage() {
  const pos = await listPurchaseOrders({ limit: 200 });

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-6 py-6 lg:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/purchasing" className="text-[12px] font-medium text-ink-4 hover:text-brand">← Purchasing</Link>
          <h1 className="mt-1 text-[22px] font-bold tracking-tight text-ink">Purchase Orders</h1>
          <p className="mt-0.5 text-[13px] text-ink-3">{fmtCount(pos.length)} orders</p>
        </div>
        <Link href="/purchasing/po/new"><Button variant="primary" size="sm">New PO</Button></Link>
      </div>

      <Panel flush>
        {pos.length === 0 ? (
          <EmptyState
            title="No purchase orders yet"
            description="Raise a PO to record intent to buy. Receiving against it books stock; billing books the payable."
            action={<Link href="/purchasing/po/new"><Button variant="secondary" size="sm">New PO</Button></Link>}
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>PO No</TH>
                <TH>Date</TH>
                <TH>Supplier</TH>
                <TH>Expected</TH>
                <TH numeric>Value</TH>
                <TH numeric>Lines</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {pos.map((p) => (
                <TR key={p.id} interactive>
                  <TD className="p-0">
                    <Link href={`/purchasing/po/${p.id}`} className="block px-3 py-2.5 font-mono text-[12px] font-semibold text-brand">{p.poNo}</Link>
                  </TD>
                  <TD>{dateIST(p.poDate)}</TD>
                  <TD className="font-medium text-ink">{p.supplierName ?? "—"}</TD>
                  <TD>{p.expectedDate ? dateIST(p.expectedDate) : "—"}</TD>
                  <TD numeric><Money value={p.netValue} /></TD>
                  <TD numeric>{fmtCount(p.lineCount)}</TD>
                  <TD><StatusBadge status={p.status} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Panel>
    </div>
  );
}
