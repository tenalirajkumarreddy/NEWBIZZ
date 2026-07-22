import Link from "next/link";
import { listSupplierOptions } from "@/lib/data/suppliers";
import { EmptyState } from "@/components/ui/EmptyState";
import { Panel } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PaySupplierForm } from "./PayForm";

export default async function NewPaymentPage({ searchParams }: { searchParams: { supplier?: string } }) {
  const suppliers = await listSupplierOptions();

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-4 px-6 py-6 lg:px-8">
      <div>
        <Link href="/purchasing/pay" className="text-[12px] font-medium text-ink-4 hover:text-brand">← Supplier Payments</Link>
        <h1 className="mt-1 text-[22px] font-bold tracking-tight text-ink">Pay supplier</h1>
        <p className="mt-0.5 text-[13px] text-ink-3">Settle open bills, or leave the remainder as an advance. Posts Dr Accounts Payable / Cr bank or cash.</p>
      </div>
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
    </div>
  );
}
