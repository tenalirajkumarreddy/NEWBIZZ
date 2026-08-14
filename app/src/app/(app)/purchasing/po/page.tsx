import Link from "next/link";
import { listPurchaseOrders } from "@/lib/data/purchases";
import { listSupplierOptions } from "@/lib/data/suppliers";
import { listStockableItems } from "@/lib/data/stock";
import { Panel } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Money } from "@/components/ui/Money";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { PageContainer, PageHeader } from "@/components/ui";
import { dateIST, count as fmtCount } from "@/lib/format";
import { CreatePoActions } from "./CreatePoActions";

export default async function PurchaseOrdersPage() {
  const pos = await listPurchaseOrders({ limit: 200 });
  const [suppliers, items] = await Promise.all([listSupplierOptions(), listStockableItems()]);

  return (
    <PageContainer width="full">
      <PageHeader
        title="Purchase Orders"
        subtitle={`${fmtCount(pos.length)} orders`}
        backHref="/purchasing"
        backLabel="Purchasing"
        actions={<CreatePoActions suppliers={suppliers} items={items} />}
      />

      <Panel flush>
        {pos.length === 0 ? (
          <EmptyState
            title="No purchase orders yet"
            description="Raise a PO to record intent to buy. Receiving against it books stock; billing books the payable."
            action={<CreatePoActions suppliers={suppliers} items={items} />}
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
    </PageContainer>
  );
}
