import Link from "next/link";
import { notFound } from "next/navigation";
import { getItem, listUnits, listCategories } from "@/lib/data/catalog";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageContainer, PageHeader } from "@/components/ui";
import { EditItemForm } from "./EditItemForm";

export default async function EditItemPage({ params }: { params: { id: string } }) {
  const [item, units, categories] = await Promise.all([
    getItem(params.id),
    listUnits(),
    listCategories(),
  ]);
  if (!item) notFound();

  return (
    <PageContainer width="form">
      <PageHeader
        title="Edit item"
        backHref={`/items/${item.id}`}
        backLabel={item.sku}
      />
      {units.length === 0 ? (
        <EmptyState tone="error" title="No units of measure" description="Seed units before editing items." />
      ) : (
        <EditItemForm item={item} units={units} categories={categories} />
      )}
    </PageContainer>
  );
}
