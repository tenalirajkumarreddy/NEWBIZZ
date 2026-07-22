import Link from "next/link";
import { notFound } from "next/navigation";
import { getItem, listUnits, listCategories } from "@/lib/data/catalog";
import { EmptyState } from "@/components/ui/EmptyState";
import { EditItemForm } from "./EditItemForm";

export default async function EditItemPage({ params }: { params: { id: string } }) {
  const [item, units, categories] = await Promise.all([
    getItem(params.id),
    listUnits(),
    listCategories(),
  ]);
  if (!item) notFound();

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-4 px-6 py-6 lg:px-8">
      <div>
        <Link href={`/items/${item.id}`} className="text-[12px] font-medium text-ink-4 hover:text-brand">
          ← {item.sku}
        </Link>
        <h1 className="mt-1 text-[22px] font-bold tracking-tight text-ink">Edit item</h1>
      </div>
      {units.length === 0 ? (
        <EmptyState tone="error" title="No units of measure" description="Seed units before editing items." />
      ) : (
        <EditItemForm item={item} units={units} categories={categories} />
      )}
    </div>
  );
}
