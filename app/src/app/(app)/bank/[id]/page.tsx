import { getBankAccount, listTransactions, getReconReport, listImports, listAdjustments } from "@/lib/data/bank";
import { notFound } from "next/navigation";
import { AccountDetail } from "./AccountDetail";

export const metadata = { title: "Account Detail — Bank Reconciliation — NEWBIZZ" };
export const dynamic = "force-dynamic";

export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [account, transactions, recon, imports, adjustments] = await Promise.all([
    getBankAccount(id),
    listTransactions(id, { limit: 100 }),
    getReconReport(id),
    listImports(id),
    listAdjustments(id),
  ]);
  if (!account) notFound();

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-6 py-6 lg:px-8">
      <a href="/bank" className="text-[13px] text-brand hover:underline">&larr; Back to Bank &amp; Credit Cards</a>
      <AccountDetail
        account={account}
        transactions={transactions}
        recon={recon}
        imports={imports}
        adjustments={adjustments}
      />
    </div>
  );
}
