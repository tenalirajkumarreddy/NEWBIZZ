import { listCheques } from "@/lib/data/bank";
import { PageContainer, PageHeader } from "@/components/ui";
import { ChequeRegister } from "./ChequeRegister";

export const metadata = { title: "Cheque Register — Bank Reconciliation — NEWBIZZ" };
export const dynamic = "force-dynamic";

export default async function ChequesPage() {
  const cheques = await listCheques();
  return (
    <PageContainer>
      <PageHeader backHref="/bank" backLabel="Back to Bank & Credit Cards" title="Cheque Register" />
      <ChequeRegister cheques={cheques} />
    </PageContainer>
  );
}
