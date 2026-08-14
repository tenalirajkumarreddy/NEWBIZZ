import { getBankAccount } from "@/lib/data/bank";
import { notFound } from "next/navigation";
import { PageContainer, PageHeader } from "@/components/ui";
import { ImportStatement } from "./ImportStatement";

export const metadata = { title: "Import Statement — Bank Reconciliation — NEWBIZZ" };

export default async function ImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const account = await getBankAccount(id);
  if (!account) notFound();

  return (
    <PageContainer width="form">
      <PageHeader
        backHref={`/bank/${id}`}
        backLabel={account.name}
        title="Import Statement"
        subtitle="Paste CSV rows or upload a file. Columns: date, amount (positive for credits/inflow, negative for debits/outflow), description, reference number."
      />
      <ImportStatement accountId={id} accountType={account.accountType} />
    </PageContainer>
  );
}
