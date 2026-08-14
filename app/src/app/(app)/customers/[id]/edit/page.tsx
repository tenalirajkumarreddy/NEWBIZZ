import Link from "next/link";
import { notFound } from "next/navigation";
import { getCustomer } from "@/lib/data/customers";
import { PageContainer, PageHeader } from "@/components/ui";
import { EditCustomerForm } from "./EditCustomerForm";

export default async function EditCustomerPage({ params }: { params: { id: string } }) {
  const customer = await getCustomer(params.id);
  if (!customer) notFound();

  return (
    <PageContainer width="form">
      <PageHeader
        title="Edit customer"
        subtitle={<>Code <span className="font-mono">{customer.code}</span> is fixed — everything else can change.</>}
        backHref={`/customers/${customer.id}`}
        backLabel={customer.name}
      />
      <EditCustomerForm customer={customer} />
    </PageContainer>
  );
}
