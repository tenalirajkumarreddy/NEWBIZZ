import Link from "next/link";
import { listSupplierOptions } from "@/lib/data/suppliers";
import { listStockableItems } from "@/lib/data/stock";
import { EmptyState } from "@/components/ui/EmptyState";
import { Panel } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageContainer, PageHeader } from "@/components/ui";
import { NewBillForm } from "./BillForm";

export default async function NewBillPage() {
  const [suppliers, items] = await Promise.all([listSupplierOptions(), listStockableItems()]);

  return (
    <PageContainer width="report">
      <PageHeader
        title="Record supplier bill"
        subtitle={<>Books input GST and the payable. To bill received goods instead, use &ldquo;Create bill&rdquo; on the GRN.</>}
        backHref="/purchasing/bills"
        backLabel="Supplier Bills"
      />
      {suppliers.length === 0 ? (
        <Panel flush>
          <EmptyState
            title="Add a supplier first"
            description="You need at least one active supplier before recording a bill."
            action={<Link href="/suppliers/new"><Button variant="secondary" size="sm">Add a supplier</Button></Link>}
          />
        </Panel>
      ) : (
        <NewBillForm suppliers={suppliers} items={items} />
      )}
    </PageContainer>
  );
}
