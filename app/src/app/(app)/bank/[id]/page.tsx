import { getBankAccount, listTransactions, getReconReport, listImports, listAdjustments } from "@/lib/data/bank";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Money } from "@/components/ui/Money";
import { PageContainer, PageHeader } from "@/components/ui";
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
    <PageContainer>
      <PageHeader
        backHref="/bank"
        backLabel="Bank & Credit Cards"
        title={
          <span className="flex items-center gap-2.5">
            {account.name}
            <Badge tone={account.status === "active" ? "grn" : "slate"}>{account.status}</Badge>
            <Badge tone="brand">{account.accountType === "credit_card" ? "Credit Card" : "Bank"}</Badge>
          </span>
        }
        subtitle={
          account.accountType === "credit_card"
            ? (account.cardLastFour ? `•••• ${account.cardLastFour}` : "Credit Card")
            : [account.bankName, account.accountNo].filter(Boolean).join(" | ") ||
              (account.ifsc ? `IFSC: ${account.ifsc}` : "")
        }
        actions={
          <>
            {recon && (
              <div className="rounded-lg border border-line bg-fill px-3 py-1.5 text-right">
                <p className="text-[10px] font-medium uppercase tracking-wide text-ink-3">Book Balance</p>
                <p className="font-mono text-[15px] font-bold tabular-nums text-ink">
                  <Money value={recon.bookBalance ?? 0} />
                </p>
              </div>
            )}
            <Link href={`/bank/${account.id}/import`}>
              <Button variant="primary" size="sm">Import statement</Button>
            </Link>
          </>
        }
      />
      <AccountDetail
        account={account}
        transactions={transactions}
        recon={recon}
        imports={imports}
        adjustments={adjustments}
      />
    </PageContainer>
  );
}
