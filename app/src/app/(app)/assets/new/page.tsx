import { PageContainer, PageHeader } from "@/components/ui";
import { NewAssetForm } from "./NewAssetForm";

export default function NewAssetPage() {
  return (
    <PageContainer width="form">
      <PageHeader
        backHref="/assets"
        backLabel="Fixed Assets"
        title="Register asset"
        subtitle="Add a capital asset and set how it depreciates over its life."
      />
      <NewAssetForm />
    </PageContainer>
  );
}
