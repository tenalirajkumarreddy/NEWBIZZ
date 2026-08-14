import Link from "next/link";
import { PageContainer, PageHeader } from "@/components/ui";
import { NewCustomerForm } from "./NewCustomerForm";

export default async function NewCustomerPage() {
  return (
    <PageContainer width="form">
      <PageHeader
        title="New customer"
        subtitle="Add a billing party — then add their stores to start placing orders."
        backHref="/customers"
        backLabel="Customers"
      />
      <NewCustomerForm />
    </PageContainer>
  );
}
