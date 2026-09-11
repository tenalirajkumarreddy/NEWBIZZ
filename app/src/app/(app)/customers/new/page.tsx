import Link from "next/link";
import { PageContainer, PageHeader } from "@/components/ui";
import { listPriceLists } from "@/lib/data/catalog";
import { NewCustomerForm } from "./NewCustomerForm";

export default async function NewCustomerPage() {
  const priceLists = await listPriceLists();

  return (
    <PageContainer width="form">
      <PageHeader
        title="New customer"
        subtitle="Add a billing party — then add their stores to start placing orders."
        backHref="/customers"
        backLabel="Customers"
      />
      <NewCustomerForm priceLists={priceLists} />
    </PageContainer>
  );
}
