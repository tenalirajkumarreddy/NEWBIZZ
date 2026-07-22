import Link from "next/link";
import { listUnits, listCategories } from "@/lib/data/catalog";
import { EmptyState } from "@/components/ui/EmptyState";
import { NewItemForm } from "./NewItemForm";

export default async function NewItemPage() {
  const [units, categories] = await Promise.all([listUnits(), listCategories()]);

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-4 px-6 py-6 lg:px-8">
      <div>
        <Link href="/items" className="text-[12px] font-medium text-ink-4 hover:text-brand">
          ← Item Master
        </Link>
        <h1 className="mt-1 text-[22px] font-bold tracking-tight text-ink">New item</h1>
        <p className="mt-0.5 text-[13px] text-ink-3">
          Add a finished good, raw material, consumable, or service to the catalog.
        </p>
      </div>

      {units.length === 0 ? (
        <EmptyState
          tone="error"
          title="No units of measure"
          description="Seed at least one unit (e.g. PCS, CASE) before adding items."
        />
      ) : (
        <NewItemForm units={units} categories={categories} />
      )}
    </div>
  );
}
