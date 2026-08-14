import Link from "next/link";
import { listSupplierPayments } from "@/lib/data/purchases";
import { listSupplierOptions } from "@/lib/data/suppliers";
import { Panel } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Money } from "@/components/ui/Money";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { PageContainer, PageHeader } from "@/components/ui";
import { dateIST, count as fmtCount, titleCase } from "@/lib/format";
import { CreatePayActions } from "./CreatePayActions";

export default async function PaymentsPage() {
  const payments = await listSupplierPayments({ limit: 200 });
  const suppliers = await listSupplierOptions();

  return (
    <PageContainer width="full">
      <PageHeader
        title="Supplier Payments"
        subtitle={`${fmtCount(payments.length)} payments`}
        backHref="/purchasing"
        backLabel="Purchasing"
        actions={<CreatePayActions suppliers={suppliers} />}
      />

      <Panel flush>
        {payments.length === 0 ? (
          <EmptyState
            title="No payments yet"
            description="Record a payment to settle supplier bills (Dr Accounts Payable / Cr bank or cash). Allocate it to specific bills or leave as an advance."
            action={<CreatePayActions suppliers={suppliers} />}
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
    </PageContainer>
  );
}
