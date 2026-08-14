import { PageContainer, PageHeader } from "@/components/ui";
import { NewAltGroupForm } from "./NewAltGroupForm";

export const metadata = { title: "New Alternate Group — NEWBIZZ" };

export default async function NewAltGroupPage() {
  return (
    <PageContainer width="formSm">
      <PageHeader
        backHref="/bom/alternate-groups"
        backLabel="Alternate Groups"
        title="New Alternate Group"
        subtitle="Define a set of substitute items. BOM components can reference this group instead of a single item."
      />
      <NewAltGroupForm />
    </PageContainer>
  );
}
