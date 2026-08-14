import { getCreditRegister, summariseCredit } from "@/lib/data/credit";
import { PageContainer, PageHeader } from "@/components/ui";
import { CreditManagementPage } from "./CreditManagementPage";

export const metadata = { title: "Credit Management — NEWBIZZ" };
export const dynamic = "force-dynamic";

export default async function CreditPage() {
  const rows = await getCreditRegister();
  const summary = summariseCredit(rows);

  return (
    <PageContainer width="full">
      <PageHeader
        title="Credit Management"
        subtitle="Customer limits, payment terms, utilisation and over-limit exposure."
      />
      <CreditManagementPage rows={rows} summary={summary} />
    </PageContainer>
  );
}
