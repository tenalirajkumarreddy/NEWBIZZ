import Link from "next/link";
import { notFound } from "next/navigation";
import { getCustomer } from "@/lib/data/customers";
import { listPriceLists } from "@/lib/data/catalog";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageContainer, PageHeader } from "@/components/ui";
import { NewStoreForm } from "./NewStoreForm";

export default async function NewStorePage({ params }: { params: { id: string } }) {
  const [customer, priceLists] = await Promise.all([
    getCustomer(params.id),
    listPriceLists(),
  ]);
  if (!customer) notFound();

  return (
    <PageContainer width="form">
      <PageHeader
        title="Add store"
        subtitle={`A store is a ship-to outlet under ${customer.name}. Orders and deliveries target the store; money rolls up to the customer.`}
        backHref={`/customers/${customer.id}`}
        backLabel={customer.name}
      />
      <NewStoreForm customerId={customer.id} priceLists={priceLists} hasExistingStores={customer.stores.length > 0} />
    </PageContainer>
  );
}
