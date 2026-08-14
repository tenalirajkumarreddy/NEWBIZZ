import { listItems } from "@/lib/data/catalog";
import { listAlternateGroups } from "@/lib/data/bom";
import { PageContainer, PageHeader } from "@/components/ui";
import { NewBomForm } from "./NewBomForm";

export const metadata = { title: "New BOM — NEWBIZZ" };

export default async function NewBomPage() {
  const [items, altGroups] = await Promise.all([
    listItems({ limit: 2000 }),
    listAlternateGroups(),
  ]);

  return (
    <PageContainer width="form">
      <PageHeader
        backHref="/bom"
        backLabel="BOM / Recipes"
        title="New BOM"
        subtitle="Define the components needed to manufacture one item."
      />
      <NewBomForm items={items} altGroups={altGroups} />
    </PageContainer>
  );
}
