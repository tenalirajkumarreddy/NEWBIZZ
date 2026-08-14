import Link from "next/link";
import { listGrns } from "@/lib/data/purchases";
import { listSupplierOptions } from "@/lib/data/suppliers";
import { listStockableItems } from "@/lib/data/stock";
import { Panel } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Money } from "@/components/ui/Money";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { PageContainer, PageHeader } from "@/components/ui";
import { dateIST, count as fmtCount } from "@/lib/format";
import { ReceiveGoodsActions } from "./ReceiveGoodsActions";

export default async function GrnsPage() {
  const grns = await listGrns({ limit: 200 });
  const [suppliers, items] = await Promise.all([listSupplierOptions(), listStockableItems()]);

  return (
    <PageContainer width="full">
      <PageHeader
        title="Goods Receipts"
        subtitle={`${fmtCount(grns.length)} GRNs · stock in at cost`}
        backHref="/purchasing"
        backLabel="Purchasing"
        actions={<ReceiveGoodsActions suppliers={suppliers} items={items} />}
      />

      <Panel flush>
        {grns.length === 0 ? (
          <EmptyState
            title="No goods receipts yet"
            description="A GRN books received goods into stock at cost (Dr inventory / Cr GRN clearing). Bill it later to book GST and the payable."
            action={<ReceiveGoodsActions suppliers={suppliers} items={items} />}
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>GRN No</TH>
                <TH>Date</TH>
                <TH>Supplier</TH>
                <TH>From PO</TH>
                <TH numeric>Goods value</TH>
                <TH>Status</TH>
                <TH>Bill</TH>
              </TR>
            </THead>
            <TBody>
              {grns.map((g) => (
                <TR key={g.id} interactive>
                  <TD className="p-0">
                    <Link href={`/purchasing/grn/${g.id}`} className="block px-3 py-2.5 font-mono text-[12px] font-semibold text-brand">{g.grnNo}</Link>
                  </TD>
                  <TD>{dateIST(g.grnDate)}</TD>
                  <TD className="font-medium text-ink">{g.supplierName ?? "—"}</TD>
                  <TD className="font-mono text-[12px] text-ink-3">{g.poNo ?? "—"}</TD>
                  <TD numeric><Money value={g.goodsValue} /></TD>
                  <TD><StatusBadge status={g.status} /></TD>
                  <TD>
                    {g.billedBillId ? (
                      <Link href={`/purchasing/bills/${g.billedBillId}`} className="text-[12px] font-medium text-brand hover:underline">View bill →</Link>
                    ) : (
                      <span className="text-[12px] text-amb">Unbilled</span>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Panel>
    </PageContainer>
  );
}
