import Link from "next/link";
import { listUnits, listCategories } from "@/lib/data/catalog";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageContainer, PageHeader } from "@/components/ui";
import { NewItemForm } from "./NewItemForm";

export default async function NewItemPage() {
  const [units, categories] = await Promise.all([listUnits(), listCategories()]);

  return (
    <PageContainer width="form">
      <PageHeader
        title="New item"
        subtitle="Add a finished good, raw material, consumable, or service to the catalog."
        backHref="/items"
        backLabel="Item Master"
      />

      {units.length === 0 ? (
        <EmptyState
          tone="error"
          title="No units of measure"
          description="Seed at least one unit (e.g. PCS, CASE) before adding items."
        />
      ) : (
        <NewItemForm units={units} categories={categories} />
      )}
    </PageContainer>
  );
}
