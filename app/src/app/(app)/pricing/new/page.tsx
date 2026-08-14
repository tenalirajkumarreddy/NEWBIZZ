import { PageContainer, PageHeader } from "@/components/ui";
import { NewPriceListForm } from "./NewPriceListForm";

export default async function NewPriceListPage() {
  return (
    <PageContainer width="form">
      <PageHeader
        backHref="/pricing"
        backLabel="Rate Master"
        title="New price list"
        subtitle="Create a named price list — then add items and their selling prices to it."
      />
      <NewPriceListForm />
    </PageContainer>
  );
}
