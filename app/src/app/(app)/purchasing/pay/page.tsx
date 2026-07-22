import Link from "next/link";
import { listSupplierPayments } from "@/lib/data/purchases";
import { Panel } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Money } from "@/components/ui/Money";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { dateIST, count as fmtCount, titleCase } from "@/lib/format";

export default async function PaymentsPage() {
  const payments = await listSupplierPayments({ limit: 200 });

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-6 py-6 lg:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/purchasing" className="text-[12px] font-medium text-ink-4 hover:text-brand">← Purchasing</Link>
          <h1 className="mt-1 text-[22px] font-bold tracking-tight text-ink">Supplier Payments</h1>
          <p className="mt-0.5 text-[13px] text-ink-3">{fmtCount(payments.length)} payments</p>
        </div>
        <Link href="/purchasing/pay/new"><Button variant="primary" size="sm">Pay supplier</Button></Link>
      </div>

      <Panel flush>
        {payments.length === 0 ? (
          <EmptyState
            title="No payments yet"
            description="Record a payment to settle supplier bills (Dr Accounts Payable / Cr bank or cash). Allocate it to specific bills or leave as an advance."
            action={<Link href="/purchasing/pay/new"><Button variant="secondary" size="sm">Pay supplier</Button></Link>}
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Payment No</TH>
                <TH>Date</TH>
                <TH>Supplier</TH>
                <TH>Mode</TH>
                <TH>Reference</TH>
                <TH numeric>Amount</TH>
                <TH numeric>Allocated</TH>
              </TR>
            </THead>
            <TBody>
              {payments.map((p) => {
                const advance = p.amount - p.allocatedAmount;
                return (
                  <TR key={p.id}>
                    <TD className="font-mono text-[12px] font-semibold text-ink">{p.paymentNo}</TD>
                    <TD>{dateIST(p.paymentDate)}</TD>
                    <TD className="font-medium text-ink">{p.supplierName ?? "—"}</TD>
                    <TD><Badge tone="slate" size="sm">{titleCase(p.mode)}</Badge></TD>
                    <TD className="font-mono text-[11px] text-ink-3">{p.reference ?? "—"}</TD>
                    <TD numeric><Money value={p.amount} /></TD>
                    <TD numeric>
                      <Money value={p.allocatedAmount} />
                      {advance > 0.005 && <span className="ml-1 font-mono text-[10px] text-amb">+{advance.toFixed(0)} adv</span>}
                    </TD>
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
