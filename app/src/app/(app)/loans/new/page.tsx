import { PageContainer, PageHeader } from "@/components/ui";
import { NewLoanForm } from "./NewLoanForm";

export default function NewLoanPage() {
  return (
    <PageContainer width="form">
      <PageHeader
        title="Add loan"
        subtitle="Records the loan and generates its reducing-balance EMI schedule."
        backHref="/loans"
        backLabel="Loans &amp; EMI"
      />
      <NewLoanForm />
    </PageContainer>
  );
}
