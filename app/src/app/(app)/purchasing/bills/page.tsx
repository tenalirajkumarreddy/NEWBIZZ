import Link from "next/link";
import { listBills } from "@/lib/data/purchases";
import { Panel } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Money } from "@/components/ui/Money";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { dateIST, count as fmtCount } from "@/lib/format";

export default async function BillsPage() {
  const bills = await listBills({ limit: 200 });
  const open = bills.filter((b) => b.status === "posted" || b.status === "part_paid");
  const payable = open.reduce((s, b) => s + (b.grandTotal - b.amountPaid), 0);

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-6 py-6 lg:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/purchasing" className="text-[12px] font-medium text-ink-4 hover:text-brand">← Purchasing</Link>
          <h1 className="mt-1 text-[22px] font-bold tracking-tight text-ink">Supplier Bills</h1>
          <p className="mt-0.5 text-[13px] text-ink-3">
            {fmtCount(bills.length)} bills · payable open <span className="font-mono text-amb"><Money value={payable} /></span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/purchasing/pay/new"><Button variant="secondary" size="sm">Pay supplier</Button></Link>
          <Link href="/purchasing/bills/new"><Button variant="primary" size="sm">Record bill</Button></Link>
        </div>
      </div>

      <Panel flush>
        {bills.length === 0 ? (
          <EmptyState
            title="No bills yet"
            description="A supplier bill books input GST and the payable (clearing any matched GRN). Record one directly or from a received GRN."
            action={<Link href="/purchasing/bills/new"><Button variant="secondary" size="sm">Record bill</Button></Link>}
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Bill No</TH>
                <TH>Vendor Bill</TH>
                <TH>Date</TH>
                <TH>Supplier</TH>
                <TH numeric>Taxable</TH>
                <TH numeric>Tax</TH>
                <TH numeric>Total</TH>
                <TH numeric>Due</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {bills.map((b) => {
                const due = b.grandTotal - b.amountPaid;
                return (
                  <TR key={b.id} interactive>
                    <TD className="p-0">
                      <Link href={`/purchasing/bills/${b.id}`} className="block px-3 py-2.5 font-mono text-[12px] font-semibold text-brand">{b.billNo}</Link>
                    </TD>
                    <TD className="font-mono text-[11px] text-ink-3">{b.supplierBillNo ?? "—"}</TD>
                    <TD>{dateIST(b.billDate)}</TD>
                    <TD className="font-medium text-ink">{b.supplierName ?? "—"}</TD>
                    <TD numeric><Money value={b.taxableAmount} /></TD>
                    <TD numeric>{b.taxTotal > 0 ? <Money value={b.taxTotal} /> : "—"}</TD>
                    <TD numeric><Money value={b.grandTotal} /></TD>
                    <TD numeric>{due > 0.005 ? <span className="font-mono text-amb tnum"><Money value={due} /></span> : <span className="text-ink-4">—</span>}</TD>
                    <TD><StatusBadge status={b.status} /></TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Panel>
    </div>
  );
}
