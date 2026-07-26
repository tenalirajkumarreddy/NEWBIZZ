import Link from "next/link";
import { listItems } from "@/lib/data/catalog";
import { listAlternateGroups } from "@/lib/data/bom";
import { NewBomForm } from "./NewBomForm";

export const metadata = { title: "New BOM — NEWBIZZ" };

export default async function NewBomPage() {
  const [items, altGroups] = await Promise.all([
    listItems({ limit: 2000 }),
    listAlternateGroups(),
  ]);

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-4 px-6 py-6 lg:px-8">
      <div>
        <Link href="/bom" className="text-[12px] font-medium text-ink-4 hover:text-brand">
          ← BOM / Recipes
        </Link>
        <h1 className="mt-1 text-[22px] font-bold tracking-tight text-ink">New BOM</h1>
        <p className="mt-0.5 text-[13px] text-ink-3">
          Define the components needed to manufacture one item.
        </p>
      </div>
      <NewBomForm items={items} altGroups={altGroups} />
    </div>
  );
}
