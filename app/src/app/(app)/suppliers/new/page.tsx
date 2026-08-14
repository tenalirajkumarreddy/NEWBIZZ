import Link from "next/link";
import { PageContainer, PageHeader } from "@/components/ui";
import { NewSupplierForm } from "./NewSupplierForm";

export default function NewSupplierPage() {
  return (
    <PageContainer width="form">
      <PageHeader
        title="New supplier"
        subtitle="Add a buy-side party — then build its Approved Vendor List and start purchasing."
        backHref="/suppliers"
        backLabel="Suppliers"
      />
      <NewSupplierForm />
    </PageContainer>
  );
}
