import Link from "next/link";
import { listSupplierOptions } from "@/lib/data/suppliers";
import { listStockableItems } from "@/lib/data/stock";
import { EmptyState } from "@/components/ui/EmptyState";
import { Panel } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageContainer, PageHeader } from "@/components/ui";
import { NewDebitNoteForm } from "./DebitNoteForm";

export default async function NewDebitNotePage() {
  const [suppliers, items] = await Promise.all([listSupplierOptions(), listStockableItems()]);

  return (
    <PageContainer width="report">
      <PageHeader
        title="New debit note"
        subtitle="Return goods to a supplier: reduces the payable and reverses RM inventory + input GST."
        backHref="/purchasing/debit-notes"
        backLabel="Debit Notes"
      />
      {suppliers.length === 0 ? (
        <Panel flush>
          <EmptyState
            title="Add a supplier first"
            description="You need at least one active supplier before recording a purchase return."
            action={<Link href="/suppliers/new"><Button variant="secondary" size="sm">Add a supplier</Button></Link>}
          />
        </Panel>
      ) : (
        <NewDebitNoteForm suppliers={suppliers} items={items} />
      )}
    </PageContainer>
  );
}
