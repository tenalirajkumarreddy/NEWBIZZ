import Link from "next/link";
import { listCustomers } from "@/lib/data/customers";
import { listPriceLists } from "@/lib/data/catalog";
import { PageContainer, PageHeader } from "@/components/ui";
import { StorePickerForm } from "./StorePickerForm";

export default async function StandaloneNewStorePage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>;
}) {
  const sp = await searchParams;
  const [customers, priceLists] = await Promise.all([
    listCustomers({ limit: 1000 }),
    listPriceLists(),
  ]);

  return (
    <PageContainer width="form">
      <PageHeader
        title="New store"
        subtitle={<>Add a ship-to store under an existing customer. Need a new customer first? <Link href="/customers/new" className="text-brand hover:underline">Create a customer</Link>.</>}
        backHref="/customers"
        backLabel="Customers"
      />
      <StorePickerForm
        customers={customers.map((c) => ({ id: c.id, code: c.code, name: c.name }))}
        priceLists={priceLists}
        initialCustomerId={sp.customer ?? ""}
      />
    </PageContainer>
  );
}
