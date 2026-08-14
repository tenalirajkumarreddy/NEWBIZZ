import { notFound } from "next/navigation";
import { getBom } from "@/lib/data/bom";
import { listItems } from "@/lib/data/catalog";
import { listAlternateGroups } from "@/lib/data/bom";
import { PageContainer, PageHeader } from "@/components/ui";
import { EditBomForm } from "./EditBomForm";

export const metadata = { title: "Edit BOM — NEWBIZZ" };

export default async function EditBomPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const [bom, items, altGroups] = await Promise.all([
    getBom(id),
    listItems({ limit: 2000 }),
    listAlternateGroups(),
  ]);
  if (!bom) notFound();

  return (
    <PageContainer width="form">
      <PageHeader
        backHref={`/bom/${id}`}
        backLabel={bom.parentSku}
        title={`Edit BOM — ${bom.parentSku}`}
        subtitle="The existing BOM will be closed and a new version created."
      />
      <EditBomForm bom={bom} items={items} altGroups={altGroups} />
    </PageContainer>
  );
}
