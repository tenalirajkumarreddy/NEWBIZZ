import Link from "next/link";
import { listSupplierOptions } from "@/lib/data/suppliers";
import { listStockableItems } from "@/lib/data/stock";
import { EmptyState } from "@/components/ui/EmptyState";
import { Panel } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { NewGrnForm } from "./GrnForm";

export default async function NewGrnPage() {
  const [suppliers, items] = await Promise.all([listSupplierOptions(), listStockableItems()]);

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-4 px-6 py-6 lg:px-8">
      <div>
        <Link href="/purchasing/grn" className="text-[12px] font-medium text-ink-4 hover:text-brand">← Goods Receipts</Link>
        <h1 className="mt-1 text-[22px] font-bold tracking-tight text-ink">Receive goods</h1>
        <p className="mt-0.5 text-[13px] text-ink-3">Books received goods into stock at cost. Ex-GST — the bill books input tax and the payable.</p>
      </div>
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
    </div>
  );
}
