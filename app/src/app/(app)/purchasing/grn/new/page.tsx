import Link from "next/link";
import { listSupplierOptions } from "@/lib/data/suppliers";
import { listStockableItems } from "@/lib/data/stock";
import { EmptyState } from "@/components/ui/EmptyState";
import { Panel } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageContainer, PageHeader } from "@/components/ui";
import { NewGrnForm } from "./GrnForm";

export default async function NewGrnPage() {
  const [suppliers, items] = await Promise.all([listSupplierOptions(), listStockableItems()]);

  return (
    <PageContainer width="report">
      <PageHeader
        title="Receive goods"
        subtitle="Books received goods into stock at cost. Ex-GST — the bill books input tax and the payable."
        backHref="/purchasing/grn"
        backLabel="Goods Receipts"
      />
      {suppliers.length === 0 ? (
        <Panel flush>
          <EmptyState
            title="Add a supplier first"
            description="You need at least one active supplier before receiving goods."
            action={<Link href="/suppliers/new"><Button variant="secondary" size="sm">Add a supplier</Button></Link>}
          />
        </Panel>
      ) : (
        <NewGrnForm suppliers={suppliers} items={items} />
      )}
    </PageContainer>
  );
}
