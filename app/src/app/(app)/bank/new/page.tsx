import { createBankAccount } from "@/lib/actions/bank";
import { BankAccountForm } from "./BankAccountForm";

export const metadata = { title: "Add Account — Bank Reconciliation — NEWBIZZ" };

export default function NewAccountPage() {
  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-4 px-6 py-6 lg:px-8">
      <a href="/bank" className="text-[13px] text-brand hover:underline">&larr; Back to Bank &amp; Credit Cards</a>
      <h1 className="text-[22px] font-bold tracking-tight text-ink">Add Account</h1>
      <BankAccountForm action={createBankAccount} />
    </div>
  );
}
