import { getDocuments } from "@/lib/data/documents";
import { PageContainer, PageHeader } from "@/components/ui";
import { DocumentsView } from "./DocumentsView";

export const metadata = { title: "Documents — NEWBIZZ" };
export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const page = await getDocuments({});

  return (
    <PageContainer width="full">
      <PageHeader title="Documents" subtitle="Central vault for files attached to any record." />
      <DocumentsView initial={page} />
    </PageContainer>
  );
}