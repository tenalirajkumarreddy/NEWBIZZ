import { getBankAccount } from "@/lib/data/bank";
import { notFound } from "next/navigation";
import { ImportStatement } from "./ImportStatement";

export const metadata = { title: "Import Statement — Bank Reconciliation — NEWBIZZ" };

export default async function ImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const account = await getBankAccount(id);
  if (!account) notFound();

  return (
    <div className="mx-auto flex max-w-[800px] flex-col gap-4 px-6 py-6 lg:px-8">
      <a href={`/bank/${id}`} className="text-[13px] text-brand hover:underline">&larr; Back to {account.name}</a>
      <h1 className="text-[22px] font-bold tracking-tight text-ink">Import Statement</h1>
      <p className="text-[13px] text-ink-3">
        Paste CSV rows or upload a file. Columns: date, amount (positive for credits/inflow, negative for debits/outflow), description, reference number.
      </p>
      <ImportStatement accountId={id} accountType={account.accountType} />
    </div>
  );
}
