import Link from "next/link";
import { listSupplierOptions } from "@/lib/data/suppliers";
import { EmptyState } from "@/components/ui/EmptyState";
import { Panel } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageContainer, PageHeader } from "@/components/ui";
import { PaySupplierForm } from "./PayForm";

export default async function NewPaymentPage({ searchParams }: { searchParams: { supplier?: string } }) {
  const suppliers = await listSupplierOptions();

  return (
    <PageContainer width="report">
      <PageHeader
        title="Pay supplier"
        subtitle="Settle open bills, or leave the remainder as an advance. Posts Dr Accounts Payable / Cr bank or cash."
        backHref="/purchasing/pay"
        backLabel="Supplier Payments"
      />
      {suppliers.length === 0 ? (
        <Panel flush>
          <EmptyState
            title="Add a supplier first"
            description="You need at least one active supplier before recording a payment."
            action={<Link href="/suppliers/new"><Button variant="secondary" size="sm">Add a supplier</Button></Link>}
          />
        </Panel>
      ) : (
        <PaySupplierForm suppliers={suppliers} initialSupplierId={searchParams.supplier} />
      )}
    </PageContainer>
  );
}
