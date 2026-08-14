import { listItems } from "@/lib/data/catalog";
import { PageContainer, PageHeader } from "@/components/ui";
import { NewRunForm } from "./NewRunForm";

export const metadata = { title: "New Production Run — NEWBIZZ" };

export default async function NewRunPage() {
  const items = await listItems({ limit: 2000 });

  return (
    <PageContainer width="form">
      <PageHeader
        title="New Production Run"
        subtitle={`Post an atomic EOD run — inputs are auto-resolved from the active BOM.`}
        backHref="/production"
        backLabel="Production Runs"
      />
      <NewRunForm items={items} />
    </PageContainer>
  );
}
