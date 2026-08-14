import Link from "next/link";
import { listSupplierOptions } from "@/lib/data/suppliers";
import { listStockableItems } from "@/lib/data/stock";
import { EmptyState } from "@/components/ui/EmptyState";
import { Panel } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageContainer, PageHeader } from "@/components/ui";
import { NewPoForm } from "./PoForm";

export default async function NewPoPage() {
  const [suppliers, items] = await Promise.all([listSupplierOptions(), listStockableItems()]);

  return (
    <PageContainer width="report">
      <PageHeader
        title="New purchase order"
        subtitle="Record intent to buy. No stock or ledger moves until goods are received and billed."
        backHref="/purchasing/po"
        backLabel="Purchase Orders"
      />
      {suppliers.length === 0 ? (
        <Panel flush>
          <EmptyState
            title="Add a supplier first"
            description="You need at least one active supplier before raising a purchase order."
            action={<Link href="/suppliers/new"><Button variant="secondary" size="sm">Add a supplier</Button></Link>}
          />
        </Panel>
      ) : (
        <NewPoForm suppliers={suppliers} items={items} />
      )}
    </PageContainer>
  );
}
