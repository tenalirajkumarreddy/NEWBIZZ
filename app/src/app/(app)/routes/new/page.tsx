import { PageContainer, PageHeader } from "@/components/ui";
import { RouteForm } from "./RouteForm";

export const metadata = { title: "New Route — NEWBIZZ" };

export default function NewRoutePage() {
  return (
    <PageContainer width="narrow">
      <PageHeader title="New Route" backHref="/routes" backLabel="Routes" />
      <RouteForm />
    </PageContainer>
  );
}
