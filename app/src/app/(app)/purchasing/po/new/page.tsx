import Link from "next/link";
import { listSupplierOptions } from "@/lib/data/suppliers";
import { listStockableItems } from "@/lib/data/stock";
import { EmptyState } from "@/components/ui/EmptyState";
import { Panel } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { NewPoForm } from "./PoForm";

export default async function NewPoPage() {
  const [suppliers, items] = await Promise.all([listSupplierOptions(), listStockableItems()]);

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-4 px-6 py-6 lg:px-8">
      <div>
        <Link href="/purchasing/po" className="text-[12px] font-medium text-ink-4 hover:text-brand">← Purchase Orders</Link>
        <h1 className="mt-1 text-[22px] font-bold tracking-tight text-ink">New purchase order</h1>
        <p className="mt-0.5 text-[13px] text-ink-3">Record intent to buy. No stock or ledger moves until goods are received and billed.</p>
      </div>
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
    </div>
  );
}
