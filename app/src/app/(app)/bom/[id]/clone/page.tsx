import { notFound } from "next/navigation";
import { getBom } from "@/lib/data/bom";
import { listItems } from "@/lib/data/catalog";
import { listAlternateGroups } from "@/lib/data/bom";
import { PageContainer, PageHeader } from "@/components/ui";
import { CloneBomForm } from "./CloneBomForm";

export const metadata = { title: "Clone BOM — NEWBIZZ" };

export default async function CloneBomPage(props: { params: Promise<{ id: string }> }) {
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
        title={`Clone BOM — ${bom.parentSku}`}
        subtitle="Create a new BOM pre-filled with the same structure as the existing one."
      />
      <CloneBomForm bom={bom} items={items} altGroups={altGroups} />
    </PageContainer>
  );
}
