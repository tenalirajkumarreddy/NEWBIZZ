import Link from "next/link";
import { notFound } from "next/navigation";
import { getCustomer } from "@/lib/data/customers";
import { listPriceLists } from "@/lib/data/catalog";
import { EmptyState } from "@/components/ui/EmptyState";
import { NewStoreForm } from "./NewStoreForm";

export default async function NewStorePage({ params }: { params: { id: string } }) {
  const [customer, priceLists] = await Promise.all([
    getCustomer(params.id),
    listPriceLists(),
  ]);
  if (!customer) notFound();

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-4 px-6 py-6 lg:px-8">
      <div>
        <Link href={`/customers/${customer.id}`} className="text-[12px] font-medium text-ink-4 hover:text-brand">
          ← {customer.name}
        </Link>
        <h1 className="mt-1 text-[22px] font-bold tracking-tight text-ink">Add store</h1>
        <p className="mt-0.5 text-[13px] text-ink-3">
          A store is a ship-to outlet under {customer.name}. Orders and deliveries target the store; money rolls up to the customer.
        </p>
      </div>
      <NewStoreForm customerId={customer.id} priceLists={priceLists} hasExistingStores={customer.stores.length > 0} />
    </div>
  );
}
