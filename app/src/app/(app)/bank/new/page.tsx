import { createBankAccount } from "@/lib/actions/bank";
import { PageContainer, PageHeader } from "@/components/ui";
import { BankAccountForm } from "./BankAccountForm";

export const metadata = { title: "Add Account — Bank Reconciliation — NEWBIZZ" };

export default function NewAccountPage() {
  return (
    <PageContainer width="formSm">
      <PageHeader backHref="/bank" backLabel="Back to Bank & Credit Cards" title="Add Account" />
      <BankAccountForm action={createBankAccount} />
    </PageContainer>
  );
}
